import {Injectable, inject, PLATFORM_ID, signal, computed} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';
import {initializeApp, getApps, getApp, FirebaseApp} from 'firebase/app';
import {
  getAuth,
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
} from 'firebase/firestore';
import firebaseConfigData from '../../../../firebase-applet-config.json';
import {UserProfile} from '../models/journal.models';

/**
 * Sanitizes payloads to strip undefined values, preventing Firestore driver crashes.
 */
export function sanitizePayload<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, value) => (value === undefined ? null : value)),
  );
}

@Injectable({
  providedIn: 'root',
})
export class FirebaseService {
  private readonly platformId = inject(PLATFORM_ID);
  private app: FirebaseApp | null = null;
  private auth: Auth | null = null;
  private firestore: Firestore | null = null;

  // Reactive state signals
  readonly currentUser = signal<User | null>(null);
  readonly userProfile = signal<UserProfile | null>(null);
  readonly isAuthInitialized = signal<boolean>(false);
  readonly isAuthenticating = signal<boolean>(false);
  readonly authError = signal<string | null>(null);

  // RBAC Signals
  readonly userRole = computed<'admin' | 'user'>(() => this.userProfile()?.role || 'user');
  readonly isAdmin = computed<boolean>(() => this.userRole() === 'admin');

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initFirebase();
    } else {
      this.isAuthInitialized.set(true);
    }
  }

  private initFirebase() {
    try {
      if (getApps().length === 0) {
        this.app = initializeApp({
          apiKey: firebaseConfigData.apiKey,
          authDomain: firebaseConfigData.authDomain,
          projectId: firebaseConfigData.projectId,
          storageBucket: firebaseConfigData.storageBucket,
          messagingSenderId: firebaseConfigData.messagingSenderId,
          appId: firebaseConfigData.appId,
        });
      } else {
        this.app = getApp();
      }

      this.auth = getAuth(this.app);

      // Initialize Firestore with specific database ID if present, otherwise default
      const dbId = firebaseConfigData.firestoreDatabaseId;
      if (dbId && dbId !== '(default)' && dbId.trim() !== '') {
        this.firestore = getFirestore(this.app, dbId);
      } else {
        this.firestore = getFirestore(this.app);
      }

      onAuthStateChanged(this.auth, async (user) => {
        this.currentUser.set(user);
        if (user) {
          await this.syncUserProfile(user);
        } else {
          this.userProfile.set(null);
        }
        this.isAuthInitialized.set(true);
      });
    } catch (err: unknown) {
      console.error('Error initializing Firebase:', err);
      const msg = err instanceof Error ? err.message : 'Failed to initialize Firebase.';
      this.authError.set(msg);
      this.isAuthInitialized.set(true);
    }
  }

  getDb(): Firestore {
    if (!this.firestore) {
      if (isPlatformBrowser(this.platformId)) {
        this.initFirebase();
      }
      if (!this.firestore) {
        throw new Error('Firestore is not initialized.');
      }
    }
    return this.firestore;
  }

  getAuthInstance(): Auth {
    if (!this.auth) {
      if (isPlatformBrowser(this.platformId)) {
        this.initFirebase();
      }
      if (!this.auth) {
        throw new Error('Firebase Auth is not initialized.');
      }
    }
    return this.auth;
  }

  /**
   * Google Sign-In with popup
   */
  async signInWithGoogle(): Promise<User | null> {
    this.isAuthenticating.set(true);
    this.authError.set(null);
    try {
      const auth = this.getAuthInstance();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      await this.syncUserProfile(result.user);
      return result.user;
    } catch (err: unknown) {
      console.error('Google Sign-In failed:', err);
      const errCode = typeof err === 'object' && err !== null && 'code' in err ? String((err as Record<string, unknown>)['code']) : '';
      const errMsg = err instanceof Error ? err.message : 'Failed to sign in with Google.';
      // Suppress benign user-cancelled popup errors
      if (errCode !== 'auth/popup-closed-by-user') {
        this.authError.set(errMsg);
      }
      return null;
    } finally {
      this.isAuthenticating.set(false);
    }
  }

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    try {
      const auth = this.getAuthInstance();
      await firebaseSignOut(auth);
      this.currentUser.set(null);
      this.userProfile.set(null);
    } catch (err: unknown) {
      console.error('Sign-Out failed:', err);
    }
  }

  /**
   * Syncs user profile in Firestore under /users/{userId}
   */
  private async syncUserProfile(user: User): Promise<void> {
    if (!this.firestore) return;
    try {
      const userRef = doc(this.firestore, `users/${user.uid}`);
      const snap = await getDoc(userRef);
      const now = new Date().toISOString();
      const isDesignatedAdmin = (user.email || '').toLowerCase() === 'prithcbr@gmail.com';

      if (!snap.exists()) {
        const profile: UserProfile = {
          userId: user.uid,
          email: user.email || '',
          displayName: user.displayName || 'Journaler',
          photoURL: user.photoURL || '',
          role: isDesignatedAdmin ? 'admin' : 'user',
          createdAt: now,
          lastLoginAt: now,
        };
        await setDoc(userRef, sanitizePayload(profile));
        this.userProfile.set(profile);
      } else {
        const existing = snap.data() as UserProfile;
        const resolvedRole: 'admin' | 'user' = isDesignatedAdmin ? 'admin' : (existing.role || 'user');
        const updated: UserProfile = {
          ...existing,
          displayName: user.displayName || existing.displayName,
          photoURL: user.photoURL || existing.photoURL,
          role: resolvedRole,
          lastLoginAt: now,
        };
        await setDoc(userRef, sanitizePayload(updated), { merge: true });
        this.userProfile.set(updated);
      }
    } catch (err) {
      console.warn('Failed to sync user profile document:', err);
    }
  }

  /**
   * Fetches all registered users for admin auditing (RBAC protected).
   */
  async getAllUsers(): Promise<UserProfile[]> {
    if (!this.isAdmin()) {
      throw new Error('Access denied: Admin role required.');
    }
    const db = this.getDb();
    const usersCol = collection(db, 'users');
    const snapshot = await getDocs(usersCol);
    const users: UserProfile[] = [];
    snapshot.forEach((d) => {
      users.push(d.data() as UserProfile);
    });
    return users;
  }

  /**
   * Admin updates a target user's role (RBAC protected).
   */
  async updateUserRole(targetUserId: string, newRole: 'admin' | 'user'): Promise<void> {
    if (!this.isAdmin()) {
      throw new Error('Access denied: Admin role required.');
    }
    const db = this.getDb();
    const targetRef = doc(db, `users/${targetUserId}`);
    await setDoc(targetRef, { role: newRole }, { merge: true });

    // If updating own role in state, refresh local profile
    if (this.currentUser()?.uid === targetUserId && this.userProfile()) {
      this.userProfile.set({
        ...this.userProfile()!,
        role: newRole,
      });
    }
  }
}
