import { computed, signal } from '@angular/core';

import { AuthService } from '../app/core/auth.service';
import { Guild, Level, Me } from '../app/core/models';

/** AuthService factice pour les tests : pas de HTTP, état contrôlé. */
export function fakeAuth(options: { me?: Me | null; levels?: Record<string, Level> } = {}) {
  const guilds: Guild[] = Object.entries(options.levels ?? {}).map(([id, level]) => ({
    id, name: `Serveur ${id}`, icon: null, level,
  }));
  const me = options.me !== undefined
    ? options.me
    : { user: { id: '1', username: 'Lily', avatar_url: 'a.png' }, guilds };

  const state = signal<Me | null>(me);
  const stub = {
    me: computed(() => state()),
    user: computed(() => state()?.user ?? null),
    guilds: computed(() => state()?.guilds ?? []),
    loaded: computed(() => true),
    load: async () => state(),
    guild: (id: string | null | undefined) => state()?.guilds.find((g) => g.id === id),
    levelFor: (id: string | null | undefined) => state()?.guilds.find((g) => g.id === id)?.level ?? 'none',
    clear: () => state.set(null),
    login: () => {},
    logout: async () => state.set(null),
  };
  return { provide: AuthService, useValue: stub as unknown as AuthService };
}
