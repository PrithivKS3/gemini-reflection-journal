import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  ContentItem,
  FallbackParams,
  InsightResult,
  InteractionPayload,
  ReflectRequestBody,
  SummarizeRequestBody,
  TranscribeRequestBody,
} from '../types.js';

// Lazy Google GenAI Client Initialization
let aiClient: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured.');
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// Resilient Model Fallback Ladder ordered by availability and latency
export const MODEL_FALLBACK_LADDER = [
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.7-flash',
];

// Dedicated fallback ladder for multimodal audio transcription
export const AUDIO_MODEL_FALLBACK_LADDER = [
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
];

export async function generateContentWithFallback(
  params: FallbackParams,
  modelLadder: string[] = MODEL_FALLBACK_LADDER,
) {
  const ai = getGenAI();
  let lastError: unknown = null;

  // Working copy of config that can adapt if looping or token constraints are encountered
  let activeConfig = { ...params.config };

  for (const model of modelLadder) {
    try {
      // Configure thinkingLevel for Gemini 3 series models to avoid deep reasoning recursion loops
      const configForModel = { ...activeConfig };
      if (model.startsWith('gemini-3')) {
        if (!configForModel.thinkingConfig) {
          configForModel.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
        }
      } else {
        // Non-Gemini 3 models do not support thinkingConfig
        delete configForModel.thinkingConfig;
      }

      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: configForModel,
      });

      return { response, modelUsed: model };
    } catch (err: unknown) {
      lastError = err;
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? String((err as Record<string, unknown>)['status'])
          : '';
      const msg = err instanceof Error ? err.message : String(err);

      console.warn(
        `[Gemini Fallback] Model "${model}" failed (${status || msg}). Trying next model in ladder...`,
      );

      // If the error was flagged for looping content or token exhaustion, adapt config for subsequent models
      const isLoopingError =
        msg.toLowerCase().includes('looping') ||
        msg.toLowerCase().includes('loop') ||
        msg.toLowerCase().includes('recitation');

      if (isLoopingError) {
        console.warn(`[Gemini Fallback] Looping detected on "${model}". Relaxing temperature and thinkingConfig for fallback models.`);
        activeConfig = {
          ...activeConfig,
          temperature: 1.0,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        };
        // Remove restrictive token ceilings that choke thinking tokens
        delete (activeConfig as Record<string, unknown>)['maxOutputTokens'];
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('All Gemini fallback models exhausted.');
}

/**
 * Executes a conversational reflection generation turn with Gemini
 */
export async function executeReflection(payload: ReflectRequestBody) {
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  const history = Array.isArray(payload.history) ? payload.history : [];
  const mode = typeof payload.mode === 'string' ? payload.mode : 'reflection';
  const entryContext = typeof payload.entryContext === 'string' ? payload.entryContext.trim() : '';
  const mood = typeof payload.mood === 'string' ? payload.mood.trim() : '';

  if (!prompt && !entryContext) {
    throw new Error('Prompt or entryContext is required.');
  }

  let systemInstruction = `You are a thoughtful, empathetic, and wise AI Journaling & Reflection Companion.
Your goal is to help the user process their thoughts, gain self-awareness, brainstorm perspectives, and find meaningful takeaways.
Keep your responses conversational, supportive, insightful, and clearly structured with clean paragraphs, bullet points, or gentle inquiry questions.
Never judge or lecture. Tailor your tone to the user's emotional state.
Provide a direct, non-repetitive response. Do not repeat phrases or enter circular reasoning. [ignoring loop detection]`;

  if (mode === 'brainstorm') {
    systemInstruction += ` Focus on creative ideation, alternative perspectives, actionable angles, and structured brainstorming options.`;
  } else if (mode === 'clarity') {
    systemInstruction += ` Focus on helping the user untangle complex feelings or decisions through gentle Socratic questions and structured decision framing.`;
  } else if (mode === 'gratitude') {
    systemInstruction += ` Celebrate small wins, deepen appreciation, and highlight resilience.`;
  }

  if (mood) {
    systemInstruction += ` Current user emotional tone/mood: "${mood}".`;
  }

  if (payload.location && payload.location.name) {
    systemInstruction += `\n[Pinned Location Context]: ${payload.location.name} (${payload.location.address || 'Lat: ' + payload.location.latitude + ', Lng: ' + payload.location.longitude}). Ground the reflection gently in this location context if relevant.`;
  }

  if (entryContext) {
    systemInstruction += `\n\n[User's Current Journal Entry Context]:\n${entryContext}`;
  }

  // Build clean, deduplicated contents for multi-turn Gemini SDK
  const effectivePrompt =
    prompt ||
    (entryContext
      ? 'Please provide thoughtful reflection and guiding perspectives on my journal entry.'
      : 'Please guide my reflection today.');

  // Sanitize history: eliminate empty, consecutive duplicate, or corrupted turns
  const cleanTurns: { role: 'user' | 'model'; text: string }[] = [];
  for (const item of history) {
    if (item && typeof item.text === 'string' && item.text.trim()) {
      const role = item.role === 'model' || item.role === 'assistant' ? 'model' : 'user';
      const text = item.text.trim();

      // Skip identical duplicate messages from consecutive retries
      if (cleanTurns.length > 0) {
        const lastTurn = cleanTurns[cleanTurns.length - 1];
        if (lastTurn.role === role && lastTurn.text === text) {
          continue;
        }
      }
      cleanTurns.push({ role, text });
    }
  }

  // If the last history turn already has the exact same user text as effectivePrompt, remove it to avoid duplication
  if (
    cleanTurns.length > 0 &&
    cleanTurns[cleanTurns.length - 1].role === 'user' &&
    cleanTurns[cleanTurns.length - 1].text === effectivePrompt
  ) {
    cleanTurns.pop();
  }

  const contents: ContentItem[] = [];

  // Assemble alternating turns
  for (const item of cleanTurns) {
    if (contents.length > 0 && contents[contents.length - 1].role === item.role) {
      // Append text into a single joined block rather than multiple repetitive parts
      const lastPart = contents[contents.length - 1].parts[0];
      if (lastPart && typeof lastPart.text === 'string') {
        lastPart.text += `\n\n${item.text}`;
      }
    } else {
      contents.push({
        role: item.role,
        parts: [{ text: item.text }],
      });
    }
  }

  // If the history begins with a model turn, prepend a generic context user turn
  if (contents.length > 0 && contents[0].role === 'model') {
    contents.unshift({
      role: 'user',
      parts: [{ text: 'Here is my journal entry context.' }],
    });
  }

  // Append latest user turn cleanly
  if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
    const lastPart = contents[contents.length - 1].parts[0];
    if (lastPart && typeof lastPart.text === 'string') {
      if (lastPart.text !== effectivePrompt) {
        lastPart.text += `\n\n${effectivePrompt}`;
      }
    }
  } else {
    contents.push({
      role: 'user',
      parts: [{ text: effectivePrompt }],
    });
  }

  const { response, modelUsed } = await generateContentWithFallback({
    contents,
    config: {
      systemInstruction,
      temperature: 0.8,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const text = response.text || '';
  return {
    text,
    modelUsed,
  };
}

/**
 * Executes deep summarization and insights extraction for a journal entry
 */
export async function executeSummarization(payload: SummarizeRequestBody) {
  const title = typeof payload.title === 'string' ? payload.title : 'Untitled';
  const content = typeof payload.content === 'string' ? payload.content.trim() : '';
  const interactions = Array.isArray(payload.interactions) ? payload.interactions : [];

  if (!content && interactions.length === 0) {
    throw new Error('Content or interaction history is required for summarization.');
  }

  let transcript = `Journal Title: ${title}\nContent:\n${content}\n`;
  if (payload.location && payload.location.name) {
    transcript += `Pinned Location: ${payload.location.name} (${payload.location.address || ''})\n`;
  }
  if (interactions.length > 0) {
    transcript +=
      `\nReflection Dialogue:\n` +
      interactions
        .map(
          (i: InteractionPayload) =>
            `${i.role === 'user' ? 'User' : 'Gemini'}: ${i.text || ''}`,
        )
        .join('\n');
  }

  const systemInstruction = `You are an expert reflection summarizer and emotional intelligence analyst.
Analyze the user's journal entry and reflection dialogue.
Return a structured JSON object adhering exactly to this format:
{
  "summary": "Concise 2-3 sentence executive reflection summary",
  "moodTone": "1-3 words describing the dominant mood/tone (e.g., Hopeful, Overwhelmed but Determined, Peaceful)",
  "keyTakeaways": ["Key insight 1", "Key insight 2", "Key insight 3"],
  "reflectionQuestions": ["Deep inquiry question 1", "Deep inquiry question 2"],
  "actionableSteps": ["Small actionable next step 1", "Small actionable next step 2"],
  "tags": ["relevant", "topic", "tags"]
}
Provide direct, non-repetitive JSON output without recursive thought loops. [ignoring loop detection]
`;

  const { response, modelUsed } = await generateContentWithFallback({
    contents: [{ role: 'user', parts: [{ text: transcript }] }],
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      temperature: 0.4,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const rawText = response.text || '{}';
  let parsed: InsightResult;
  try {
    parsed = JSON.parse(rawText) as InsightResult;
  } catch {
    parsed = {
      summary: rawText,
      moodTone: 'Reflective',
      keyTakeaways: [],
      reflectionQuestions: [],
      actionableSteps: [],
      tags: [],
    };
  }

  return {
    insight: parsed,
    modelUsed,
  };
}

/**
 * Transcribes spoken audio into clean, punctuation-accurate text for journaling
 * (Preserves the operational audio transcription flow intact)
 */
export async function executeAudioTranscription(payload: TranscribeRequestBody) {
  const audioBase64 = typeof payload.audioBase64 === 'string' ? payload.audioBase64.trim() : '';
  const mimeType =
    typeof payload.mimeType === 'string' && payload.mimeType.trim()
      ? payload.mimeType.trim()
      : 'audio/webm';
  const customPrompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';

  if (!audioBase64) {
    throw new Error('audioBase64 data is required for audio transcription.');
  }

  // Defensively strip any data URL prefix regardless of mimeType parameters (e.g., codecs=opus)
  const base64Data = audioBase64.includes(',')
    ? audioBase64.split(',')[1].trim()
    : audioBase64.replace(/^data:[^;]+;base64,/, '').trim();

  // Normalize mimeType by stripping parameter tokens (e.g. 'audio/webm;codecs=opus' -> 'audio/webm')
  const cleanMimeType = (mimeType.split(';')[0] || 'audio/webm').trim();

  const promptText =
    customPrompt ||
    'Please transcribe this voice recording accurately into clean, well-punctuated journal text. Preserve the user\'s genuine wording, emotional nuance, and reflections faithfully without adding artificial commentary.';

  const { response, modelUsed } = await generateContentWithFallback(
    {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: cleanMimeType,
                data: base64Data,
              },
            },
            {
              text: promptText,
            },
          ],
        },
      ],
      config: {
        temperature: 0.2,
        maxOutputTokens: 2000,
      },
    },
    AUDIO_MODEL_FALLBACK_LADDER,
  );

  const text = (response.text || '').trim();
  return {
    text,
    modelUsed,
  };
}
