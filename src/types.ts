export type SessionState = 'disconnected' | 'connecting' | 'listening' | 'speaking';

export type ConversationStyle = 'greeting' | 'explaining' | 'talking';

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
  | 'excited_greeting'
  | 'sigh'
  | 'taking_a_breath'
  | 'goodbye';

export interface ReactionState {
  type: ReactionType;
  comment?: string;
  timestamp: number;
}

export interface ToolCallData {
  id?: string;
  name: string;
  args: Record<string, any>;
}

export interface ToolResponseData {
  id?: string;
  name: string;
  response: Record<string, any>;
}

export interface AudioVisualizerData {
  userVolume: number;    // 0 to 1
  aiVolume: number;      // 0 to 1
  frequencies: Uint8Array;
}

export interface PermissionErrorState {
  isPermissionError: boolean;
  isInIframe: boolean;
  message: string;
}

export type AnimationCategory = 'conversation' | 'emotion' | 'movement' | 'idle';

export interface MahiruVideoMeta {
  id: number;
  filename: string;
  title: string;
  description: string;
  category: AnimationCategory;
  isOneShot: boolean;
  loop: boolean;
  priority: number;
  nextDefaultStateId?: number;
  actionStart?: number; // Exact timestamp (in seconds) where the actual action/movement starts
}

export type AmbientLightingMode = 'auto' | 'manual';

export interface AmbientLightState {
  mode: AmbientLightingMode;
  colorName: string;
  primaryGlow: string;    // CSS rgba or hex
  secondaryGlow: string;  // CSS rgba or hex
  accentGlow: string;
  brightness: number;     // 0.2 to 1.5
  intensityClass: string;
  isBreathing: boolean;
}

export type MemoryCategory = 'USER PROFILE' | 'PREFERENCES' | 'CONVERSATION' | 'SYSTEM' | string;
export type MemoryPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface MemoryRecord {
  id: string;
  memoryId: string;
  userId: string;
  category: MemoryCategory;
  key: string;
  value: string;
  content: string;
  priority: MemoryPriority;
  importance: MemoryPriority;
  retention: string;
  source: string;
  lastRecalled: string;
  isPermanent: boolean;
  createdAt: number;
  updatedAt: number;
}


