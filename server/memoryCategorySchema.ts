import type { MemoryCategory } from '../src/types';
import { isExplicitSaveCommand } from './automaticMemorySaving';

/**
 * MAHIRU MEMORY SYSTEM — STEP 1: CATEGORY + SCHEMA FOUNDATION
 * 
 * Defines the 17 rich semantic categories and stable semantic keys.
 * Categorizes memories precisely instead of dumping into generic 'Preferences' or 'Favorites'.
 */

export const MEMORY_CATEGORIES = [
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
] as const;

export type SemanticMemoryCategory = typeof MEMORY_CATEGORIES[number];

export interface SemanticClassificationResult {
  category: SemanticMemoryCategory;
  semanticKey: string;
  normalizedValue: string;
}

/**
 * Standard semantic keys for each category.
 */
export const CATEGORY_SEMANTIC_KEYS: Record<SemanticMemoryCategory, string[]> = {
  personal_profile: [
    'user_name',
    'age',
    'birthday',
    'gender',
    'location',
    'occupation',
    'native_language',
    'personal_identity',
  ],
  interests: ['interest', 'hobby', 'topic_of_interest'],
  watching_entertainment: [
    'favorite_anime',
    'favorite_movie',
    'favorite_tv_show',
    'favorite_drama',
    'favorite_genre',
    'watching_preference',
  ],
  gaming: ['favorite_game', 'gaming_platform', 'play_style', 'gaming_interest'],
  food: [
    'favorite_food',
    'favorite_dish',
    'favorite_cuisine',
    'disliked_food',
    'dietary_preference',
    'allergy',
  ],
  drinks: [
    'favorite_drink',
    'favorite_beverage',
    'tea_preference',
    'coffee_preference',
    'disliked_drink',
  ],
  activities: ['favorite_activity', 'workout_routine', 'sport', 'weekend_activity'],
  learning: ['learning_interest', 'study_subject', 'skill_to_learn', 'reading_interest'],
  travel: ['travel_destination', 'travel_plan', 'favorite_place', 'dream_trip'],
  music: ['favorite_music', 'favorite_artist', 'favorite_singer', 'favorite_song', 'music_genre'],
  technology: [
    'tech_interest',
    'favorite_device',
    'programming_language',
    'software_preference',
    'operating_system',
  ],
  goals_and_projects: ['current_project', 'long_term_goal', 'project_name', 'career_goal'],
  relationships: ['friend', 'pet', 'family_member', 'relationship_context', 'partner'],
  communication_style: [
    'communication_preference',
    'language_preference',
    'tone_preference',
    'girlfriend_nickname',
  ],
  lifestyle_and_routines: ['daily_routine', 'sleep_schedule', 'morning_routine', 'habit'],
  important_facts: ['important_fact', 'personal_note'],
  favorites: ['favorite_color', 'general_favorite'],
};

// Known entity dictionaries for high-precision semantic matching
const ANIME_TITLES = [
  'solo leveling',
  'naruto',
  'one punch man',
  'attack on titan',
  'jujutsu kaisen',
  'demon slayer',
  'death note',
  'bleach',
  'one piece',
  'dragon ball',
  'dragon ball z',
  'tokyo ghoul',
  'my hero academia',
  'chainsaw man',
  'hunter x hunter',
  'steins gate',
  'fullmetal alchemist',
  'vinland saga',
  'code geass',
  'haikyuu',
  'black clover',
  'sword art online',
  'fate',
  'spy x family',
  'blue lock',
];

const FOOD_ITEMS = [
  'biryani',
  'chicken biryani',
  'mutton biryani',
  'pizza',
  'burger',
  'pasta',
  'ramen',
  'sushi',
  'paneer',
  'butter chicken',
  'dal makhani',
  'noodles',
  'dosa',
  'idli',
  'momos',
  'shawarma',
  'curry',
  'tacos',
  'burrito',
  'sandwiches',
  'sandwich',
  'fried rice',
];

const DRINK_ITEMS = [
  'chai',
  'tea',
  'masala chai',
  'adrak chai',
  'coffee',
  'cold coffee',
  'espresso',
  'latte',
  'cappuccino',
  'green tea',
  'boba',
  'boba tea',
  'bubble tea',
  'juice',
  'smoothie',
  'milkshake',
  'shake',
  'lassi',
  'lemonade',
  'soda',
  'energy drink',
  'red bull',
];

