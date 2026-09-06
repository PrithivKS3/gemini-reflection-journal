export interface UserProfile {
  userId: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role?: 'admin' | 'user';
  createdAt: string;
  lastLoginAt: string;
}

export interface JournalLocation {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  placeId?: string;
}

export interface InteractionMessage {
  id?: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  modelUsed?: string;
}

export interface GeminiInsight {
  summary: string;
  moodTone: string;
  keyTakeaways: string[];
  reflectionQuestions: string[];
  actionableSteps: string[];
  tags: string[];
}

export type JournalMood =
  | 'peaceful'
  | 'inspired'
  | 'focused'
  | 'anxious'
  | 'reflective'
  | 'grateful'
  | 'seeking_clarity';

export type JournalMode =
  | 'reflection'
  | 'brainstorm'
  | 'clarity'
  | 'gratitude'
  | 'freeform';

export interface JournalEntry {
  id: string;
  userId: string;
  title: string;
  content: string;
  mood: JournalMood;
  mode: JournalMode;
  tags: string[];
  location?: JournalLocation | null;
  geminiInsight?: GeminiInsight | null;
  interactions: InteractionMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface SavedInteractionRecord {
  id: string;
  userId: string;
  entryId?: string;
  prompt: string;
  response: string;
  mode: string;
  timestamp: string;
  createdAt: string;
}
