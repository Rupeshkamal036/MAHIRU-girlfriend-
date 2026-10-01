import { GoogleGenAI, Type, type Schema } from '@google/genai';
import type {
  MemoryCandidate,
  MemoryExtractionInput,
  MemoryExtractionResult,
  MemoryCategory,
  MemoryPriority,
  SemanticMemoryCategory,
} from '../src/types';
import {
  MEMORY_CATEGORIES,
  classifyMemorySemantic,
  splitCompoundFacts,
  cleanEntityValue,
  isSemanticCategory,
  normalizeToSemanticCategory,
} from './memoryCategorySchema';
import { isExplicitSaveCommand } from './automaticMemorySaving';

/**
 * Memory Extraction Engine (Step 1.1: Safety & Classification Hardened)
 * 
 * Analyzes conversation text and produces STRUCTURED MEMORY CANDIDATES.
 * 
 * STRICT ARCHITECTURAL INVARIANTS:
 * 1. This engine ONLY extracts and structures candidates.
 * 2. It NEVER writes, updates, deletes, or persists anything to Firestore or any database.
 * 3. It REJECTS all sensitive secrets, credentials, API keys, tokens, and passwords.
 */

// Normalized categories aligned with rich 17-category MemoryStore schema
export const VALID_CATEGORIES: MemoryCategory[] = [
  ...MEMORY_CATEGORIES,
  'USER_PROFILE',
  'PREFERENCES',
  'GOALS_AND_PROJECTS',
  'CONVERSATION',
];

/**
 * Patterns matching statements or fragments declaring sensitive secrets/credentials.
 * ZERO TOLERANCE: Any statement containing or declaring credentials must produce ZERO candidates.
 */