const GAME_TITLES = [
  'bgmi',
  'pubg',
  'pubg mobile',
  'valorant',
  'gta',
  'gta v',
  'gta 5',
  'minecraft',
  'free fire',
  'call of duty',
  'cod',
  'genshin impact',
  'fifa',
  'cs:go',
  'csgo',
  'counter strike',
  'apex legends',
  'fortnite',
  'league of legends',
  'dota',
  'dota 2',
  'roblox',
  'cyberpunk',
  'elden ring',
  'god of war',
];

const TRAVEL_PLACES = [
  'ladakh',
  'manali',
  'goa',
  'kashmir',
  'shimla',
  'rishikesh',
  'japan',
  'tokyo',
  'kyoto',
  'switzerland',
  'paris',
  'london',
  'bali',
  'thailand',
  'dubai',
  'new york',
  'singapore',
  'maldives',
  'kedarnath',
  'varanasi',
  'amsterdam',
  'mountains',
  'beach',
  'beaches',
];

const LEARNING_TOPICS = [
  'trading',
  'stock market',
  'crypto',
  'coding',
  'programming',
  'web development',
  'ai',
  'artificial intelligence',
  'machine learning',
  'data science',
  'guitar',
  'piano',
  'spanish',
  'japanese',
  'french',
  'investing',
  'finance',
  'design',
  'ui/ux',
];

/**
 * Checks if a given category string is one of the 17 semantic categories.
 */
export function isSemanticCategory(cat: string): cat is SemanticMemoryCategory {
  return (MEMORY_CATEGORIES as readonly string[]).includes(cat);
}

/**
 * Normalizes any category string (including legacy ones) to one of the 17 semantic categories.
 */
export function normalizeToSemanticCategory(raw?: string): SemanticMemoryCategory {
  if (!raw) return 'favorites';
  const clean = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');

  if (isSemanticCategory(clean)) {
    return clean;
  }

  // Legacy mappings
  if (clean === 'user_profile' || clean === 'profile') return 'personal_profile';
  if (clean === 'preferences' || clean === 'preference') return 'favorites'; // will be refined by classifier
  if (clean === 'goals_and_projects' || clean === 'goals_projects' || clean === 'projects' || clean === 'goals') {
    return 'goals_and_projects';
  }
  if (clean === 'conversation') return 'communication_style';
  if (clean === 'system') return 'important_facts';

  return 'favorites';
}

/**
 * Cleans extracted text by stripping common conversational Hindi/English wrapper verbs.
 */
export function cleanEntityValue(raw: string): string {
  let val = String(raw || '').trim();
  // Remove wrapping quotes
  val = val.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '').trim();

  // Strip trailing Hindi verb phrases: pasand hai, bhi pasand hai, bohot pasand hai, dekhna pasand hai, etc.
  val = val.replace(
    /\s+(?:bhi\s+)?(?:bohot\s+)?(?:pasand\s+(?:hai|hain|h)|accha\s+lagta\s+hai|achha\s+lagta\s+hai|khelna\s+pasand\s+hai|khana\s+pasand\s+hai|peena\s+pasand\s+hai|dekhna\s+pasand\s+hai|seekhna\s+pasand\s+hai|ghoomna\s+pasand\s+hai|ghoomna\s+hai|travel\s+karna\s+hai|karna\s+hai|acha\s+lagta\s+h)[\s.?!]*$/i,
    ''
  );

  // Strip trailing English phrases: is my favorite, is a favorite, is loved, etc.
  val = val.replace(/\s+is\s+(?:my\s+)?(?:favorite|favourite|a\s+favorite|a\s+favourite|loved)[\s.?!]*$/i, '');
  val = val.replace(/\s+(?:i\s+like|i\s+love|i\s+prefer)[\s.?!]*$/i, '');

  // Strip trailing Hindi infinitive verbs left over after removing pasand hai (dekhna, khelna, khana, peena, etc.)
  val = val.replace(/\s+(?:dekhna|khelna|khana|peena|seekhna|padhna|sunna|ghoomna)[\s.?!]*$/i, '');

  // Strip leading phrases: mujhe, mera, my favorite, etc.
  val = val.replace(/^(?:(?:ki|ke)\s+)?(?:mujhe|mera|meri|my\s+favorite|my\s+fav|favorite|fav)\s+/i, '');

  // Strip trailing particle 'bhi' if left at the end of the entity
  val = val.replace(/\s+bhi$/i, '').trim();

  return val.trim();
}

/**
 * Classifies a memory record or text into its precise semantic category and semantic key.
 * Preserves the actual information/value.
 */
