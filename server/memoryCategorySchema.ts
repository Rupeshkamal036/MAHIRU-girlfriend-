import type {
  MemoryCategory,
  SemanticMemoryCategory,
  MemoryCandidate,
  MemoryRecord,
} from '../src/types';

export const MEMORY_CATEGORIES: SemanticMemoryCategory[] = [
  'personal_profile',
  'interests',
  'watching_entertainment',
  'gaming',
  'food',
  'drinks',
  'activities',
  'learning',
  'travel',
  'music',
  'technology',
  'goals_and_projects',
  'relationships',
  'communication_style',
  'lifestyle_and_routines',
  'important_facts',
  'favorites',
];

export function isSemanticCategory(category: string): category is SemanticMemoryCategory {
  return MEMORY_CATEGORIES.includes(category as SemanticMemoryCategory);
}

export function normalizeToSemanticCategory(cat: string): SemanticMemoryCategory {
  const c = String(cat || '').toLowerCase().trim();
  if (isSemanticCategory(c)) return c as SemanticMemoryCategory;

  if (c.includes('profile') || c === 'user_profile') return 'personal_profile';
  if (c.includes('anime') || c.includes('movie') || c.includes('drama') || c.includes('show') || c.includes('series')) return 'watching_entertainment';
  if (c.includes('game') || c.includes('gaming')) return 'gaming';
  if (c.includes('food') || c.includes('eat') || c.includes('dish') || c.includes('cuisine')) return 'food';
  if (c.includes('drink') || c.includes('beverage') || c.includes('chai') || c.includes('coffee') || c.includes('tea')) return 'drinks';
  if (c.includes('learn') || c.includes('study') || c.includes('course') || c.includes('skill')) return 'learning';
  if (c.includes('travel') || c.includes('trip') || c.includes('place') || c.includes('visit') || c.includes('city')) return 'travel';
  if (c.includes('music') || c.includes('song') || c.includes('singer')) return 'music';
  if (c.includes('tech') || c.includes('coding') || c.includes('programming')) return 'technology';
  if (c.includes('interest')) return 'interests';
  if (c.includes('preference') || c.includes('favorite') || c === 'preferences') return 'favorites';
  if (c.includes('goal') || c.includes('project')) return 'goals_and_projects';
  if (c.includes('relation') || c.includes('family') || c.includes('friend')) return 'relationships';
  if (c.includes('style') || c.includes('tone')) return 'communication_style';
  if (c.includes('routine') || c.includes('habit') || c.includes('schedule')) return 'lifestyle_and_routines';

  return 'important_facts';
}

