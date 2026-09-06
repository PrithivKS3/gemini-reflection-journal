import {ChangeDetectionStrategy, Component, inject, effect, PLATFORM_ID} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';
import {Router} from '@angular/router';
import {MatIconModule} from '@angular/material/icon';
import {FirebaseService} from '../../core/services/firebase.service';

@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="min-h-screen bg-stone-50 text-stone-900 flex flex-col justify-between selection:bg-amber-100 selection:text-stone-900">
      <!-- Header / Nav -->
      <header class="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-stone-900 text-stone-50 flex items-center justify-center shadow-sm">
            <mat-icon class="text-xl">auto_stories</mat-icon>
          </div>
          <div>
            <h1 class="text-lg font-semibold tracking-tight text-stone-900">Gemini Journal</h1>
            <p class="text-xs text-stone-500 font-medium">Reflective AI Workspace</p>
          </div>
        </div>

        <div class="flex items-center gap-4">
          @if (firebaseService.currentUser(); as user) {
            <button
              id="landing-goto-dashboard-btn"
              (click)="navigateToDashboard()"
              class="px-5 py-2.5 rounded-xl bg-stone-900 text-stone-50 text-sm font-medium hover:bg-stone-800 transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <span>Open Dashboard</span>
              <mat-icon class="text-base">arrow_forward</mat-icon>
            </button>
          } @else {
            <button
              id="landing-top-signin-btn"
              (click)="signIn()"
              [disabled]="firebaseService.isAuthenticating()"
              class="px-5 py-2.5 rounded-xl bg-stone-900 text-stone-50 text-sm font-medium hover:bg-stone-800 disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm cursor-pointer"
            >
              @if (firebaseService.isAuthenticating()) {
                <mat-icon class="animate-spin text-base">progress_activity</mat-icon>
                <span>Signing in...</span>
              } @else {
                <mat-icon class="text-base">login</mat-icon>
                <span>Sign In with Google</span>
              }
            </button>
          }
        </div>
      </header>

      <!-- Main Content / Hero -->
      <main class="w-full max-w-5xl mx-auto px-6 py-12 flex-1 flex flex-col justify-center">
        <!-- Error Alert if any -->
        @if (firebaseService.authError(); as error) {
          <div class="mb-8 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3">
            <mat-icon class="text-rose-600 text-lg mt-0.5">error_outline</mat-icon>
            <div class="flex-1">
              <p class="font-medium">Authentication Notice</p>
              <p class="text-xs text-rose-700 mt-0.5">{{ error }}</p>
            </div>
          </div>
        }

        <div class="text-center max-w-3xl mx-auto">
          <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-stone-200/70 text-stone-700 text-xs font-medium mb-6">
            <mat-icon class="text-sm text-stone-600">psychology</mat-icon>
            <span>Powered by Gemini 3.6 Flash & Cloud Firestore</span>
          </div>

          <h2 class="text-4xl sm:text-5xl font-serif tracking-tight text-stone-900 leading-tight">
            A sanctuary for mindful reflection, deep journaling, and AI clarity.
          </h2>

          <p class="mt-6 text-lg text-stone-600 font-normal leading-relaxed max-w-2xl mx-auto">
            Write your thoughts freely, engage in multi-turn reflective dialogue with Gemini, and uncover emotional patterns and actionable insights—all securely stored in your private cloud database.
          </p>

          <div class="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              id="landing-hero-signin-btn"
              (click)="signIn()"
              [disabled]="firebaseService.isAuthenticating()"
              class="w-full sm:w-auto px-8 py-4 rounded-xl bg-stone-900 text-stone-50 font-medium hover:bg-stone-800 disabled:opacity-50 transition-all flex items-center justify-center gap-3 shadow-md hover:shadow-lg cursor-pointer"
            >
              @if (firebaseService.isAuthenticating()) {
                <mat-icon class="animate-spin text-xl">progress_activity</mat-icon>
                <span>Connecting with Google...</span>
              } @else {
                <svg class="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"/>
                  <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"/>
                  <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3 0-.8.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9z"/>
                  <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16c1.8 3.7 5.6 7 10.1 7z"/>
                </svg>
                <span>Continue with Google Sign-In</span>
              }
            </button>
          </div>
          <p class="mt-3 text-xs text-stone-500">Zero password hassle. Secure OAuth identity delegation.</p>
        </div>

        <!-- 3-Pillar Capability Grid -->
        <div class="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="p-6 rounded-2xl bg-white border border-stone-200/80 shadow-sm flex flex-col justify-between">
            <div>
              <div class="w-10 h-10 rounded-xl bg-stone-100 text-stone-800 flex items-center justify-center mb-4">
                <mat-icon>forum</mat-icon>
              </div>
              <h3 class="text-base font-semibold text-stone-900 mb-2">Multi-Turn AI Reflections</h3>
              <p class="text-sm text-stone-600 leading-relaxed">
                Converse continuously with Gemini. Ask for alternative perspectives, Socratic questions, reframing, and structured brainstorming.
              </p>
            </div>
            <div class="mt-4 pt-4 border-t border-stone-100 flex items-center gap-2 text-xs font-medium text-stone-500">
              <mat-icon class="text-sm text-emerald-600">check_circle</mat-icon>
              <span>Conversational Context</span>
            </div>
          </div>

          <div class="p-6 rounded-2xl bg-white border border-stone-200/80 shadow-sm flex flex-col justify-between">
            <div>
              <div class="w-10 h-10 rounded-xl bg-stone-100 text-stone-800 flex items-center justify-center mb-4">
                <mat-icon>lock</mat-icon>
              </div>
              <h3 class="text-base font-semibold text-stone-900 mb-2">Private User Isolation</h3>
              <p class="text-sm text-stone-600 leading-relaxed">
                Every reflection, entry, and dialogue turn is isolated in Cloud Firestore under strict owner-only security rules.
              </p>
            </div>
            <div class="mt-4 pt-4 border-t border-stone-100 flex items-center gap-2 text-xs font-medium text-stone-500">
              <mat-icon class="text-sm text-emerald-600">check_circle</mat-icon>
              <span>Owner-Bound Firestore Rules</span>
            </div>
          </div>

          <div class="p-6 rounded-2xl bg-white border border-stone-200/80 shadow-sm flex flex-col justify-between">
            <div>
              <div class="w-10 h-10 rounded-xl bg-stone-100 text-stone-800 flex items-center justify-center mb-4">
                <mat-icon>insights</mat-icon>
              </div>
              <h3 class="text-base font-semibold text-stone-900 mb-2">Deep Summarization</h3>
              <p class="text-sm text-stone-600 leading-relaxed">
                Transform rambles and emotional reflections into concise summaries, mood insights, inquiry prompts, and tangible next steps.
              </p>
            </div>
            <div class="mt-4 pt-4 border-t border-stone-100 flex items-center gap-2 text-xs font-medium text-stone-500">
              <mat-icon class="text-sm text-emerald-600">check_circle</mat-icon>
              <span>Automated Extraction</span>
            </div>
          </div>
        </div>
      </main>

      <!-- Footer -->
      <footer class="w-full max-w-7xl mx-auto px-6 py-6 border-t border-stone-200 text-center text-xs text-stone-500">
        <p>Built with Angular 21, Google Gemini 3.6 Flash, and Cloud Firestore. Strict security & privacy enforced.</p>
      </footer>
    </div>
  `,
})
export class LandingComponent {
  readonly firebaseService = inject(FirebaseService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  constructor() {
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      const user = this.firebaseService.currentUser();
      if (user && this.firebaseService.isAuthInitialized()) {
        this.router.navigate(['/dashboard']);
      }
    });
  }

  async signIn() {
    const user = await this.firebaseService.signInWithGoogle();
    if (user) {
      this.router.navigate(['/dashboard']);
    }
  }

  navigateToDashboard() {
    this.router.navigate(['/dashboard']);
  }
}
