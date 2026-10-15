export type SessionState = 'disconnected' | 'connecting' | 'listening' | 'speaking';

export type ConversationStyle = 'idle' | 'talking' | 'greeting' | 'explaining';

export type ReactionType =
  | 'blush'
  | 'wink'
  | 'love'
  | 'smirk'
  | 'tease'
  | 'laugh'
  | 'laughing'
  | 'pout'
  | 'happy'
  | 'excited'
  | 'excited_greeting'
  | 'shy'
  | 'embarrassed'
  | 'surprised'
  | 'confused'
  | 'relieved'
  | 'thankful'
  | 'remembering'
  | 'sleepy'
  | 'tired'
  | 'looking_around'
  | 'sigh'
  | 'taking_a_breath'
  | 'goodbye';

export interface ReactionState {
  type: ReactionType;
  comment?: string;
  timestamp?: number;
}

export interface ToolCallData {
  id: string;
  name: string;
  args?: any;
}

export interface PermissionErrorState {
  isPermissionError?: boolean;
  isInIframe?: boolean;
  message?: string;
}

export interface AmbientLightState {
  color: string;
  colorName?: string;
  primaryGlow?: string;
  mode: string;
  hex?: string;
}

export type MemoryPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type SemanticMemoryCategory =
  | 'personal_profile'
  | 'interests'
  | 'watching_entertainment'
  | 'gaming'
  | 'food'
  | 'drinks'
  | 'activities'
  | 'learning'
  | 'travel'
  | 'music'
  | 'technology'
  | 'goals_and_projects'
  | 'relationships'
  | 'communication_style'
  | 'lifestyle_and_routines'
  | 'important_facts'
  | 'favorites';

export type MemoryCategory = SemanticMemoryCategory | 'USER_PROFILE' | 'PREFERENCES' | 'GOALS_AND_PROJECTS' | 'CONVERSATION' | string;

export interface MemoryRecord {
  id: string;
  memoryId?: string;
  userId: string;
  category: MemoryCategory;
  semanticCategory?: SemanticMemoryCategory | string;
  key: string;
  semanticKey?: string;
  value: string;
  content?: string;
  priority?: MemoryPriority;
  importance?: MemoryPriority;
  retention?: 'PERMANENT' | 'SESSION' | string;
  source?: string;
  lastRecalled?: string;
  isPermanent?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryCandidate {
  category: MemoryCategory;
  semanticCategory?: SemanticMemoryCategory | string;
  key: string;
  semanticKey?: string;
  value: string;
  priority?: MemoryPriority;
  isExplicitNew?: boolean;
  confidence?: number;
  sourceFact?: string;
  source?: string;
  reason?: string;
  retention?: string;
}

export interface MemoryExtractionInput {
  turnText?: string;
  text?: string;
  conversationHistory?: any;
  userId?: string;
  existingMemories?: MemoryRecord[];
}

export interface MemoryExtractionResult {
  inputAnalyzed?: string;
  candidates: MemoryCandidate[];
  skipped?: boolean;
  reason?: string;
}

export interface CandidatePersistenceResult {
  candidate: MemoryCandidate;
  action: 'created' | 'updated' | 'duplicate_skipped' | 'rejected_sensitive' | 'error';
  status?: string;
  decision?: string;
  message?: string;
  reason?: string;
  memoryId?: string;
  memory?: MemoryRecord;
  error?: string;
}

export interface PersistenceBatchResult {
  userId: string;
  processedCount: number;
  persistedCount: number;
  duplicateCount?: number;
  rejectedCount?: number;
  results: CandidatePersistenceResult[];
}
