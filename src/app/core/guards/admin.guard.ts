import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { FirebaseService } from '../services/firebase.service';

export const adminGuard: CanActivateFn = () => {
  const firebaseService = inject(FirebaseService);
  const router = inject(Router);

  if (firebaseService.isAuthInitialized()) {
    if (firebaseService.currentUser() && firebaseService.isAdmin()) {
      return true;
    }
    // Unauthorized access redirect
    return router.parseUrl('/dashboard');
  }

  // If still initializing, allow navigation; component will verify state
  return true;
};