const SENSITIVE_INPUT_PATTERNS: RegExp[] = [
  /\b(?:api[_\s-]?key|secret[_\s-]?key|private[_\s-]?key|access[_\s-]?token|auth[_\s-]?token|bearer[_\s-]?token|client[_\s-]?secret|service[_\s-]?account(?:[_\s-]?key)?|jwt[_\s-]?token|refresh[_\s-]?token)\b/i,
  /\b(?:password|passcode|code[_\s-]?word|secret[_\s-]?phrase|secret[_\s-]?word|security[_\s-]?word|recovery[_\s-]?phrase|seed[_\s-]?phrase|credit[_\s-]?card|debit[_\s-]?card|cvv|security[_\s-]?pin|auth[_\s-]?pin|numeric[_\s-]?pin)\b/i,
  /\b(?:my|mera|meri|apna|the|here\s+is\s+my|use\s+my)\s+(?:api[_\s-]?key|password|secret|token|passcode|codeword|code\s*word|secret\s*word|security\s*word|private[_\s-]?key|pin|security\s*pin)\b/i,
  /\b(?:codeword|code\s*word|secret\s*word|security\s*word)\b/i,
  /\b[\w\-.'"]+\s+(?:is\s+my|is\s+the|mera)\s+(?:codeword|code\s*word|secret\s*word|security\s*word)\b/i,
  /\bpin\s*(?:is|:|equals|=|hai)?\s*\d{4,8}\b/i,
  /\bpin\s+\d{4,8}\s*(?:hai|is)?\b/i,
  /\b\d{4,8}\s+(?:is\s+my|is\s+the|mera)\s+pin\b/i,
  /\bpin\s+(?:is|hai|tha)\b/i,
  /\b(?:pin|pincode)\s*[:=]\s*\d{4,8}\b/i,
  /\b(?:sk-[a-zA-Z0-9]{15,}|AIza[0-9A-Za-z-_]{30,}|ghp_[a-zA-Z0-9]{15,}|[a-zA-Z0-9_-]{32,})\b/,
];

/**
 * Checks if input text contains or declares sensitive credentials that should NEVER become memories.
 */
export function containsSensitiveCredentials(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  return SENSITIVE_INPUT_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Specific keys that are strictly forbidden from becoming permanent memories.
 */
const FORBIDDEN_KEYS_PATTERN = /^(?:codeword|code_word|user_codeword|user_code_word|security_word|secret_word|favorite_word|favourite_word|fav_word|pin|user_pin|security_pin|auth_pin|numeric_pin|password|passcode)$/i;

/**
 * Keywords and patterns that identify sensitive fields in extracted candidates.
 */
const SENSITIVE_FIELD_PATTERNS: RegExp[] = [
  /\b(?:api[_\s-]?key|secret[_\s-]?key|private[_\s-]?key|access[_\s-]?token|auth[_\s-]?token|bearer[_\s-]?token|client[_\s-]?secret|service[_\s-]?account|credential|credentials|password|passcode|code[_\s-]?word|secret[_\s-]?word|security[_\s-]?word|favorite[_\s-]?word|favourite[_\s-]?word|cvv|pin|user[_\s-]?pin|security[_\s-]?pin|numeric[_\s-]?pin|token|secret)\b/i,
  /\b(?:authentication|authenticat(?:e|ing|ion))\b/i,
  /\b(?:security\s+codeword|codeword\s+starts\s+with|for\s+authentication|security\s+word\s+is|pin\s+is\s+(?:four|\d+)\s+digits|numeric\s+pin)\b/i,
];

/**
 * Validates that an extracted candidate does not contain or refer to sensitive credentials.
 */
export function isCandidateSensitive(candidate: MemoryCandidate): boolean {
  if (!candidate) return true;
  const key = String(candidate.key || '').toLowerCase();
  const val = String(candidate.value || '').toLowerCase();
  const cat = String(candidate.category || '').toUpperCase();
  const reason = String(candidate.reason || '').toLowerCase();

  // Category checks
  if (cat === 'SYSTEM' || cat.includes('SECRET') || cat.includes('CREDENTIAL') || cat.includes('SECURITY')) {
    return true;
  }

  // Exact forbidden key checks
  if (FORBIDDEN_KEYS_PATTERN.test(key)) {
    return true;
  }

  // Key checks
  for (const pattern of SENSITIVE_FIELD_PATTERNS) {
    if (pattern.test(key)) return true;
  }

  // Value checks
  for (const pattern of SENSITIVE_FIELD_PATTERNS) {
    if (pattern.test(val)) return true;
  }

  // Reason checks
  for (const pattern of SENSITIVE_FIELD_PATTERNS) {
    if (pattern.test(reason)) return true;
  }

  // Secret token format checks
  if (/^(?:sk-[a-zA-Z0-9]{15,}|AIza[0-9A-Za-z-_]{30,}|ghp_[a-zA-Z0-9]{15,}|eyJ[a-zA-Z0-9_-]{10,})$/.test(candidate.value)) {
    return true;
  }

  return false;
}

/**
 * Deterministic pattern rules for common user declarations (English, Hindi, Hinglish).
 * Functions as an instant offline/local detector and a dependable fallback.
 */
interface RuleExtractor {
  category: MemoryCategory;
  key: string;
  priority: MemoryPriority;
  patterns: RegExp[];
  confidence: number;
  reason: string;
  extractValue: (match: RegExpExecArray) => string | null;
}

const EXTRACTION_RULES: RuleExtractor[] = [
  // 1. User Name (personal_profile)
  {
    category: 'personal_profile',
    key: 'user_name',
    priority: 'HIGH',
    confidence: 1.0,
    reason: 'User explicitly stated their name',
    patterns: [
      /(?:my name is|i am called|call me|you can call me)\s+([A-Za-z0-9_-]+)/i,
      /(?:mera naam|mujhe|mera name)\s+([A-Za-z0-9_-]+)\s*(?:hai|bolte|bulaya|hai)/i,
    ],
    extractValue: (m) => m[1]?.trim() || null,
  },
  // 2. Favorite Anime (watching_entertainment)
  {
    category: 'watching_entertainment',
    key: 'favorite_anime',
    priority: 'HIGH',
    confidence: 0.95,
    reason: 'User stated their favorite anime',
    patterns: [
      /(?:my favorite anime is|favorite anime is|i love the anime|my fav anime is)\s+([^.,!?;]+)/i,
      /(?:mera favorite anime|mera fav anime)\s+([^.,!?;]+?)(?:\s+hai|\s+lagta|$)/i,
      /(?:mujhe)\s+([^.,!?;]+?)(?:\s+anime\s+pasand\s+hai)/i,
    ],
    extractValue: (m) => cleanEntityValue(m[1] || ''),
  },
  // 2b. Favorite Movie (watching_entertainment)
  {
    category: 'watching_entertainment',
    key: 'favorite_movie',
    priority: 'HIGH',
    confidence: 0.95,
    reason: 'User stated their favorite movie',
    patterns: [
      /(?:my\s+(?:favorite|favourite|fav)\s+movies?\s+is|favorite\s+movies?\s+is|i\s+love\s+the\s+movies?)\s+([^.,!?;]+)/i,
      /(?:mera|meri)\s+(?:favorite|favourite|fav)\s+movies?\s+([^.,!?;]+?)(?:\s+hai|\s+lagta|$)/i,
      /(?:mujhe)\s+([^.,!?;]+?\s+movies?)(?:\s+dekhna\s+pasand\s+hai|\s+pasand\s+hai)/i,
      /(?:mujhe)\s+([^.,!?;]+?)(?:\s+movies?\s+dekhna\s+pasand\s+hai|\s+movies?\s+pasand\s+hai)/i,
    ],
    extractValue: (m) => cleanEntityValue(m[1] || ''),
  },
  // 2c. Favorite Drama / Series (watching_entertainment)
  {
    category: 'watching_entertainment',
    key: 'favorite_drama',
    priority: 'HIGH',
    confidence: 0.95,
    reason: 'User stated their favorite drama or show',
    patterns: [
      /(?:my\s+(?:favorite|favourite|fav)\s+(?:drama|kdrama|series|tv\s*show)\s+is)\s+([^.,!?;]+)/i,
      /(?:mera|meri)\s+(?:favorite|favourite|fav)\s+(?:drama|kdrama|series)\s+([^.,!?;]+?)(?:\s+hai|\s+lagta|$)/i,
      /(?:mujhe)\s+([^.,!?;]+?\s+(?:drama|kdrama|series))(?:\s+dekhna\s+pasand\s+hai|\s+pasand\s+hai)/i,
      /(?:mujhe)\s+([^.,!?;]+?)(?:\s+(?:drama|kdrama|series)\s+dekhna\s+pasand\s+hai|\s+(?:drama|kdrama|series)\s+pasand\s+hai)/i,
    ],
    extractValue: (m) => cleanEntityValue(m[1] || ''),
  },
  // 3. Favorite Food / Dish (food)
  {
    category: 'food',
    key: 'favorite_food',
    priority: 'HIGH',
    confidence: 0.95,
    reason: 'User stated their favorite food or dish',
    patterns: [
      /(?:my favorite food is|my favorite dish is|my fav food is|i love eating)\s+([^.,!?;]+)/i,
      /(?:mera favorite khana|meri favorite dish|mujhe khane me)\s+([^.,!?;]+?)(?:\s+bohot pasand hai|\s+pasand hai|\s+hai|$)/i,
      /(?:mujhe)\s+([^.,!?;]+?)(?:\s+khana\s+pasand\s+hai)/i,
    ],
    extractValue: (m) => cleanEntityValue(m[1] || ''),
  },
  // 4. Favorite Drinks / Beverage (drinks)
  {
    category: 'drinks',
    key: 'favorite_drink',
    priority: 'HIGH',
    confidence: 0.95,
    reason: 'User stated their beverage preference',
    patterns: [
      /(?:my favorite drink is|my favorite beverage is|i love drinking)\s+([^.,!?;]+)/i,
      /(?:mera favorite drink|mujhe peene me)\s+([^.,!?;]+?)(?:\s+bohot pasand hai|\s+pasand hai|\s+hai|$)/i,
      /(?:mujhe)\s+([^.,!?;]+?)(?:\s+peena\s+pasand\s+hai)/i,
    ],
    extractValue: (m) => cleanEntityValue(m[1] || ''),
  },
  // 5. Favorite Game (gaming)
  {
    category: 'gaming',
    key: 'favorite_game',
    priority: 'HIGH',
    confidence: 0.95,
    reason: 'User stated their gaming preference',
    patterns: [
      /(?:my favorite game is|i love playing)\s+([^.,!?;]+)/i,
      /(?:mera favorite game)\s+([^.,!?;]+?)(?:\s+bohot pasand hai|\s+pasand hai|\s+hai|$)/i,
      /(?:mujhe)\s+([^.,!?;]+?)(?:\s+khelna\s+pasand\s+hai)/i,
    ],
    extractValue: (m) => cleanEntityValue(m[1] || ''),
  },
  // 6. Learning / Study Interest (learning)
  {
    category: 'learning',
    key: 'learning_interest',
    priority: 'HIGH',
    confidence: 0.95,
    reason: 'User stated their learning goal or study interest',
    patterns: [
      /(?:i want to learn|i love learning|i am studying|my goal is to learn)\s+([^.,!?;]+)/i,
      /(?:mujhe)\s+([^.,!?;]+?)(?:\s+seekhna\s+pasand\s+hai|\s+seekhna\s+hai|\s+padhna\s+hai)/i,
    ],
    extractValue: (m) => cleanEntityValue(m[1] || ''),
  },
  // 7. Travel Destination (travel)
  {
    category: 'travel',
    key: 'travel_destination',
    priority: 'HIGH',
    confidence: 0.95,
    reason: 'User stated their travel interest or destination',
    patterns: [
      /(?:i want to travel to|i want to visit|my dream destination is)\s+([^.,!?;]+)/i,
      /(?:mujhe)\s+([^.,!?;]+?)(?:\s+travel\s+karna\s+hai|\s+ghoomna\s+hai|\s+ghoomna\s+pasand\s+hai|\s+jana\s+hai)/i,
    ],
    extractValue: (m) => cleanEntityValue(m[1] || ''),
  },
  // 8. Disliked Food (food)
  {
    category: 'food',
    key: 'disliked_food',
    priority: 'MEDIUM',
    confidence: 0.9,
    reason: 'User expressed strong dislike for specific food',
    patterns: [
      /(?:i hate eating|i dislike|i do not like to eat|i cant stand)\s+([^.,!?;]+)/i,
      /(?:mujhe khane me|mujhe)\s+([^.,!?;]+?)(?:\s+bilkul pasand nahi|\s+pasand nahi hai)/i,
    ],
    extractValue: (m) => cleanEntityValue(m[1] || ''),
  },
  // 9. Profession / Job (personal_profile)
  {
    category: 'personal_profile',
    key: 'occupation',
    priority: 'HIGH',
    confidence: 0.9,
    reason: 'User shared their professional occupation',
    patterns: [
      /(?:i work as a|i am a professional|my job is|i work at|my profession is)\s+([^.,!?;]+)/i,
      /(?:mai ek|main ek)\s+([^.,!?;]+?)(?:\s+hu|\s+hoon|\s+ka kaam karta)/i,
    ],
    extractValue: (m) => m[1]?.trim() || null,
  },
  // 10. Allergies (food)
  {
    category: 'food',
    key: 'allergy',
    priority: 'HIGH',
    confidence: 0.95,
    reason: 'Critical medical or dietary allergy disclosed by user',
    patterns: [
      /(?:i am allergic to|i have an allergy to)\s+([^.,!?;]+)/i,
      /(?:mujhe)\s+([^.,!?;]+?)(?:\s+se allergy hai|\s+allergy hai)/i,
    ],
    extractValue: (m) => m[1]?.trim() || null,
  },
  // 11. Pet (relationships)
  {
    category: 'relationships',
    key: 'pet',
    priority: 'MEDIUM',
    confidence: 0.9,
    reason: 'User mentioned a pet animal',
    patterns: [
      /(?:i have a pet|my pet is a|my dog's name is|my cat's name is)\s+([^.,!?;]+)/i,
      /(?:mere paas ek|mera pet)\s+([^.,!?;]+)/i,
    ],
    extractValue: (m) => m[1]?.trim() || null,
  },
  // 12. Birthday (personal_profile)
  {
    category: 'personal_profile',
    key: 'birthday',
    priority: 'HIGH',
    confidence: 0.95,
    reason: 'User stated their birthday or birth date',
    patterns: [
      /(?:my birthday is on|my birthday is)\s+([^.,!?;]+)/i,
      /(?:mera birthday|mera janamdin)\s+([^.,!?;]+?)(?:\s+ko hai|\s+hai|$)/i,
    ],
    extractValue: (m) => m[1]?.trim() || null,
  },
  // 13. Hobbies / Activities (activities)
  {
    category: 'activities',
    key: 'favorite_activity',
    priority: 'MEDIUM',
    confidence: 0.85,
    reason: 'User shared a recurring hobby or passion',
    patterns: [
      /(?:in my free time i love to|my favorite hobby is|i enjoy playing)\s+([^.,!?;]+)/i,
      /(?:mera hobby|mujhe free time me)\s+([^.,!?;]+?)(?:\s+karna pasand hai|\s+hai|$)/i,
    ],
    extractValue: (m) => m[1]?.trim() || null,
  },
  // 14. Preferred Girlfriend Nickname for Mahiru (communication_style)
  {
    category: 'communication_style',
    key: 'girlfriend_nickname',
    priority: 'MEDIUM',
    confidence: 0.9,
    reason: 'User gave a preferred affectionate nickname or term',
    patterns: [
      /(?:i will call you|from now on your nickname is|can i call you)\s+([^.,!?;]+)/i,
      /(?:mai tumhe|mai aapko)\s+([^.,!?;]+?)(?:\s+bulaunga|\s+bula sakta hu)/i,
    ],
    extractValue: (m) => m[1]?.trim() || null,
  },
  // 15. Long-term Project / Goal (goals_and_projects)
  {
    category: 'goals_and_projects',
    key: 'current_project',
    priority: 'HIGH',
    confidence: 1.0,
    reason: 'User explicitly stated working on a long-term project',
    patterns: [
      /(?:i am working on a long-term project called|working on a long-term project called|long-term project called|i am building a long-term project called)\s+([A-Za-z0-9_-]+)/i,
      /(?:i am working on a project called|my project is called)\s+([A-Za-z0-9_-]+)/i,
      /(?:mai ek long-term project pe kaam kar raha hu jiska naam|mera long-term project hai)\s+([A-Za-z0-9_-]+)/i,
    ],
    extractValue: (m) => m[1]?.trim() || null,
  },
];

/**
 * Extracts candidate memories using regex pattern rules.
 * Safe, zero-network, instantaneous.
 */
export function extractWithRules(text: string): MemoryCandidate[] {
  if (!text || typeof text !== 'string') return [];
  if (containsSensitiveCredentials(text)) return [];
  let clean = text.trim();

  // Check if user explicitly instructed saving as a new memory or explicit memory save command
  const isExplicitNew = isExplicitSaveCommand(clean);

  // Strip conversational intro prefixes like "Waise memory saving off hai, lekin "
  clean = clean.replace(
    /^(?:(?:waise|vaise|par|lekin|aur|suno|mahiru)\s+)?(?:(?:automatic\s+)?memory\s+saving\s+(?:off|band)\s+hai[,\s]*(?:lekin|par|aur|phir\s+bhi)?\s*)/i,
    ''
  ).trim();

  // Strip leading explicit memory save directive: "New memory mein save karo: ..." or "Isko new memory mein save karo ki ..."
  clean = clean.replace(
    /^(?:(?:mahiru|please|isko|ise|ye|yeh|is\s+information\s+ko)\s+)?(?:(?:new\s+|naya\s+|nayi\s+|ek\s+)?(?:permanent\s+)?memory\s*(?:mein|me|pe|par|mai)?\s*(?:save\s*karo|save\s*kar\s*do|save\s*kardo|daal\s*do|daaldo|rakh\s*lo|rakhlo|likh\s*lo|save\s*karna|yaad\s*rakho|yaad\s*rakhna)|save\s*(?:this\s+)?(?:to|in|as)\s*(?:a\s+)?(?:new\s+)?(?:permanent\s+)?memory)(?:\s+(?:ki|ke))?[\s:=,-]*/i,
    ''
  ).trim();

  // Strip trailing explicit memory save directive: "... hai, ise memory mein save karo."
  clean = clean.replace(
    /(?:[,\s]+)?(?:isko|ise|yeh|ye|is\s+information\s+ko)?\s*(?:(?:new\s+|naya\s+|nayi\s+|ek\s+)?(?:permanent\s+)?memory\s*(?:mein|me|pe|par|mai)?\s*(?:save\s*karo|save\s*kar\s*do|save\s*kardo|daal\s*do|daaldo|rakh\s*lo|rakhlo|likh\s*lo|save\s*karna|yaad\s*rakho|yaad\s*rakhna)|save\s*(?:this\s+)?(?:to|in|as)\s*(?:a\s+)?(?:new\s+)?(?:permanent\s+)?memory)[\s.?!]*$/i,
    ''
  ).trim();

  const candidates: MemoryCandidate[] = [];

  // Check for compound items: "Mujhe anime, biryani aur chai pasand hai" or "Mujhe Solo Leveling, One Punch Man aur Naruto pasand hain"
  const compoundItems = splitCompoundFacts(clean);
  if (compoundItems.length > 1) {
    for (const item of compoundItems) {
      if (item && item.length > 1 && item.length < 100) {
        const classified = classifyMemorySemantic({ content: item });
        const val = classified.normalizedValue || cleanEntityValue(item);
        if (val && val.length > 0) {
          const candidate: MemoryCandidate = {
            category: classified.category,
            semanticCategory: classified.category,
            key: classified.semanticKey,
            semanticKey: classified.semanticKey,
            value: val,
            confidence: 0.95,
            source: isExplicitNew ? 'explicit_new_memory' : 'conversation',
            reason: `Extracted compound fact from statement`,
            priority: 'HIGH',
            retention: 'PERMANENT',
          };
          (candidate as any).isExplicitNew = isExplicitNew;
          if (!isCandidateSensitive(candidate) && !candidates.some((c) => c.key === candidate.key && c.value.toLowerCase() === candidate.value.toLowerCase())) {
            candidates.push(candidate);
          }
        }
      }
    }
    if (candidates.length > 0) {
      return candidates;
    }
  }

  // Single rule evaluation
  for (const rule of EXTRACTION_RULES) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(clean);
      if (match) {
        const val = rule.extractValue(match);
        if (val && val.length > 1 && val.length < 100) {
          const classified = classifyMemorySemantic({
            content: val,
            key: rule.key,
            category: rule.category,
          });
          const effectiveCat = classified.category;
          const effectiveKey = classified.semanticKey;
          const cleanVal = classified.normalizedValue || val;

          if (!candidates.some((c) => c.key === effectiveKey && c.value.toLowerCase() === cleanVal.toLowerCase())) {
            const candidate: MemoryCandidate = {
              category: effectiveCat,
              semanticCategory: effectiveCat,
              key: effectiveKey,
              semanticKey: effectiveKey,
              value: cleanVal,
              confidence: rule.confidence,
              source: isExplicitNew ? 'explicit_new_memory' : 'conversation',
              reason: rule.reason,
              priority: rule.priority,
              retention: 'PERMANENT',
            };
            (candidate as any).isExplicitNew = isExplicitNew;
            if (!isCandidateSensitive(candidate)) {
              candidates.push(candidate);
            }
          }
          break;
        }
      }
    }
  }

  // Fallback: If no rule matched, but utterance declares preference: "Mujhe X pasand hai" / "I love X"
  if (candidates.length === 0) {
    const generalMatch = clean.match(
      /(?:(?:(?:ki|ke)\s+)?(?:mujhe|i\s+(?:like|love))|my\s+favorite\s+is)\s+([^.,!?;]+?)(?:\s+(?:bhi\s+)?(?:bohot\s+)?pasand\s+(?:hai|hain|h)|[\s.?!]*$)/i
    );
    if (generalMatch && generalMatch[1]) {
      const rawVal = generalMatch[1].trim();
      if (rawVal.length > 1 && rawVal.length < 100) {
        const classified = classifyMemorySemantic({ content: rawVal });
        const cleanVal = classified.normalizedValue || cleanEntityValue(rawVal);
        const candidate: MemoryCandidate = {
          category: classified.category,
          semanticCategory: classified.category,
          key: classified.semanticKey,
          semanticKey: classified.semanticKey,
          value: cleanVal,
          confidence: 0.9,
          source: isExplicitNew ? 'explicit_new_memory' : 'conversation',
          reason: `Semantically classified preference from statement`,
          priority: 'HIGH',
          retention: 'PERMANENT',
        };
        (candidate as any).isExplicitNew = isExplicitNew;
        if (!isCandidateSensitive(candidate)) {
          candidates.push(candidate);
        }
      }
    }
  }

  return candidates;
}

