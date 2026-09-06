import {Injectable, inject, signal} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {firstValueFrom} from 'rxjs';
import {GeminiInsight, InteractionMessage, JournalLocation} from '../models/journal.models';

interface ReflectResponse {
  success: boolean;
  text: string;
  modelUsed?: string;
  error?: string;
}

interface SummarizeResponse {
  success: boolean;
  insight: GeminiInsight;
  modelUsed?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private readonly http = inject(HttpClient);

  readonly isThinking = signal<boolean>(false);
  readonly isSummarizing = signal<boolean>(false);
  readonly isTranscribing = signal<boolean>(false);
  readonly reflectionError = signal<string | null>(null);
  readonly summarizeError = signal<string | null>(null);
  readonly transcribeError = signal<string | null>(null);
  readonly apiError = signal<string | null>(null);

  /**
   * Generates a multi-turn reflection reply from Gemini.
   */
  async generateReflection(params: {
    prompt: string;
    history?: InteractionMessage[];
    mode?: string;
    entryContext?: string;
    mood?: string;
    location?: JournalLocation | null;
  }): Promise<{ text: string; modelUsed?: string }> {
    this.isThinking.set(true);
    this.reflectionError.set(null);
    this.apiError.set(null);

    try {
      const res = await firstValueFrom(
        this.http.post<ReflectResponse>('/api/gemini/reflect', params),
      );

      if (!res.success) {
        throw new Error(res.error || 'Failed to generate reflection from Gemini.');
      }

      return {
        text: res.text,
        modelUsed: res.modelUsed,
      };
    } catch (err: unknown) {
      console.error('Error generating reflection:', err);
      let msg = 'Gemini API connection error. Please try again.';
      if (typeof err === 'object' && err !== null && 'error' in err) {
        const nestedErr = (err as Record<string, unknown>)['error'];
        if (typeof nestedErr === 'object' && nestedErr !== null && 'error' in nestedErr) {
          msg = String((nestedErr as Record<string, unknown>)['error']);
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      this.reflectionError.set(msg);
      this.apiError.set(msg);
      throw new Error(msg);
    } finally {
      this.isThinking.set(false);
    }
  }

  /**
   * Generates structured insights & summaries of the journal entry.
   */
  async summarizeJournalEntry(params: {
    title?: string;
    content: string;
    interactions?: InteractionMessage[];
    location?: JournalLocation | null;
  }): Promise<{ insight: GeminiInsight; modelUsed?: string }> {
    this.isSummarizing.set(true);
    this.summarizeError.set(null);

    try {
      const res = await firstValueFrom(
        this.http.post<SummarizeResponse>('/api/gemini/summarize', params),
      );

      if (!res.success || !res.insight) {
        throw new Error(res.error || 'Failed to generate summary.');
      }

      return {
        insight: res.insight,
        modelUsed: res.modelUsed,
      };
    } catch (err: unknown) {
      console.error('Error summarizing journal entry:', err);
      let msg = 'Gemini summarization failed.';
      if (typeof err === 'object' && err !== null && 'error' in err) {
        const nestedErr = (err as Record<string, unknown>)['error'];
        if (typeof nestedErr === 'object' && nestedErr !== null && 'error' in nestedErr) {
          msg = String((nestedErr as Record<string, unknown>)['error']);
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      this.summarizeError.set(msg);
      throw new Error(msg);
    } finally {
      this.isSummarizing.set(false);
    }
  }

  /**
   * Transcribes an audio recording buffer (Base64) into text via Gemini
   */
  async transcribeAudio(params: {
    audioBase64: string;
    mimeType?: string;
    prompt?: string;
  }): Promise<{ text: string; modelUsed?: string }> {
    this.isTranscribing.set(true);
    this.transcribeError.set(null);

    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; text: string; modelUsed?: string; error?: string }>(
          '/api/gemini/transcribe',
          params,
        ),
      );

      if (!res.success) {
        throw new Error(res.error || 'Failed to transcribe audio with Gemini.');
      }

      return {
        text: res.text,
        modelUsed: res.modelUsed,
      };
    } catch (err: unknown) {
      console.error('Error transcribing audio recording:', err);
      let msg = 'Audio transcription failed. Please try again or type directly.';
      if (typeof err === 'object' && err !== null && 'error' in err) {
        const nestedErr = (err as Record<string, unknown>)['error'];
        if (typeof nestedErr === 'object' && nestedErr !== null && 'error' in nestedErr) {
          msg = String((nestedErr as Record<string, unknown>)['error']);
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      this.transcribeError.set(msg);
      throw new Error(msg);
    } finally {
      this.isTranscribing.set(false);
    }
  }
}
