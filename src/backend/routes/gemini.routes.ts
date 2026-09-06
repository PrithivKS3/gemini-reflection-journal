import { Router, Request, Response } from 'express';
import {
  executeAudioTranscription,
  executeReflection,
  executeSummarization,
} from '../services/gemini.service.js';
import {
  ReflectRequestBody,
  SummarizeRequestBody,
  TranscribeRequestBody,
} from '../types.js';

export const geminiRouter = Router();

/**
 * POST /api/gemini/reflect
 * Multi-turn conversational journaling companion that provides empathetic,
 * constructive reflections, Socratic questions, and insights.
 */
geminiRouter.post('/reflect', async (req: Request, res: Response): Promise<void> => {
  try {
    const data =
      req.body && typeof req.body === 'object'
        ? (req.body as ReflectRequestBody)
        : ({} as ReflectRequestBody);

    const result = await executeReflection(data);

    res.json({
      success: true,
      text: result.text,
      modelUsed: result.modelUsed,
    });
  } catch (error: unknown) {
    console.error('Error in /api/gemini/reflect:', error);
    const msg =
      error instanceof Error
        ? error.message
        : 'Failed to generate reflection response with Gemini API.';
    const status = msg.includes('required') ? 400 : 500;
    res.status(status).json({
      error: msg,
    });
  }
});

/**
 * POST /api/gemini/summarize
 * Summarizes a journal entry, extracts emotional themes, key takeaways, and action items.
 */
geminiRouter.post('/summarize', async (req: Request, res: Response): Promise<void> => {
  try {
    const data =
      req.body && typeof req.body === 'object'
        ? (req.body as SummarizeRequestBody)
        : ({} as SummarizeRequestBody);

    const result = await executeSummarization(data);

    res.json({
      success: true,
      insight: result.insight,
      modelUsed: result.modelUsed,
    });
  } catch (error: unknown) {
    console.error('Error in /api/gemini/summarize:', error);
    const msg =
      error instanceof Error
        ? error.message
        : 'Failed to summarize journal entry with Gemini API.';
    const status = msg.includes('required') ? 400 : 500;
    res.status(status).json({
      error: msg,
    });
  }
});

/**
 * POST /api/gemini/transcribe
 * Multimodal audio transcription: Converts spoken audio recordings into clean text
 */
geminiRouter.post('/transcribe', async (req: Request, res: Response): Promise<void> => {
  try {
    const data =
      req.body && typeof req.body === 'object'
        ? (req.body as TranscribeRequestBody)
        : ({} as TranscribeRequestBody);

    const result = await executeAudioTranscription(data);

    res.json({
      success: true,
      text: result.text,
      modelUsed: result.modelUsed,
    });
  } catch (error: unknown) {
    console.error('Error in /api/gemini/transcribe:', error);
    const msg =
      error instanceof Error
        ? error.message
        : 'Failed to transcribe audio recording with Gemini API.';
    const status = msg.includes('required') ? 400 : 500;
    res.status(status).json({
      error: msg,
    });
  }
});

