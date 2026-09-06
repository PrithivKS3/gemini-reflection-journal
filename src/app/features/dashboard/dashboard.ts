import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  effect,
  PLATFORM_ID,
} from '@angular/core';
import {CommonModule, isPlatformBrowser} from '@angular/common';
import {ReactiveFormsModule, FormGroup, FormControl, Validators} from '@angular/forms';
import {Router} from '@angular/router';
import {MatIconModule} from '@angular/material/icon';
import {FirebaseService} from '../../core/services/firebase.service';
import {JournalService} from '../../core/services/journal.service';
import {GeminiService} from '../../core/services/gemini.service';
import {MapsService, POPULAR_LOCATION_PRESETS} from '../../core/services/maps.service';
import {
  JournalEntry,
  InteractionMessage,
  GeminiInsight,
  JournalMood,
  JournalMode,
  JournalLocation,
} from '../../core/models/journal.models';

const DEFAULT_SPARKS = [
  'What moment or interaction gave me the most energy today?',
  'What friction or tension did I notice, and what is it trying to teach me?',
  'If fear were completely removed, what decision would I make right now?',
  'What are three subtle things I am genuinely grateful for today?',
  'What is one boundary or priority I need to protect this week?',
];

const QUICK_AI_QUESTIONS = [
  { label: 'Spot Blind Spots', prompt: 'What underlying blind spots or emotional patterns do you notice in my entry?' },
  { label: 'Positive Reframe', prompt: 'How can I reframe the core challenge here into an empowering growth opportunity?' },
  { label: '3 Action Steps', prompt: 'Based on what I wrote, suggest 3 realistic and low-friction next steps.' },
  { label: 'Deep Inquiry', prompt: 'What 2 probing questions should I ask myself to gain deeper clarity?' },
];

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './dashboard.html',
})
export class DashboardComponent {
  readonly firebaseService = inject(FirebaseService);
  readonly journalService = inject(JournalService);
  readonly geminiService = inject(GeminiService);
  readonly mapsService = inject(MapsService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  // Active entry state
  readonly activeEntryId = signal<string | null>(null);
  readonly activeMood = signal<JournalMood>('reflective');
  readonly activeMode = signal<JournalMode>('reflection');
  readonly activeLocation = signal<JournalLocation | null>(null);
  readonly activeInteractions = signal<InteractionMessage[]>([]);
  readonly activeInsight = signal<GeminiInsight | null>(null);
  readonly activeCreatedAt = signal<string>(new Date().toISOString());

  // Location modal & search state
  readonly isLocationModalOpen = signal<boolean>(false);
  readonly isDetectingLocation = signal<boolean>(false);
  readonly locationSearchInput = signal<string>('');
  readonly locationSearchResults = signal<JournalLocation[]>([]);
  readonly isSearchingLocation = signal<boolean>(false);
  readonly locationError = signal<string | null>(null);
  readonly locationPresets = POPULAR_LOCATION_PRESETS;
  readonly viewingMapLocation = signal<JournalLocation | null>(null);

  // Search and filter state
  readonly searchQuery = signal<string>('');
  readonly selectedMoodFilter = signal<string>('all');
  readonly isSidebarOpen = signal<boolean>(true);
  readonly saveSuccessBanner = signal<boolean>(false);
  readonly copyBanner = signal<string | null>(null);

  // Input Type Mode: 'text' or 'audio'
  readonly inputMode = signal<'text' | 'audio'>('text');

  // Audio Recording & Transcription State
  readonly isRecording = signal<boolean>(false);
  readonly recordingDuration = signal<number>(0);
  readonly audioErrorMessage = signal<string | null>(null);
  readonly liveSpeechTranscript = signal<string>('');
  readonly audioSuccessNotice = signal<string | null>(null);

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingInterval: ReturnType<typeof setInterval> | null = null;
  private speechRecognitionInstance: {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: Event) => void) | null;
    onerror: ((event: Event) => void) | null;
    start: () => void;
    stop: () => void;
  } | null = null;

  // Reactive Forms for Journal Entry and AI Chat Input
  readonly entryForm = new FormGroup({
    title: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    content: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    tagInput: new FormControl<string>('', { nonNullable: true }),
  });

  readonly chatForm = new FormGroup({
    prompt: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  readonly activeTags = signal<string[]>([]);
  readonly sparkPrompts = signal<string[]>(DEFAULT_SPARKS);
  readonly quickAiQuestions = signal(QUICK_AI_QUESTIONS);

  // Filtered entries computed
  readonly filteredEntries = computed(() => {
    const list = this.journalService.entries();
    const rawQuery = this.searchQuery().toLowerCase().trim();
    const moodFilter = this.selectedMoodFilter();

    return list.filter((item) => {
      const matchesMood = moodFilter === 'all' || item.mood === moodFilter;
      if (!matchesMood) return false;

      if (!rawQuery) return true;

      // Handle both '#tag' and 'tag' queries seamlessly
      const query = rawQuery.startsWith('#') ? rawQuery.slice(1).trim() : rawQuery;
      if (!query) return true;

      const titleMatch = (item.title || '').toLowerCase().includes(query);
      const contentMatch = (item.content || '').toLowerCase().includes(query);
      const modeMatch = (item.mode || '').toLowerCase().includes(query);
      const moodMatch = (item.mood || '').toLowerCase().includes(query);
      const tagMatch = Array.isArray(item.tags) && item.tags.some((t) => {
        if (!t) return false;
        const normalizedTag = t.toLowerCase().trim().replace(/^#/, '');
        return normalizedTag.includes(query) || t.toLowerCase().includes(rawQuery);
      });
      const summaryMatch = (item.geminiInsight?.summary || '').toLowerCase().includes(query);
      const takeawaysMatch = Array.isArray(item.geminiInsight?.keyTakeaways) &&
        item.geminiInsight.keyTakeaways.some((k) => (k || '').toLowerCase().includes(query));

      return titleMatch || contentMatch || modeMatch || moodMatch || tagMatch || summaryMatch || takeawaysMatch;
    });
  });

  readonly currentEntryTitle = computed(() => {
    const titleVal = this.entryForm.controls.title.value;
    return titleVal.trim() || 'Untitled Reflection';
  });

  private hasInitializedFirstEntry = false;

  constructor() {
    // Redirect if unauthenticated (browser only)
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      const user = this.firebaseService.currentUser();
      const initialized = this.firebaseService.isAuthInitialized();
      if (initialized && !user) {
        this.router.navigate(['/']);
      }
    });

    // Auto-select latest entry on initial startup if available, without overriding explicit user actions
    effect(() => {
      const entries = this.journalService.entries();
      const isLoading = this.journalService.isLoadingEntries();
      if (!isLoading && !this.hasInitializedFirstEntry) {
        this.hasInitializedFirstEntry = true;
        if (entries.length > 0) {
          this.loadEntry(entries[0]);
        } else {
          this.initNewEntry();
        }
      }
    });
  }

  // --- Entry Lifecycle ---

  initNewEntry(mode: JournalMode = 'reflection') {
    this.hasInitializedFirstEntry = true;
    this.activeEntryId.set(null);
    this.activeMood.set('reflective');
    this.activeMode.set(mode);
    this.activeLocation.set(null);
    this.activeInteractions.set([]);
    this.activeInsight.set(null);
    const initialTags = mode === 'reflection' ? ['reflection'] : ['reflection', mode];
    this.activeTags.set(Array.from(new Set(initialTags)));
    this.activeCreatedAt.set(new Date().toISOString());

    this.entryForm.reset({
      title: '',
      content: '',
      tagInput: '',
    });
    this.chatForm.reset({
      prompt: '',
    });
    this.saveSuccessBanner.set(false);
  }

  loadEntry(entry: JournalEntry) {
    this.hasInitializedFirstEntry = true;
    this.activeEntryId.set(entry.id);
    this.activeMood.set(entry.mood || 'reflective');
    this.activeMode.set(entry.mode || 'reflection');
    this.activeLocation.set(entry.location || null);
    this.activeInteractions.set(entry.interactions || []);
    this.activeInsight.set(entry.geminiInsight || null);
    const sanitizedTags = Array.from(new Set((entry.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean)));
    this.activeTags.set(sanitizedTags);
    this.activeCreatedAt.set(entry.createdAt || new Date().toISOString());

    this.entryForm.setValue({
      title: entry.title || '',
      content: entry.content || '',
      tagInput: '',
    });
    this.chatForm.reset({
      prompt: '',
    });
  }

  setMood(mood: JournalMood) {
    this.activeMood.set(mood);
  }

  setMode(mode: JournalMode) {
    this.activeMode.set(mode);
    const normalizedMode = mode.toLowerCase();
    if (!this.activeTags().includes(normalizedMode)) {
      this.activeTags.update((tags) => Array.from(new Set([...tags, normalizedMode])));
    }
  }

  addTag() {
    const rawVal = this.entryForm.controls.tagInput.value.trim().toLowerCase();
    const val = rawVal.replace(/^#/, '').trim();
    if (val && !this.activeTags().includes(val)) {
      this.activeTags.update((tags) => Array.from(new Set([...tags, val])));
      this.entryForm.controls.tagInput.setValue('');
    }
  }

  removeTag(tagToRemove: string) {
    this.activeTags.update((tags) => tags.filter((t) => t !== tagToRemove));
  }

  applySpark(spark: string) {
    const current = this.entryForm.controls.content.value;
    const separator = current.trim() ? '\n\n' : '';
    this.entryForm.controls.content.setValue(
      `${current}${separator}# Prompt: ${spark}\n`,
    );
  }

  // --- Save to Firestore ---

  async saveCurrentEntry(): Promise<JournalEntry | null> {
    const title = this.entryForm.controls.title.value.trim() || 'Untitled Reflection';
    const content = this.entryForm.controls.content.value;

    try {
      const sanitizedTags = Array.from(new Set(this.activeTags().map((t) => t.trim().toLowerCase()).filter(Boolean)));
      const saved = await this.journalService.saveEntry({
        id: this.activeEntryId() || undefined,
        title,
        content,
        mood: this.activeMood(),
        mode: this.activeMode(),
        tags: sanitizedTags,
        location: this.activeLocation(),
        geminiInsight: this.activeInsight(),
        interactions: this.activeInteractions(),
        createdAt: this.activeCreatedAt(),
      });

      this.activeEntryId.set(saved.id);
      this.saveSuccessBanner.set(true);
      setTimeout(() => this.saveSuccessBanner.set(false), 3500);
      return saved;
    } catch (err) {
      console.error('Save failed:', err);
      return null;
    }
  }

  private lastReflectionPrompt = '';

  // --- Multi-Turn Reflection Dialogue with Gemini ---

  async sendChatMessage(customPrompt?: string) {
    const currentContent = this.entryForm.controls.content.value.trim();
    const inputPrompt = this.chatForm.controls.prompt.value.trim();

    let promptText = customPrompt || inputPrompt;
    if (!promptText) {
      if (this.lastReflectionPrompt) {
        promptText = this.lastReflectionPrompt;
      } else if (currentContent) {
        promptText = 'Please reflect on my journal entry and share your thoughts, insights, and guiding questions.';
      } else {
        return;
      }
    }

    if (this.geminiService.isThinking()) return;

    this.lastReflectionPrompt = promptText;
    if (!customPrompt) {
      this.chatForm.reset({ prompt: '' });
    }

    const now = new Date().toISOString();
    const previousHistory = [...this.activeInteractions()];

    const userMessage: InteractionMessage = {
      role: 'user',
      text: promptText,
      timestamp: now,
    };

    // Optimistically push user message to UI
    this.activeInteractions.update((list) => [...list, userMessage]);

    try {
      const result = await this.geminiService.generateReflection({
        prompt: promptText,
        history: previousHistory,
        mode: this.activeMode(),
        entryContext: currentContent,
        mood: this.activeMood(),
        location: this.activeLocation(),
      });

      const modelMessage: InteractionMessage = {
        role: 'model',
        text: result.text,
        timestamp: new Date().toISOString(),
        modelUsed: result.modelUsed,
      };

      this.activeInteractions.update((list) => [...list, modelMessage]);

      // Save interaction to Firestore audit collection
      await this.journalService.saveInteractionRecord({
        prompt: promptText,
        response: result.text,
        mode: this.activeMode(),
        entryId: this.activeEntryId() || undefined,
      });

      // Auto-save entry with updated dialogue
      await this.saveCurrentEntry();
    } catch (err: unknown) {
      console.error('Chat reflection failed:', err);
      // Clean up un-replied optimistic turn so history isn't corrupted by repeated duplicates
      this.activeInteractions.update((list) => list.filter((m) => m !== userMessage));
      // Re-populate the chat form if user originally typed it
      if (!customPrompt && !this.chatForm.controls.prompt.value) {
        this.chatForm.controls.prompt.setValue(promptText);
      }
    }
  }

  retryReflection() {
    this.geminiService.reflectionError.set(null);
    this.sendChatMessage(this.lastReflectionPrompt || undefined);
  }

  startEntryReflection() {
    this.sendChatMessage('Please reflect on my journal entry and share your observations, empathetic perspectives, and guiding questions.');
  }

  // --- Deep Summarization & Insights ---

  async generateInsights() {
    const title = this.entryForm.controls.title.value;
    const content = this.entryForm.controls.content.value;
    const interactions = this.activeInteractions();

    if (!content.trim() && interactions.length === 0) {
      this.copyBanner.set('Please write journal content or have a dialogue before generating insights.');
      setTimeout(() => this.copyBanner.set(null), 3000);
      return;
    }

    try {
      const { insight } = await this.geminiService.summarizeJournalEntry({
        title,
        content,
        interactions,
        location: this.activeLocation(),
      });

      this.activeInsight.set(insight);

      if (insight.tags && Array.isArray(insight.tags)) {
        const combined = Array.from(new Set([...this.activeTags(), ...insight.tags]));
        this.activeTags.set(combined);
      }

      await this.saveCurrentEntry();
    } catch (err: unknown) {
      console.error('Failed to generate insights:', err);
    }
  }

  // --- Actions ---

  async deleteActiveEntry() {
    const id = this.activeEntryId();
    if (!id) {
      this.initNewEntry();
      return;
    }

    try {
      await this.journalService.deleteEntry(id);
      this.copyBanner.set('Entry deleted.');
      setTimeout(() => this.copyBanner.set(null), 2500);
      this.initNewEntry();
    } catch (err: unknown) {
      console.error('Failed to delete entry:', err);
    }
  }

  exportMarkdown() {
    const title = this.entryForm.controls.title.value || 'Journal Entry';
    const content = this.entryForm.controls.content.value;
    const mood = this.activeMood();
    const date = new Date(this.activeCreatedAt()).toLocaleString();
    const insight = this.activeInsight();
    const interactions = this.activeInteractions();

    let md = `# ${title}\n\n**Date:** ${date}\n**Mood:** ${mood}\n**Tags:** ${this.activeTags().join(', ')}\n\n---\n\n## Journal Entry\n\n${content}\n\n`;

    if (insight) {
      md += `## Gemini AI Insights\n\n**Summary:** ${insight.summary}\n**Dominant Mood:** ${insight.moodTone}\n\n### Key Takeaways\n${insight.keyTakeaways.map((t) => `- ${t}`).join('\n')}\n\n### Reflection Questions\n${insight.reflectionQuestions.map((q) => `- ${q}`).join('\n')}\n\n### Action Steps\n${insight.actionableSteps.map((a) => `- [ ] ${a}`).join('\n')}\n\n`;
    }

    if (interactions.length > 0) {
      md += `## Reflection Dialogue\n\n`;
      interactions.forEach((item) => {
        md += `**${item.role === 'user' ? 'Me' : 'Gemini'}**: ${item.text}\n\n`;
      });
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  copyText(text: string) {
    navigator.clipboard.writeText(text);
    this.copyBanner.set('Copied to clipboard!');
    setTimeout(() => this.copyBanner.set(null), 2500);
  }

  // --- Input Mode & Audio Recording Functionality ---

  setInputMode(mode: 'text' | 'audio') {
    this.inputMode.set(mode);
    this.audioErrorMessage.set(null);
  }

  get formattedDuration(): string {
    const totalSecs = this.recordingDuration();
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  async startAudioRecording() {
    this.audioErrorMessage.set(null);
    this.audioSuccessNotice.set(null);
    this.liveSpeechTranscript.set('');
    this.recordingDuration.set(0);
    this.audioChunks = [];

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.audioErrorMessage.set('Audio recording is not supported in this browser environment.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Prefer standard modern webm/opus, fallback to basic webm
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }

      this.mediaRecorder = new MediaRecorder(stream, { mimeType });

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        // Stop all audio tracks to release microphone hardware safely
        stream.getTracks().forEach((track) => track.stop());
        await this.processRecordedAudio();
      };

      this.mediaRecorder.start(250); // Collect slice every 250ms
      this.isRecording.set(true);

      // Start duration ticker
      this.recordingInterval = setInterval(() => {
        this.recordingDuration.update((d) => d + 1);
      }, 1000);

      // Optional Hybrid Speech Recognition for live visual feedback
      this.startLiveSpeechRecognition();
    } catch (err: unknown) {
      console.error('Microphone access failed:', err);
      const msg = err instanceof Error ? err.message : 'Microphone permission was denied or is unavailable.';
      this.audioErrorMessage.set(msg);
      this.isRecording.set(false);
    }
  }

  stopAudioRecording() {
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }

    this.stopLiveSpeechRecognition();

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.isRecording.set(false);
  }

  cancelAudioRecording() {
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
    this.stopLiveSpeechRecognition();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    this.audioChunks = [];
    this.isRecording.set(false);
    this.recordingDuration.set(0);
    this.liveSpeechTranscript.set('');
  }

  private startLiveSpeechRecognition() {
    try {
      const windowObj = window as unknown as Record<string, unknown>;
      type SpeechRecognitionCtor = new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: ((event: Event) => void) | null;
        onerror: ((event: Event) => void) | null;
        start: () => void;
        stop: () => void;
      };
      const SpeechRecognitionClass = (windowObj['SpeechRecognition'] ||
        windowObj['webkitSpeechRecognition']) as SpeechRecognitionCtor | undefined;

      if (SpeechRecognitionClass) {
        this.speechRecognitionInstance = new SpeechRecognitionClass();
        this.speechRecognitionInstance.continuous = true;
        this.speechRecognitionInstance.interimResults = true;
        this.speechRecognitionInstance.lang = 'en-US';

        this.speechRecognitionInstance.onresult = (event: Event) => {
          const recEvent = event as unknown as {
            results: ArrayLike<ArrayLike<{ transcript: string }>>;
          };
          let liveText = '';
          const resultsArray = Array.from(recEvent.results);
          for (const res of resultsArray) {
            if (res[0]) {
              liveText += res[0].transcript + ' ';
            }
          }
          this.liveSpeechTranscript.set(liveText.trim());
        };

        this.speechRecognitionInstance.onerror = (event: Event) => {
          const errEvent = event as unknown as { error?: string };
          console.warn('Speech recognition warning:', errEvent.error);
        };

        this.speechRecognitionInstance.start();
      }
    } catch {
      // Non-blocking: will rely on Gemini Multimodal transcription
    }
  }

  private stopLiveSpeechRecognition() {
    if (this.speechRecognitionInstance) {
      try {
        this.speechRecognitionInstance.stop();
      } catch {
        // Safe ignore
      }
      this.speechRecognitionInstance = null;
    }
  }

  private async processRecordedAudio() {
    if (this.audioChunks.length === 0) {
      this.audioErrorMessage.set('No audio recorded.');
      return;
    }

    const audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
    this.audioChunks = [];

    // Check size limit: 15MB maximum
    if (audioBlob.size > 15 * 1024 * 1024) {
      this.audioErrorMessage.set('Audio recording exceeds the 15MB limit. Please record a shorter reflection.');
      return;
    }

    try {
      // Convert Blob to clean Base64 (without data URL prefix)
      const base64Data = await this.blobToBase64(audioBlob);
      const cleanMime = (audioBlob.type || 'audio/webm').split(';')[0].trim();

      const result = await this.geminiService.transcribeAudio({
        audioBase64: base64Data,
        mimeType: cleanMime,
      });

      const transcribedText = result.text.trim() || this.liveSpeechTranscript().trim();

      if (transcribedText) {
        const currentContent = this.entryForm.controls.content.value;
        const separator = currentContent.trim() ? '\n\n' : '';
        this.entryForm.controls.content.setValue(`${currentContent}${separator}${transcribedText}`);

        // If title is empty, generate an intuitive voice journal title
        if (!this.entryForm.controls.title.value.trim()) {
          const dateStr = new Date().toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          this.entryForm.controls.title.setValue(`Voice Reflection (${dateStr})`);
        }

        // Add 'voice-journal' tag
        if (!this.activeTags().includes('voice-journal')) {
          this.activeTags.update((t) => [...t, 'voice-journal']);
        }

        // Return user to Text Journal view with their transcribed content ready
        this.inputMode.set('text');

        this.audioSuccessNotice.set('Voice reflection transcribed and added to your journal text!');
        setTimeout(() => this.audioSuccessNotice.set(null), 4000);
      } else {
        this.audioErrorMessage.set('Could not detect clear speech in the recording. Please try speaking again.');
      }
    } catch (err: unknown) {
      console.error('Processing audio recording failed:', err);
      // Fallback: If Gemini transcription hit an error but browser speech API captured text, use it!
      const fallbackText = this.liveSpeechTranscript().trim();
      if (fallbackText) {
        const currentContent = this.entryForm.controls.content.value;
        const separator = currentContent.trim() ? '\n\n' : '';
        this.entryForm.controls.content.setValue(`${currentContent}${separator}${fallbackText}`);
        this.inputMode.set('text');
        this.audioSuccessNotice.set('Voice transcribed using browser speech recognition.');
        setTimeout(() => this.audioSuccessNotice.set(null), 4000);
      } else {
        const msg = err instanceof Error ? err.message : 'Audio transcription failed.';
        this.audioErrorMessage.set(msg);
      }
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = (reader.result as string) || '';
        const base64 = result.includes(',') ? result.split(',')[1].trim() : result.trim();
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // --- Location Pinning & Google Maps Features ---

  openLocationModal() {
    this.isLocationModalOpen.set(true);
    this.locationError.set(null);
  }

  closeLocationModal() {
    this.isLocationModalOpen.set(false);
    this.locationError.set(null);
    this.locationSearchResults.set([]);
  }

  onLocationSearchInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.locationSearchInput.set(input.value);
  }

  async detectDeviceLocation() {
    this.isDetectingLocation.set(true);
    this.locationError.set(null);

    try {
      const coords = await this.mapsService.getCurrentCoordinates();
      const loc = await this.mapsService.reverseGeocode(coords.latitude, coords.longitude);
      this.activeLocation.set(loc);
      this.closeLocationModal();
      this.saveCurrentEntry();
    } catch (err: unknown) {
      console.error('Location detection failed:', err);
      const msg = err instanceof Error ? err.message : 'Unable to acquire GPS coordinates.';
      this.locationError.set(msg);
    } finally {
      this.isDetectingLocation.set(false);
    }
  }

  async searchLocationPlaces() {
    const query = this.locationSearchInput().trim();
    if (!query) return;

    this.isSearchingLocation.set(true);
    this.locationError.set(null);

    try {
      const results = await this.mapsService.searchLocation(query);
      this.locationSearchResults.set(results);
      if (results.length === 0) {
        this.locationError.set(`No places found matching "${query}".`);
      }
    } catch (err: unknown) {
      console.error('Location search failed:', err);
      this.locationError.set('Location lookup failed. Please try again.');
    } finally {
      this.isSearchingLocation.set(false);
    }
  }

  pinLocation(loc: JournalLocation) {
    this.activeLocation.set(loc);
    this.closeLocationModal();
    this.saveCurrentEntry();
  }

  removeLocation() {
    this.activeLocation.set(null);
    this.saveCurrentEntry();
  }

  openLocationViewer(loc: JournalLocation) {
    this.viewingMapLocation.set(loc);
  }

  closeLocationViewer() {
    this.viewingMapLocation.set(null);
  }

  navigateToAdmin() {
    this.router.navigate(['/admin']);
  }

  async signOut() {
    await this.firebaseService.signOut();
    this.router.navigate(['/']);
  }
}