/**
 * Structured schema definition for Gemini 3.8 Flash function/structured JSON output
 */
const candidateGeminiSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    candidates: {
      type: Type.ARRAY,
      description: 'List of extracted permanent memory candidates. Empty if no long-term personal facts are present.',
      items: {
        type: Type.OBJECT,
        properties: {
          category: {
            type: Type.STRING,
            description: "Must be one of the 17 rich semantic categories: 'personal_profile', 'interests', 'watching_entertainment', 'gaming', 'food', 'drinks', 'activities', 'learning', 'travel', 'music', 'technology', 'goals_and_projects', 'relationships', 'communication_style', 'lifestyle_and_routines', 'important_facts', 'favorites'",
          },
          key: {
            type: Type.STRING,
            description: "Precise semantic identifier in snake_case (e.g. 'favorite_anime', 'favorite_food', 'favorite_drink', 'favorite_game', 'learning_interest', 'travel_destination', 'user_name', 'current_project')",
          },
          value: {
            type: Type.STRING,
            description: "The extracted fact or preference value in clean, concise format (e.g. 'Solo Leveling', 'Biryani', 'Chai', 'BGMI', 'Rupesh', 'Trading', 'Ladakh')",
          },
          confidence: {
            type: Type.NUMBER,
            description: 'Confidence score between 0.0 and 1.0 (1.0 for direct explicit statements, 0.7-0.9 for implied preferences)',
          },
          reason: {
            type: Type.STRING,
            description: 'Short rationale of why this is durable personal knowledge and not fleeting small talk',
          },
          priority: {
            type: Type.STRING,
            description: "'HIGH' for name, allergies, core preferences, projects; 'MEDIUM' for general likes; 'LOW' for minor notes",
          },
          retention: {
            type: Type.STRING,
            description: "'PERMANENT' or 'LONG_TERM'",
          },
        },
        required: ['category', 'key', 'value', 'confidence', 'reason'],
      },
    },
  },
  required: ['candidates'],
};

