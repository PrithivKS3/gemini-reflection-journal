import {Injectable, inject, signal, effect, OnDestroy} from '@angular/core';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  Unsubscribe,
} from 'firebase/firestore';
import {FirebaseService, sanitizePayload} from './firebase.service';
import {
  JournalEntry,
  SavedInteractionRecord,
  JournalMood,
  JournalMode,
} from '../models/journal.models';

@Injectable({
  providedIn: 'root',
})
export class JournalService implements OnDestroy {
  private readonly firebaseService = inject(FirebaseService);

  readonly entries = signal<JournalEntry[]>([]);
  readonly isLoadingEntries = signal<boolean>(false);
  readonly entryError = signal<string | null>(null);
  readonly isSaving = signal<boolean>(false);
  readonly lastSaveError = signal<string | null>(null);

  private unsubscribeSnapshot: Unsubscribe | null = null;

  constructor() {
    // React to changes in the current user
    effect(() => {
      const user = this.firebaseService.currentUser();
      if (user) {
        this.subscribeToEntries(user.uid);
      } else {
        this.unsubscribe();
        this.entries.set([]);
      }
    });
  }

  private subscribeToEntries(userId: string) {
    this.unsubscribe();
    this.isLoadingEntries.set(true);
    this.entryError.set(null);

    try {
      const db = this.firebaseService.getDb();
      const entriesCol = collection(db, `users/${userId}/journalEntries`);
      const q = query(entriesCol, orderBy('updatedAt', 'desc'));

      this.unsubscribeSnapshot = onSnapshot(
        q,
        (snapshot) => {
          const list: JournalEntry[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as JournalEntry;
            list.push({
              ...data,
              id: docSnap.id,
            });
          });
          this.entries.set(list);
          this.isLoadingEntries.set(false);
        },
        (err) => {
          console.error('Firestore entries subscription error:', err);
          this.entryError.set(err.message || 'Failed to load entries.');
          this.isLoadingEntries.set(false);
        },
      );
    } catch (err: unknown) {
      console.error('Failed to set up Firestore listener:', err);
      const msg = err instanceof Error ? err.message : 'Error connecting to database.';
      this.entryError.set(msg);
      this.isLoadingEntries.set(false);
    }
  }

  /**
   * Saves or updates a journal entry and records any individual interaction.
   */
  async saveEntry(entry: Partial<JournalEntry>): Promise<JournalEntry> {
    const user = this.firebaseService.currentUser();
    if (!user) {
      throw new Error('User must be authenticated to save journal entries.');
    }

    this.isSaving.set(true);
    this.lastSaveError.set(null);

    try {
      const db = this.firebaseService.getDb();
      const entryId = entry.id || doc(collection(db, `users/${user.uid}/journalEntries`)).id;
      const now = new Date().toISOString();

      const completeEntry: JournalEntry = {
        id: entryId,
        userId: user.uid,
        title: entry.title?.trim() || 'Untitled Reflection',
        content: entry.content || '',
        mood: (entry.mood as JournalMood) || 'reflective',
        mode: (entry.mode as JournalMode) || 'reflection',
        tags: entry.tags || [],
        location: entry.location || null,
        geminiInsight: entry.geminiInsight || null,
        interactions: entry.interactions || [],
        createdAt: entry.createdAt || now,
        updatedAt: now,
      };

      const entryRef = doc(db, `users/${user.uid}/journalEntries/${entryId}`);
      const cleanPayload = sanitizePayload(completeEntry);
      await setDoc(entryRef, cleanPayload, { merge: true });

      // Optimistically update local list if needed
      this.entries.update((current) => {
        const idx = current.findIndex((e) => e.id === entryId);
        if (idx >= 0) {
          const updated = [...current];
          updated[idx] = completeEntry;
          return updated;
        }
        return [completeEntry, ...current];
      });

      return completeEntry;
    } catch (err: unknown) {
      console.error('Failed to save journal entry to Firestore:', err);
      const msg = err instanceof Error ? err.message : 'Database save failed. Please try again.';
      this.lastSaveError.set(msg);
      throw err;
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Saves a standalone interaction record to /users/{userId}/interactions/{interactionId}
   */
  async saveInteractionRecord(params: {
    prompt: string;
    response: string;
    mode: string;
    entryId?: string;
  }): Promise<void> {
    const user = this.firebaseService.currentUser();
    if (!user) return;

    try {
      const db = this.firebaseService.getDb();
      const interactionRef = doc(collection(db, `users/${user.uid}/interactions`));
      const now = new Date().toISOString();

      const record: SavedInteractionRecord = {
        id: interactionRef.id,
        userId: user.uid,
        entryId: params.entryId || '',
        prompt: params.prompt,
        response: params.response,
        mode: params.mode,
        timestamp: now,
        createdAt: now,
      };

      await setDoc(interactionRef, sanitizePayload(record));
    } catch (err) {
      console.warn('Could not save interaction audit record:', err);
    }
  }

  /**
   * Deletes a journal entry from Firestore.
   */
  async deleteEntry(entryId: string): Promise<void> {
    const user = this.firebaseService.currentUser();
    if (!user) throw new Error('Authentication required.');

    try {
      const db = this.firebaseService.getDb();
      const entryRef = doc(db, `users/${user.uid}/journalEntries/${entryId}`);
      await deleteDoc(entryRef);

      this.entries.update((current) => current.filter((e) => e.id !== entryId));
    } catch (err: unknown) {
      console.error('Failed to delete entry:', err);
      throw err;
    }
  }

  private unsubscribe() {
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
      this.unsubscribeSnapshot = null;
    }
  }

  ngOnDestroy() {
    this.unsubscribe();
  }
}
