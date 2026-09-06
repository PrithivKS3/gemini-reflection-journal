import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';
import {FirebaseService} from '../services/firebase.service';

export const authGuard: CanActivateFn = () => {
  const firebaseService = inject(FirebaseService);
  const router = inject(Router);

  // If auth is initialized, enforce user login
  if (firebaseService.isAuthInitialized()) {
    if (firebaseService.currentUser()) {
      return true;
    }
    return router.parseUrl('/');
  }

  // If still initializing, allow navigation; component will verify state
  return true;
};