const EXTRACTION_SYSTEM_PROMPT = `You are the Memory Extraction Engine for MAHIRU, a caring companion AI.
Your task is to analyze conversational statements spoken by the user and extract ONLY enduring, meaningful facts that should be remembered permanently across future sessions.

CRITICAL EXTRACTION GUIDELINES:

1. USE PRECISE SEMANTIC CATEGORIES (17 DISTINCT CATEGORIES):
Do NOT put everything into 'favorites' or 'preferences'. Classify into the most specific category:
- personal_profile: Name, age, birthday, location, occupation, identity. (Key: 'user_name', 'age', 'birthday', 'location', 'occupation')
- watching_entertainment: Anime, movies, TV shows, dramas, genres. (Key: 'favorite_anime', 'favorite_movie', 'favorite_drama', 'watching_preference')
- gaming: Games, gaming preferences, play style. (Key: 'favorite_game', 'gaming_platform')
- food: Dishes, foods, cuisines, dietary likes/dislikes, allergies. (Key: 'favorite_food', 'favorite_dish', 'disliked_food', 'allergy')
- drinks: Beverages, tea, coffee, cold coffee, juices. (Key: 'favorite_drink', 'tea_preference', 'coffee_preference')
- activities: Things the user likes doing, sports, workout, hobbies. (Key: 'favorite_activity', 'workout_routine')
- learning: Things the user likes learning, study subjects, skills. (Key: 'learning_interest', 'study_subject')
- travel: Destinations, places to visit, travel interests. (Key: 'travel_destination', 'travel_plan')
- music: Artists, genres, songs, music preferences. (Key: 'music_preference', 'favorite_artist', 'favorite_song')
- technology: Tech interests, devices, programming languages, gadgets. (Key: 'tech_interest', 'favorite_device')
- goals_and_projects: Long-term goals, ongoing projects like MAHIRU. (Key: 'current_project', 'long_term_goal')
- relationships: Friends, pets, family explicitly shared. (Key: 'pet', 'friend', 'relationship_context')
- communication_style: How the user prefers Mahiru to talk, language, nicknames. (Key: 'communication_preference', 'girlfriend_nickname')
- lifestyle_and_routines: Stable routines, sleep habits. (Key: 'daily_routine', 'sleep_schedule')
- important_facts: Important stable facts not fitting elsewhere. (Key: 'important_fact')
- interests: General interests not fitting another specialized category. (Key: 'interest', 'hobby')
- favorites: ONLY as a fallback when no specific category exists (e.g. favorite_color).

2. MULTIPLE VALUES MUST REMAIN SEPARATE:
NEVER combine multiple independent values into one string.
If user says: "Mujhe Solo Leveling, One Punch Man aur Naruto pasand hain."
Extract 3 SEPARATE candidates in the array:
- candidate 1: category='watching_entertainment', key='favorite_anime', value='Solo Leveling'
- candidate 2: category='watching_entertainment', key='favorite_anime', value='One Punch Man'
- candidate 3: category='watching_entertainment', key='favorite_anime', value='Naruto'

3. MULTIPLE DIFFERENT FACTS IN ONE SENTENCE:
If one sentence contains multiple facts: "Mujhe anime dekhna, biryani khana aur chai peena pasand hai."
Extract 3 SEPARATE candidates:
- candidate 1: category='watching_entertainment', key='favorite_anime', value='anime'
- candidate 2: category='food', key='favorite_food', value='biryani'
- candidate 3: category='drinks', key='favorite_drink', value='chai'

4. WHAT NEVER TO EXTRACT (FLEETING SMALL TALK & TRANSIENT NOISE):
- Immediate current state: "I am feeling sleepy tonight", "I am eating noodles right now".
- Ephemeral reactions & greetings: "Hello Mahiru", "Good morning", "Haha that was funny", "Bye".
- Small talk: "The weather is rainy today", "What time is it?".

5. STRICT SENSITIVE CREDENTIAL BAN (ABSOLUTE RULE — ZERO TOLERANCE):
NEVER extract, store, or output security credentials, secrets, codewords, PINs, or security tokens:
- Codewords, code words, secret words, security words (e.g. "mera codeword sunflower hai")
- PINs, security PINs, numeric PINs (e.g. "mera PIN 1234 hai")
- API keys, secret keys, passwords, passcodes, OTPs
If the user shares, mentions, or verifies ANY credential, codeword, PIN, password, secret, or token:
- You MUST COMPLETELY REJECT it.
- Return EMPTY candidates list: {"candidates": []}.

6. MULTILINGUAL SUPPORT:
The user speaks English, Hindi, and Hinglish (e.g. "Mera favorite anime Naruto hai", "Mujhe chai pasand hai", "Mera naam Rupesh hai"). Accurately detect facts across all three dialects.`;

