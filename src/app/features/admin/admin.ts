import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { FirebaseService } from '../../core/services/firebase.service';
import { JournalService } from '../../core/services/journal.service';
import { UserProfile } from '../../core/models/journal.models';

@Component({
  selector: 'app-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  templateUrl: './admin.html',
})
export class AdminComponent implements OnInit {
  readonly firebaseService = inject(FirebaseService);
  readonly journalService = inject(JournalService);
  private readonly router = inject(Router);

  readonly users = signal<UserProfile[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly statusMessage = signal<string | null>(null);
  readonly filterQuery = signal<string>('');

  // Filtered user list
  readonly filteredUsers = computed(() => {
    const query = this.filterQuery().toLowerCase().trim();
    const list = this.users();
    if (!query) return list;
    return list.filter(
      (u) =>
        u.email.toLowerCase().includes(query) ||
        u.displayName.toLowerCase().includes(query) ||
        u.userId.toLowerCase().includes(query),
    );
  });

  // Telemetry metrics
  readonly totalUsersCount = computed(() => this.users().length);
  readonly adminCount = computed(
    () => this.users().filter((u) => u.role === 'admin').length,
  );
  readonly standardUserCount = computed(
    () => this.users().filter((u) => u.role !== 'admin').length,
  );

  ngOnInit() {
    this.loadUserData();
  }

  async loadUserData() {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      if (!this.firebaseService.isAdmin()) {
        this.error.set('Access Restricted: You do not possess administrator credentials.');
        return;
      }
      const fetched = await this.firebaseService.getAllUsers();
      this.users.set(fetched);
    } catch (err: unknown) {
      console.error('Failed to load admin user roster:', err);
      const msg = err instanceof Error ? err.message : 'Unable to query user roster.';
      this.error.set(msg);
    } finally {
      this.isLoading.set(false);
    }
  }

  async toggleUserRole(user: UserProfile) {
    const targetRole: 'admin' | 'user' = user.role === 'admin' ? 'user' : 'admin';
    const actionDesc = targetRole === 'admin' ? 'promote' : 'demote';

    if (user.userId === this.firebaseService.currentUser()?.uid && targetRole === 'user') {
      const confirmSelf = confirm(
        'Warning: Demoting your own account will revoke your administrator portal access. Are you sure?',
      );
      if (!confirmSelf) return;
    }

    try {
      this.statusMessage.set(`Updating role for ${user.email}...`);
      await this.firebaseService.updateUserRole(user.userId, targetRole);

      // Locally update
      this.users.update((list) =>
        list.map((u) => (u.userId === user.userId ? { ...u, role: targetRole } : u)),
      );

      this.statusMessage.set(`Successfully updated ${user.email} to ${targetRole.toUpperCase()}.`);
      setTimeout(() => this.statusMessage.set(null), 4000);
    } catch (err: unknown) {
      console.error(`Failed to ${actionDesc} user:`, err);
      const msg = err instanceof Error ? err.message : `Failed to change role.`;
      this.error.set(msg);
    }
  }

  onFilterChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.filterQuery.set(input.value);
  }

  navigateToJournal() {
    this.router.navigate(['/dashboard']);
  }
}