export function classifyMemorySemantic(input: {
  content: string;
  key?: string;
  category?: string;
}): SemanticClassificationResult {
  const rawContent = String(input.content || '').trim();
  const rawKey = String(input.key || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const lowerContent = rawContent.toLowerCase();

  // 1. Check Owner / Name / Personal Profile
  const ownerKeys = ['name', 'user_name', 'owner_name', 'my_name', 'user_real_name', 'username'];
  if (ownerKeys.includes(rawKey) || /\b(?:my name is|mera naam|mera name)\b/i.test(lowerContent)) {
    const cleaned = cleanEntityValue(rawContent).replace(/^(?:mera naam|my name is|name is)\s+/i, '');
    return {
      category: 'personal_profile',
      semanticKey: 'user_name',
      normalizedValue: cleaned || rawContent,
    };
  }

  if (rawKey === 'age' || /\b(?:age|years old|saal ka hu|saal ki hu)\b/i.test(lowerContent)) {
    return {
      category: 'personal_profile',
      semanticKey: 'age',
      normalizedValue: cleanEntityValue(rawContent),
    };
  }

  if (rawKey === 'birthday' || /\b(?:birthday|janamdin)\b/i.test(lowerContent)) {
    return {
      category: 'personal_profile',
      semanticKey: 'birthday',
      normalizedValue: cleanEntityValue(rawContent),
    };
  }

  if (rawKey === 'occupation' || rawKey === 'job' || /\b(?:work as|profession|job is)\b/i.test(lowerContent)) {
    return {
      category: 'personal_profile',
      semanticKey: 'occupation',
      normalizedValue: cleanEntityValue(rawContent),
    };
  }

  // 2. Watching & Entertainment (Anime, Movies, Series, Dramas)
  const sortedAnime = [...ANIME_TITLES].sort((a, b) => b.length - a.length);
  if (
    rawKey.includes('anime') ||
    /\b(?:anime|manga|otaku)\b/i.test(lowerContent) ||
    sortedAnime.some((title) => lowerContent.includes(title))
  ) {
    let cleanVal = cleanEntityValue(rawContent);
    for (const title of sortedAnime) {
      if (lowerContent.includes(title)) {
        if (cleanVal.length > title.length && !/(?:is\s+a|favorite|favourite|pasand|mujhe)/i.test(cleanVal)) {
          break;
        }
        const regex = new RegExp(`\\b${title.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        const match = rawContent.match(regex);
        if (match) {
          cleanVal = match[0];
          break;
        }
      }
    }
    return {
      category: 'watching_entertainment',
      semanticKey: 'favorite_anime',
      normalizedValue: cleanVal || rawContent,
    };
  }

  if (
    rawKey.includes('movie') ||
    rawKey.includes('film') ||
    rawKey.includes('cinema') ||
    /\b(?:movies?|films?|cinemas?)\b/i.test(lowerContent)
  ) {
    return {
      category: 'watching_entertainment',
      semanticKey: 'favorite_movie',
      normalizedValue: cleanEntityValue(rawContent),
    };
  }

  if (
    rawKey.includes('drama') ||
    rawKey.includes('kdrama') ||
    /\b(?:k-dramas?|kdramas?|dramas?|series|tv\s*shows?|shows?)\b/i.test(lowerContent)
  ) {
    return {
      category: 'watching_entertainment',
      semanticKey: 'favorite_drama',
      normalizedValue: cleanEntityValue(rawContent),
    };
  }

  if (
    /\b(?:watching|watch|dekhna)\b/i.test(lowerContent) &&
    !/\b(?:khana|peena|khelna)\b/i.test(lowerContent)
  ) {
    return {
      category: 'watching_entertainment',
      semanticKey: 'watching_preference',
      normalizedValue: cleanEntityValue(rawContent),
    };
  }

  // 3. Gaming
  const sortedGames = [...GAME_TITLES].sort((a, b) => b.length - a.length);
  if (
    rawKey.includes('game') ||
    rawKey.includes('gaming') ||
    /\b(?:game|gaming|khelna|khelta hu)\b/i.test(lowerContent) ||
    sortedGames.some((game) => lowerContent.includes(game))
  ) {
    let cleanVal = cleanEntityValue(rawContent);
    for (const game of sortedGames) {
      if (lowerContent.includes(game)) {
        if (cleanVal.length > game.length && !/(?:is\s+a|favorite|favourite|pasand|mujhe)/i.test(cleanVal)) {
          break;
        }
        const regex = new RegExp(`\\b${game.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        const match = rawContent.match(regex);
        if (match) {
          cleanVal = match[0];
          break;
        }
      }
    }
    return {
      category: 'gaming',
      semanticKey: 'favorite_game',
      normalizedValue: cleanVal || rawContent,
    };
  }

  // 4. Food & Dishes
  const sortedFood = [...FOOD_ITEMS].sort((a, b) => b.length - a.length);
  if (
    rawKey.includes('food') ||
    rawKey.includes('dish') ||
    rawKey.includes('cuisine') ||
    /\b(?:food|dish|khana|khaana|eating|cuisine)\b/i.test(lowerContent) ||
    sortedFood.some((food) => lowerContent.includes(food))
  ) {
    let cleanVal = cleanEntityValue(rawContent);
    for (const food of sortedFood) {
      if (lowerContent.includes(food)) {
        if (cleanVal.length > food.length && !/(?:is\s+a|favorite|favourite|pasand|mujhe)/i.test(cleanVal)) {
          break;
        }
        const regex = new RegExp(`\\b${food.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        const match = rawContent.match(regex);
        if (match) {
          cleanVal = match[0];
          break;
        }
      }
    }
    return {
      category: 'food',
      semanticKey: 'favorite_food',
      normalizedValue: cleanVal || rawContent,
    };
  }

  // 5. Drinks & Beverages
  const sortedDrinks = [...DRINK_ITEMS].sort((a, b) => b.length - a.length);
  if (
    rawKey.includes('drink') ||
    rawKey.includes('beverage') ||
    rawKey.includes('chai') ||
    rawKey.includes('tea') ||
    rawKey.includes('coffee') ||
    /\b(?:drink|beverage|chai|tea|coffee|peena|peeta hu)\b/i.test(lowerContent) ||
    sortedDrinks.some((drink) => lowerContent.includes(drink))
  ) {
    let cleanVal = cleanEntityValue(rawContent);
    for (const drink of sortedDrinks) {
      if (lowerContent.includes(drink)) {
        if (cleanVal.length > drink.length && !/(?:is\s+a|favorite|favourite|pasand|mujhe)/i.test(cleanVal)) {
          break;
        }
        const regex = new RegExp(`\\b${drink.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        const match = rawContent.match(regex);
        if (match) {
          cleanVal = match[0];
          break;
        }
      }
    }
    return {
      category: 'drinks',
      semanticKey: 'favorite_drink',
      normalizedValue: cleanVal || rawContent,
    };
  }

  // 6. Learning & Study
  const sortedLearning = [...LEARNING_TOPICS].sort((a, b) => b.length - a.length);
  if (
    rawKey.includes('learning') ||
    rawKey.includes('study') ||
    rawKey.includes('skill') ||
    /\b(?:learning|learn|study|studying|seekhna|seekh raha hu)\b/i.test(lowerContent) ||
    sortedLearning.some((topic) => lowerContent.includes(topic))
  ) {
    let cleanVal = cleanEntityValue(rawContent);
    for (const topic of sortedLearning) {
      if (lowerContent.includes(topic)) {
        if (cleanVal.length > topic.length && !/(?:is\s+a|favorite|favourite|pasand|mujhe)/i.test(cleanVal)) {
          break;
        }
        const regex = new RegExp(`\\b${topic.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        const match = rawContent.match(regex);
        if (match) {
          cleanVal = match[0];
          break;
        }
      }
    }
    return {
      category: 'learning',
      semanticKey: 'learning_interest',
      normalizedValue: cleanVal || rawContent,
    };
  }

  // 7. Travel & Destinations
  const sortedTravel = [...TRAVEL_PLACES].sort((a, b) => b.length - a.length);
  if (
    rawKey.includes('travel') ||
    rawKey.includes('destination') ||
    rawKey.includes('trip') ||
    /\b(?:travel|travelling|ghoomna|trip|vacation|visit)\b/i.test(lowerContent) ||
    sortedTravel.some((place) => lowerContent.includes(place))
  ) {
    let cleanVal = cleanEntityValue(rawContent);
    for (const place of sortedTravel) {
      if (lowerContent.includes(place)) {
        if (cleanVal.length > place.length && !/(?:is\s+a|favorite|favourite|pasand|mujhe)/i.test(cleanVal)) {
          break;
        }
        const regex = new RegExp(`\\b${place.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        const match = rawContent.match(regex);
        if (match) {
          cleanVal = match[0];
          break;
        }
      }
    }
    return {
      category: 'travel',
      semanticKey: 'travel_destination',
      normalizedValue: cleanVal || rawContent,
    };
  }

  // 8. Music
  if (
    rawKey.includes('music') ||
    rawKey.includes('song') ||
    rawKey.includes('singer') ||
    rawKey.includes('artist') ||
    /\b(?:music|song|gaana|geet|singer|artist|album|playlist)\b/i.test(lowerContent)
  ) {
    return {
      category: 'music',
      semanticKey: 'music_preference',
      normalizedValue: cleanEntityValue(rawContent),
    };
  }

  // 9. Technology
  if (
    rawKey.includes('tech') ||
    rawKey.includes('device') ||
    rawKey.includes('software') ||
    /\b(?:technology|tech|gadget|iphone|android|laptop|macbook|linux)\b/i.test(lowerContent)
  ) {
    return {
      category: 'technology',
      semanticKey: 'tech_interest',
      normalizedValue: cleanEntityValue(rawContent),
    };
  }

  // 10. Goals and Projects
  if (
    rawKey.includes('project') ||
    rawKey.includes('goal') ||
    /\b(?:project|startup|building|long-term goal)\b/i.test(lowerContent) ||
    lowerContent.includes('mahiru')
  ) {
    return {
      category: 'goals_and_projects',
      semanticKey: 'current_project',
      normalizedValue: cleanEntityValue(rawContent),
    };
  }

  // 11. Activities
  if (
    rawKey.includes('activity') ||
    rawKey.includes('sport') ||
    rawKey.includes('workout') ||
    /\b(?:activity|sport|workout|gym|running|swimming|cycling)\b/i.test(lowerContent)
  ) {
    return {
      category: 'activities',
      semanticKey: 'favorite_activity',
      normalizedValue: cleanEntityValue(rawContent),
    };
  }

  // 12. Relationships
  if (
    rawKey.includes('friend') ||
    rawKey.includes('pet') ||
    rawKey.includes('family') ||
    rawKey.includes('relationship') ||
    /\b(?:friend|pet|dog|cat|brother|sister|mother|father)\b/i.test(lowerContent)
  ) {
    const key = rawKey.includes('pet') || /\b(?:pet|dog|cat)\b/i.test(lowerContent) ? 'pet' : 'relationship_context';
    return {
      category: 'relationships',
      semanticKey: key,
      normalizedValue: cleanEntityValue(rawContent),
    };
  }

  // 13. Communication Style
  if (
    rawKey.includes('communication') ||
    rawKey.includes('nickname') ||
    rawKey.includes('language') ||
    /\b(?:talk to me|call you|nickname|in hindi|in english)\b/i.test(lowerContent)
  ) {
    const key = rawKey.includes('nickname') ? 'girlfriend_nickname' : 'communication_preference';
    return {
      category: 'communication_style',
      semanticKey: key,
      normalizedValue: cleanEntityValue(rawContent),
    };
  }

  // 14. Lifestyle & Routines
  if (
    rawKey.includes('routine') ||
    rawKey.includes('habit') ||
    rawKey.includes('sleep') ||
    /\b(?:routine|habit|wake up|sleep at|night owl|early bird)\b/i.test(lowerContent)
  ) {
    return {
      category: 'lifestyle_and_routines',
      semanticKey: 'daily_routine',
      normalizedValue: cleanEntityValue(rawContent),
    };
  }

  // 15. Favorites fallback (when category or key is color, etc.)
  if (rawKey.includes('color') || /\b(?:color|colour)\b/i.test(lowerContent)) {
    return {
      category: 'favorites',
      semanticKey: 'favorite_color',
      normalizedValue: cleanEntityValue(rawContent),
    };
  }

  // Check if input category was already a specific semantic category
  const mappedCat = normalizeToSemanticCategory(input.category);
  if (mappedCat !== 'favorites') {
    return {
      category: mappedCat,
      semanticKey: rawKey || 'topic_of_interest',
      normalizedValue: cleanEntityValue(rawContent),
    };
  }

  // Fallback: general favorites or important facts
  return {
    category: 'favorites',
    semanticKey: rawKey || 'general_favorite',
    normalizedValue: cleanEntityValue(rawContent),
  };
}

/**
 * Splits compound sentences containing multiple distinct facts or entities.
 * Handles conjunctions: "aur", "and", ",".
 */
export function splitCompoundFacts(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const clean = text.trim();

  // Pattern matching: "Mujhe X, Y aur Z pasand hai"
  // Check if there are commas or "aur" / "and"
  const hasMultiple = clean.includes(',') || /\b(?:aur|and)\b/i.test(clean);
  if (!hasMultiple) {
    return [clean];
  }

  // Check for common prefix: "Mujhe ... pasand hai/hain"
  const prefixMatch = clean.match(/^(?:mujhe|i\s+(?:like|love))\s+(.+?)(?:\s+(?:bhi\s+)?(?:bohot\s+)?pasand\s+(?:hai|hain|h)|\s+lagte\s+hain|[\s.?!]*$)/i);
  if (prefixMatch) {
    const listPart = prefixMatch[1].trim();
    // Split listPart by commas and "aur"/"and"
    const rawTokens = listPart
      .split(/,\s*|\s+(?:aur|and)\s+/i)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (rawTokens.length > 1) {
      return rawTokens;
    }
  }

  return [clean];
}

/**
 * Normalizes memory values conservatively for exact duplicate detection.
 * Tolerates harmless formatting differences:
 * - Trims leading and trailing whitespace
 * - Strips wrapping quotes ("...", '...', “...”, etc.)
 * - Strips trailing punctuation (. ! ? , ;)
 * - Collapses consecutive whitespace characters into a single space
 * - Case-insensitive (lowercase)
 * Does NOT perform aggressive fuzzy matching.
 */
export function normalizeMemoryValueForDuplicate(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let val = raw.trim();
  // Strip wrapping quotes
  val = val.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '').trim();
  // Strip trailing punctuation
  val = val.replace(/[.!?\,;]+$/g, '').trim();
  // Collapse multiple internal spaces
  val = val.replace(/\s+/g, ' ');
  return val.toLowerCase();
}

/**
 * Normalizes semantic key to standard lowercase underscored representation.
 */
export function normalizeSemanticKey(raw?: string): string {
  if (!raw || typeof raw !== 'string') return 'general';
  return raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Determines whether a memory candidate is an EXACT duplicate of an existing memory.
 * An exact duplicate means the candidate and existing memory represent:
 * 1. The same semantic category
 * 2. The same semantic key
 * 3. The same normalized factual value (conservative formatting normalization)
 */
export function isExactDuplicateMemory(
  candidate: { category?: string; semanticCategory?: string; key?: string; semanticKey?: string; value?: string; content?: string },
  existing: { category?: string; semanticCategory?: string; key?: string; semanticKey?: string; value?: string; content?: string }
): boolean {
  if (!candidate || !existing) return false;

  // 1. Resolve semantic category for both
  const candClassified = classifyMemorySemantic({
    content: candidate.value || candidate.content || '',
    key: candidate.semanticKey || candidate.key,
    category: candidate.semanticCategory || candidate.category,
  });
  const existClassified = classifyMemorySemantic({
    content: existing.value || existing.content || '',
    key: existing.semanticKey || existing.key,
    category: existing.semanticCategory || existing.category,
  });

  const candCat = normalizeToSemanticCategory(candidate.semanticCategory || candidate.category || candClassified.category);
  const existCat = normalizeToSemanticCategory(existing.semanticCategory || existing.category || existClassified.category);

  if (candCat !== existCat) {
    return false;
  }

  // 2. Resolve semantic key for both
  const candKey = normalizeSemanticKey(candidate.semanticKey || candClassified.semanticKey || candidate.key);
  const existKey = normalizeSemanticKey(existing.semanticKey || existClassified.semanticKey || existing.key);

  if (candKey !== existKey) {
    return false;
  }

  // 3. Resolve normalized values
  const candNorm = normalizeMemoryValueForDuplicate(candClassified.normalizedValue || candidate.value || candidate.content);
  const existNorm = normalizeMemoryValueForDuplicate(existClassified.normalizedValue || existing.value || existing.content);

  const rawCandNorm = normalizeMemoryValueForDuplicate(candidate.value || candidate.content);
  const rawExistNorm = normalizeMemoryValueForDuplicate(existing.value || existing.content);

  // Exact match if classified normalized values match OR raw normalized values match
  const valueMatches =
    (candNorm && existNorm && candNorm === existNorm) ||
    (rawCandNorm && rawExistNorm && rawCandNorm === rawExistNorm) ||
    (candNorm && rawExistNorm && candNorm === rawExistNorm) ||
    (rawCandNorm && existNorm && rawCandNorm === existNorm);

  return Boolean(valueMatches);
}

/**
 * Searches an array of existing memories for an exact duplicate of the candidate.
 */
export function findExactDuplicateMemory<
  T extends { category?: string; semanticCategory?: string; key?: string; semanticKey?: string; value?: string; content?: string }
>(
  candidate: { category?: string; semanticCategory?: string; key?: string; semanticKey?: string; value?: string; content?: string },
  existingMemories: T[]
): T | undefined {
  if (!candidate || !Array.isArray(existingMemories) || existingMemories.length === 0) {
    return undefined;
  }
  return existingMemories.find((m) => isExactDuplicateMemory(candidate, m));
}

export type MemoryCreationDecision =
  | 'EXACT_DUPLICATE'
  | 'NEW_MEMORY'
  | 'SIMILAR_REQUIRES_USER_DECISION';

export interface MemoryDecisionEvaluation {
  decision: MemoryCreationDecision;
  existingMemory?: any;
  reason: string;
  message?: string;
  clarificationPrompt?: string;
}

export interface EvaluateDecisionOptions {
  isExplicitNewMemory?: boolean;
  rawText?: string;
}

/**
 * Checks whether a candidate value is a refinement, subgenre, qualified attribute,
 * or semantically related modification of an existing memory in the same category/key,
 * rather than an independent standalone item.
 */
export function isRelatedRefinement(
  candidateValue: string,
  existingMemoryValue: string,
  semanticKey = '',
  semanticCategory = ''
): boolean {
  const cVal = candidateValue.trim().toLowerCase();
  const eVal = existingMemoryValue.trim().toLowerCase();

  if (cVal === eVal) return false;

  // 1. Substring / refinement of existing memory value:
  // e.g. Existing is "Solo Leveling", candidate is "Solo Leveling Season 2" or "Solo Leveling Manhwa"
  // e.g. Existing is "Biryani", candidate is "Chicken Biryani" or "Hyderabadi Biryani" or "Dum Biryani"
  // e.g. Existing is "Chai", candidate is "Masala Chai" or "Adrak Chai"
  if (eVal.length >= 3 && cVal.includes(eVal) && cVal !== eVal) {
    return true;
  }
  if (cVal.length >= 3 && eVal.includes(cVal) && cVal !== eVal) {
    return true;
  }

  // 2. Modifier / refinement adverbs applied to an existing memory value:
  if (/\b(?:mostly|especially|khas\s*karke|zyadatar|sirf|only|usually|mainly)\b/i.test(cVal)) {
    return true;
  }

  // 3. Domain-specific sub-genre refinement targeting the SAME specific entity/topic:
  // e.g. Existing is an anime title ("Solo Leveling"), and candidate is a sub-genre descriptor specifically for anime ("love story wale anime" or "love story wale")
  if (semanticKey.includes('anime') || (semanticCategory === 'watching_entertainment' && eVal.includes('anime'))) {
    if (/\b(?:anime|manga|animation)\b/i.test(cVal) && !ANIME_TITLES.includes(cVal)) {
      if (!/\b(?:movie|movies|film|films|drama|dramas|kdrama)\b/i.test(cVal)) {
        return true;
      }
    }
    if (/\b(?:love\s*story|romance|action|shonen|comedy|drama|horror|isekai|slice\s*of\s*life)\s*(?:wale|wali|waley|type\s*ke)?(?:\s*anime)?\b/i.test(cVal)) {
      return true;
    }
    if (/\b(?:wale|wali|waley|type\s*ke|type\s*ki|season|part|manhwa|manga)\b/i.test(cVal) && !ANIME_TITLES.includes(cVal)) {
      return true;
    }
  }

  // For food: e.g. "spicy food", "desi khana"
  if (semanticKey.includes('food') || semanticCategory === 'food') {
    if (/\b(?:spicy|desi|meetha|sweet|healthy|junk|fast)\s*(?:food|khana|dish)\b/i.test(cVal) && eVal.includes('food')) {
      return true;
    }
  }

  // For drinks: e.g. "hot drinks", "cold drinks"
  if (semanticKey.includes('drink') || semanticCategory === 'drinks') {
    if (/\b(?:hot|cold|soft)\s*(?:drinks?|peena|beverage)\b/i.test(cVal) && eVal.includes('drink')) {
      return true;
    }
  }

  // For games: e.g. "shooting games", "multiplayer games"
  if (semanticKey.includes('game') || semanticCategory === 'gaming') {
    if (/\b(?:shooting|mobile|pc|console|multiplayer|story\s*mode)\s*(?:games?|gaming)\b/i.test(cVal) && !GAME_TITLES.includes(cVal)) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates the memory creation decision:
 * - EXACT_DUPLICATE: Matches existing memory semantically (same category, key, normalized value).
 * - NEW_MEMORY: Truly independent new item or explicitly requested new memory.
 * - SIMILAR_REQUIRES_USER_DECISION: Similar / related / refinement of an existing memory.
 */
export function evaluateMemoryDecision<
  T extends { category?: string; semanticCategory?: string; key?: string; semanticKey?: string; value?: string; content?: string }
>(
  candidate: { category?: string; semanticCategory?: string; key?: string; semanticKey?: string; value?: string; content?: string; isExplicitNew?: boolean; source?: string },
  existingMemories: T[],
  options?: EvaluateDecisionOptions
): MemoryDecisionEvaluation {
  // 1. Exact Duplicate Check (ALWAYS takes precedence)
  const exactDuplicate = findExactDuplicateMemory(candidate, existingMemories);
  if (exactDuplicate) {
    return {
      decision: 'EXACT_DUPLICATE',
      existingMemory: exactDuplicate,
      reason: 'Ye memory pehle se saved hai.',
      message: 'Ye memory pehle se saved hai.',
    };
  }

  // 2. Explicit "New Memory" Directive:
  // If the user explicitly requested "new memory" and it is NOT an exact duplicate:
  const isExplicitNew = Boolean(
    options?.isExplicitNewMemory ||
    candidate.isExplicitNew ||
    candidate.source === 'explicit_new_memory' ||
    (options?.rawText && isExplicitSaveCommand(options.rawText))
  );

  if (isExplicitNew) {
    return {
      decision: 'NEW_MEMORY',
      reason: 'User explicitly requested creation as a new memory',
    };
  }

  // 3. Resolve category and key
  const candClassified = classifyMemorySemantic({
    content: candidate.value || candidate.content || '',
    key: candidate.semanticKey || candidate.key,
    category: candidate.semanticCategory || candidate.category,
  });

  const candCat = normalizeToSemanticCategory(candidate.semanticCategory || candidate.category || candClassified.category);
  const candKey = normalizeSemanticKey(candidate.semanticKey || candClassified.semanticKey || candidate.key);
  const candVal = candClassified.normalizedValue || candidate.value || candidate.content || '';

  // 4. Singular Keys Check
  const SINGULAR_USER_KEYS = ['name', 'user_name', 'owner_name', 'my_name', 'user_real_name', 'username', 'birthday', 'age', 'gender', 'location', 'occupation', 'girlfriend_nickname'];
  if (SINGULAR_USER_KEYS.includes(candKey)) {
    return {
      decision: 'NEW_MEMORY',
      reason: 'Singular key attribute handled via singular update flow',
    };
  }

  // 5. Multi-value Keys Check: Find existing memories in the SAME category and key
  const relatedExisting = existingMemories.filter((m) => {
    const mCat = normalizeToSemanticCategory(m.semanticCategory || m.category);
    const mKey = normalizeSemanticKey(m.semanticKey || m.key);
    return mCat === candCat && mKey === candKey;
  });

  if (relatedExisting.length === 0) {
    return {
      decision: 'NEW_MEMORY',
      reason: 'No existing memories under this category and key',
    };
  }

  // Check if candidate is a refinement/similar preference of any existing memory under this key
  for (const existing of relatedExisting) {
    const existVal = existing.value || existing.content || '';
    if (isRelatedRefinement(candVal, existVal, candKey, candCat)) {
      let catDisplay = 'preference';
      if (candKey.includes('anime') || candCat === 'watching_entertainment') {
        catDisplay = 'anime';
      } else if (candKey.includes('movie')) {
        catDisplay = 'movie';
      } else if (candKey.includes('food') || candCat === 'food') {
        catDisplay = 'food';
      } else if (candKey.includes('drink') || candCat === 'drinks') {
        catDisplay = 'drink';
      } else if (candKey.includes('game') || candCat === 'gaming') {
        catDisplay = 'gaming';
      }

      const clarificationPrompt = `Ye existing ${catDisplay} preference se related hai. Kya aap existing memory update karna chahte hain, ya ise alag new memory ke roop mein save karna hai?`;

      return {
        decision: 'SIMILAR_REQUIRES_USER_DECISION',
        existingMemory: existing,
        reason: 'Candidate is semantically related / a refinement of existing memory',
        message: clarificationPrompt,
        clarificationPrompt,
      };
    }
  }

  // 6. Otherwise, it is an independent new favorite/value
  return {
    decision: 'NEW_MEMORY',
    reason: 'Independent new value under multi-value category/key',
  };
}