/**
 * Normalizes a category string to the canonical MemoryCategory type.
 */
function normalizeCategory(cat?: string): MemoryCategory {
  return normalizeToSemanticCategory(cat);
}

/**
 * Normalizes a priority string to the canonical MemoryPriority type.
 */
function normalizePriority(pri?: string): MemoryPriority {
  if (!pri) return 'HIGH';
  const upper = pri.trim().toUpperCase();
  if (upper === 'LOW') return 'LOW';
  if (upper === 'MEDIUM') return 'MEDIUM';
  return 'HIGH';
}

let quotaCooldownUntil = 0;

/**
 * Executes LLM-powered extraction using Gemini.
 */
async function extractWithGemini(
  text: string,
  history?: Array<{ role: string; text: string }>
): Promise<MemoryCandidate[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || Date.now() < quotaCooldownUntil) {
    return [];
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build-memory-extractor',
      },
    },
  });

  let conversationContext = '';
  if (history && history.length > 0) {
    const recent = history.slice(-4);
    conversationContext = `RECENT CONVERSATION CONTEXT:\n` +
      recent.map((h) => `${h.role}: ${h.text}`).join('\n') +
      `\n\nLATEST USER STATEMENT TO ANALYZE:\n"${text}"`;
  } else {
    conversationContext = `USER STATEMENT TO ANALYZE:\n"${text}"`;
  }

  let response: any = null;
  const candidateModels = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];

  for (const modelName of candidateModels) {
    try {
      response = await ai.models.generateContent({
        model: modelName,
        contents: conversationContext,
        config: {
          systemInstruction: EXTRACTION_SYSTEM_PROMPT,
          temperature: 0.1, // Low temperature for high precision & deterministic schema
          responseMimeType: 'application/json',
          responseSchema: candidateGeminiSchema,
        },
      });
      if (response?.text) {
        break; // Successfully generated content
      }
    } catch (err: any) {
      const errMsg = String(err?.message || '');
      const isQuotaExceeded =
        err?.status === 'RESOURCE_EXHAUSTED' ||
        err?.status === 429 ||
        err?.code === 429 ||
        errMsg.includes('429') ||
        errMsg.includes('quota') ||
        errMsg.includes('RESOURCE_EXHAUSTED');

      if (isQuotaExceeded) {
        quotaCooldownUntil = Date.now() + 60000;
        console.log('[MemoryExtractor] Gemini API rate limit reached; using rule-based extractor (cooling down for 60s).');
        return [];
      }
      continue;
    }
  }

  if (!response?.text) {
    return [];
  }

  let parsed: any = null;
  try {
    const responseText = response.text.trim();
    parsed = JSON.parse(responseText);
  } catch {
    return [];
  }

  if (!parsed || !Array.isArray(parsed.candidates)) {
    return [];
  }

  return parsed.candidates.map((c: any) => {
    const rawVal = String(c.value || '').trim();
    const rawKey = String(c.key || 'fact').toLowerCase().replace(/\s+/g, '_');
    const semantic = classifyMemorySemantic({
      content: rawVal,
      key: rawKey,
      category: c.category,
    });
    const effectiveCategory = isSemanticCategory(c.category)
      ? (c.category as MemoryCategory)
      : semantic.category;
    const effectiveKey = rawKey || semantic.semanticKey;
    const effectiveSemanticKey = semantic.semanticKey || effectiveKey;

    return {
      category: effectiveCategory,
      semanticCategory: effectiveCategory,
      key: effectiveKey,
      semanticKey: effectiveSemanticKey,
      value: rawVal,
      confidence: Math.max(0, Math.min(1, typeof c.confidence === 'number' ? c.confidence : 0.9)),
      source: 'conversation',
      reason: String(c.reason || 'Extracted from conversation'),
      priority: normalizePriority(c.priority),
      retention: 'PERMANENT',
    };
  }).filter((c: MemoryCandidate) => Boolean(c.value && c.key) && !isCandidateSensitive(c));
}

