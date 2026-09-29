import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Guild, Level, Me } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  /** undefined = pas encore chargé, null = pas connecté. */
  private readonly state = signal<Me | null | undefined>(undefined);
  private pending: Promise<Me | null> | null = null;

  readonly me = computed(() => this.state() ?? null);
  readonly user = computed(() => this.state()?.user ?? null);
  readonly guilds = computed(() => this.state()?.guilds ?? []);
  readonly loaded = computed(() => this.state() !== undefined);

  /** Charge /api/me une seule fois (les appels concurrents partagent la même requête). */
  load(force = false): Promise<Me | null> {
    if (!force && this.state() !== undefined) {
      return Promise.resolve(this.state() ?? null);
    }
    if (!this.pending) {
      this.pending = firstValueFrom(this.http.get<Me>('/api/me'))
        .catch((err: unknown) => {
          if (err instanceof HttpErrorResponse && err.status === 401) return null;
          throw err;
        })
        .then((me) => {
          this.state.set(me);
          return me;
        })
        .finally(() => (this.pending = null));
    }
    return this.pending;
  }

  guild(guildId: string | null | undefined): Guild | undefined {
    return this.guilds().find((g) => g.id === guildId);
  }

  levelFor(guildId: string | null | undefined): Level {
    return this.guild(guildId)?.level ?? 'none';
  }

  /** Session expirée / invalide : on oublie l'utilisateur côté front. */
  clear(): void {
    this.state.set(null);
  }

  login(): void {
    window.location.href = '/api/auth/login';
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', {}));
    this.clear();
  }
}
