import type { GenerateContentParameters } from '@google/genai';

export interface ContentItem {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface FallbackParams {
  contents: ContentItem[] | GenerateContentParameters['contents'];
  config?: GenerateContentParameters['config'];
}

export interface InteractionPayload {
  role?: string;
  text?: string;
}

export interface LocationPayload {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  placeId?: string;
}

export interface ReflectRequestBody {
  prompt?: string;
  history?: InteractionPayload[];
  mode?: string;
  entryContext?: string;
  mood?: string;
  entryId?: string;
  location?: LocationPayload | null;
}

export interface SummarizeRequestBody {
  title?: string;
  content?: string;
  interactions?: InteractionPayload[];
  location?: LocationPayload | null;
}

export interface TranscribeRequestBody {
  audioBase64?: string;
  mimeType?: string;
  prompt?: string;
}

export interface InsightResult {
  summary: string;
  moodTone: string;
  keyTakeaways: string[];
  reflectionQuestions: string[];
  actionableSteps: string[];
  tags: string[];
}