/**
 * Main Entry Point: Analyzes conversation text and produces structured memory candidates.
 *
 * NOTE: DOES NOT SAVE TO FIRESTORE. Strictly returns structured candidate objects to the caller.
 */
export async function extractMemoryCandidates(
  input: string | MemoryExtractionInput
): Promise<MemoryExtractionResult> {
  const text = typeof input === 'string' ? input : input.text || '';
  const history = typeof input === 'object' ? input.conversationHistory : undefined;
  const trimmed = text.trim();
  const timestamp = Date.now();

  if (!trimmed) {
    return {
      candidates: [],
      inputAnalyzed: text,
      extractedCount: 0,
      engine: 'rule_based',
      timestamp,
    };
  }

  // SAFETY BARRIER 1: Immediate rejection of inputs containing or declaring sensitive credentials
  if (containsSensitiveCredentials(trimmed)) {
    return {
      candidates: [],
      inputAnalyzed: trimmed,
      extractedCount: 0,
      engine: 'rule_based',
      timestamp,
    };
  }

  // 1. Fast local deterministic rule evaluation first (zero latency, zero API quota consumed)
  const ruleCandidates = extractWithRules(trimmed).filter((c) => !isCandidateSensitive(c));
  if (ruleCandidates.length > 0) {
    return {
      candidates: ruleCandidates,
      inputAnalyzed: trimmed,
      extractedCount: ruleCandidates.length,
      engine: 'rule_based',
      timestamp,
    };
  }

  // 2. If rules did not detect candidates, attempt LLM extraction with Gemini if available and not cooling down
  if (process.env.GEMINI_API_KEY && Date.now() >= quotaCooldownUntil) {
    try {
      const llmCandidates = await extractWithGemini(trimmed, history);
      if (llmCandidates.length > 0) {
        const filtered = llmCandidates.filter((c) => !isCandidateSensitive(c));
        return {
          candidates: filtered,
          inputAnalyzed: trimmed,
          extractedCount: filtered.length,
          engine: 'gemini',
          timestamp,
        };
      }
    } catch {
      // Fallback handled cleanly below
    }
  }

  return {
    candidates: [],
    inputAnalyzed: trimmed,
    extractedCount: 0,
    engine: 'rule_based',
    timestamp,
  };
}

/**
 * Convenience helper to extract candidates from a single turn.
 */
export async function extractMemoryCandidatesFromTurn(
  userText: string,
  context?: Array<{ role: string; text: string }>
): Promise<MemoryCandidate[]> {
  const result = await extractMemoryCandidates({
    text: userText,
    conversationHistory: context as any,
  });
  return result.candidates;
}

/**
 * Fast heuristic check to determine if a message likely contains long-term personal facts.
 */
export function isLikelyPermanentMemory(text: string): boolean {
  if (!text || text.length < 5) return false;
  if (containsSensitiveCredentials(text)) return false;
  const candidates = extractWithRules(text).filter((c) => !isCandidateSensitive(c));
  return candidates.length > 0;
}