export function cleanEntityValue(val: string): string {
  if (!val) return '';
  return val
    .replace(/^["'“‘\s]+|["'”’\s.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeMemoryValueForDuplicate(val: string): string {
  if (!val) return '';
  return cleanEntityValue(val).toLowerCase();
}

export function normalizeSemanticKey(key: string): string {
  if (!key) return 'general_fact';
  return key.toLowerCase().replace(/[\s-]+/g, '_').trim();
}

export function classifyMemorySemantic(record: {
  category?: string;
  key?: string;
  content?: string;
  value?: string;
}): {
  category: SemanticMemoryCategory;
  semanticKey: string;
  normalizedValue: string;
} {
  const content = record.content || record.value || '';
  const key = record.key || 'fact';
  const rawCat = record.category || 'important_facts';

  const lowerContent = content.toLowerCase();
  const lowerKey = key.toLowerCase();

  let semanticCategory = normalizeToSemanticCategory(rawCat);
  let semanticKey = normalizeSemanticKey(key);

  if (lowerKey === 'user_name' || lowerKey === 'name' || lowerKey === 'owner_name') {
    semanticCategory = 'personal_profile';
    semanticKey = 'user_name';
  } else if (
    lowerKey === 'favorite_anime' ||
    lowerContent.includes('solo leveling') ||
    lowerContent.includes('anime') ||
    lowerContent.includes('naruto')
  ) {
    semanticCategory = 'watching_entertainment';
    semanticKey = 'favorite_anime';
  } else if (
    lowerKey === 'favorite_food' ||
    lowerContent.includes('biryani') ||
    lowerContent.includes('food')
  ) {
    semanticCategory = 'food';
    semanticKey = 'favorite_food';
  } else if (
    lowerKey === 'favorite_drink' ||
    lowerContent.includes('chai') ||
    lowerContent.includes('tea') ||
    lowerContent.includes('coffee')
  ) {
    semanticCategory = 'drinks';
    semanticKey = 'favorite_drink';
  } else if (
    lowerKey === 'favorite_game' ||
    lowerContent.includes('bgmi') ||
    lowerContent.includes('game')
  ) {
    semanticCategory = 'gaming';
    semanticKey = 'favorite_game';
  } else if (
    lowerKey === 'learning_interest' ||
    lowerContent.includes('trading') ||
    lowerContent.includes('coding')
  ) {
    semanticCategory = 'learning';
    semanticKey = 'learning_interest';
  } else if (
    lowerKey === 'travel_destination' ||
    lowerContent.includes('ladakh') ||
    lowerContent.includes('goa')
  ) {
    semanticCategory = 'travel';
    semanticKey = 'travel_destination';
  }

  return {
    category: semanticCategory,
    semanticKey,
    normalizedValue: cleanEntityValue(content),
  };
}

export function splitCompoundFacts(text: string): string[] {
  if (!text) return [];
  // Split on connectors like aur, and, commas
  return text
    .split(/\s*(?:,|aur|\band\b)\s*/i)
    .map((s) => cleanEntityValue(s))
    .filter(Boolean);
}

export function isExactDuplicateMemory(
  candidate: { category?: string; key?: string; value?: string },
  existing: { category?: string; key?: string; value?: string; content?: string }
): boolean {
  const candVal = normalizeMemoryValueForDuplicate(candidate.value || '');
  const existVal = normalizeMemoryValueForDuplicate(existing.value || existing.content || '');

  if (candVal !== existVal) return false;

  const candCat = normalizeToSemanticCategory(candidate.category || '');
  const existCat = normalizeToSemanticCategory(existing.category || '');

  const candKey = normalizeSemanticKey(candidate.key || '');
  const existKey = normalizeSemanticKey(existing.key || '');

  if (candCat === existCat && candKey === existKey) {
    return true;
  }

  // If normalized values match exactly on favorite keys
  if (candVal && candVal === existVal && candKey === existKey) {
    return true;
  }

  return false;
}

export function findExactDuplicateMemory(
  candidate: MemoryCandidate,
  existingList: (MemoryRecord | any)[]
): (MemoryRecord | any) | null {
  for (const existing of existingList) {
    if (isExactDuplicateMemory(candidate, existing)) {
      return existing;
    }
  }
  return null;
}

export function isRelatedRefinement(
  candidate: MemoryCandidate,
  existingList: (MemoryRecord | any)[]
): (MemoryRecord | any) | null {
  const candVal = (candidate.value || '').toLowerCase();
  const candKey = normalizeSemanticKey(candidate.key || '');

  // Words that indicate a refinement, category, or sub-genre rather than a specific entity title
  const refinementPatterns = [
    /\bwale\b/i,
    /\btype ka\b/i,
    /\btype ke\b/i,
    /\bgenre\b/i,
    /\bcategory\b/i,
    /\blove story\b/i,
    /\bromance\b/i,
    /\baction\b/i,
    /\bcomedy\b/i,
    /\bspicy\b/i,
  ];

  const hasRefinementWord = refinementPatterns.some((p) => p.test(candVal));
  if (!hasRefinementWord) return null;

  for (const ex of existingList) {
    const exKey = normalizeSemanticKey(ex.key || ex.semanticKey || '');
    const exCat = normalizeToSemanticCategory(ex.category || '');
    const candCat = normalizeToSemanticCategory(candidate.category || '');

    if (exCat === candCat && exKey === candKey) {
      return ex;
    }
  }

  return null;
}

export function evaluateMemoryDecision(
  candidate: MemoryCandidate,
  existingMemories: (MemoryRecord | any)[],
  optionsOrIsExplicitNew?: boolean | { isExplicitNewMemory?: boolean; isExplicitNew?: boolean; rawText?: string }
): {
  decision: 'EXACT_DUPLICATE' | 'SIMILAR_REQUIRES_USER_DECISION' | 'NEW_MEMORY';
  matchedMemory?: any;
  existingMemory?: any;
  message?: string;
  clarificationPrompt?: string;
  reason?: string;
} {
  const isExplicitNew =
    typeof optionsOrIsExplicitNew === 'boolean'
      ? optionsOrIsExplicitNew
      : Boolean(optionsOrIsExplicitNew?.isExplicitNewMemory || optionsOrIsExplicitNew?.isExplicitNew);

  // 1. Check exact duplicate
  const exactDup = findExactDuplicateMemory(candidate, existingMemories);
  if (exactDup) {
    return {
      decision: 'EXACT_DUPLICATE',
      matchedMemory: exactDup,
      existingMemory: exactDup,
      message: 'Ye memory pehle se saved hai.',
      reason: 'exact_duplicate',
    };
  }

  // If explicit new memory was commanded, do not force clarification prompt
  if (isExplicitNew || candidate.isExplicitNew) {
    return {
      decision: 'NEW_MEMORY',
      reason: 'explicit_new_memory',
    };
  }

  // 2. Check if related refinement
  const refinement = isRelatedRefinement(candidate, existingMemories);
  if (refinement) {
    const prompt = `Aapki pehle se "${refinement.value || refinement.content}" wali memory hai. Kya aap ise update karna chahte hain ya new memory save karein?`;
    return {
      decision: 'SIMILAR_REQUIRES_USER_DECISION',
      matchedMemory: refinement,
      existingMemory: refinement,
      message: 'Similar memory already exists. Requires user decision.',
      clarificationPrompt: prompt,
      reason: 'similar_refinement',
    };
  }

  // 3. New independent memory
  return {
    decision: 'NEW_MEMORY',
    reason: 'new_independent_memory',
  };
}
