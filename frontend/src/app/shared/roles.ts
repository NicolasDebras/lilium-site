/** Rôles du bot (TANK, HEAL, DPS, SUPPORT) : ordre d'affichage et couleur d'identité. */
export const ROLE_ORDER = ['TANK', 'HEAL', 'DPS', 'SUPPORT'] as const;

const ROLE_VAR: Record<string, string> = {
  TANK: 'var(--role-tank)',
  HEAL: 'var(--role-heal)',
  DPS: 'var(--role-dps)',
  SUPPORT: 'var(--role-support)',
};

/** Variable CSS de la couleur du rôle (rôle inconnu → gris). Tolère « PF2:DPS » et la casse. */
export function roleColor(role: string): string {
  const key = role.replace(/^PF2:/, '').toUpperCase();
  return ROLE_VAR[key] ?? 'var(--role-other)';
}

export function roleRank(role: string): number {
  const i = (ROLE_ORDER as readonly string[]).indexOf(role.replace(/^PF2:/, '').toUpperCase());
  return i === -1 ? ROLE_ORDER.length : i;
}

/** Trie par rôle (TANK, HEAL, DPS, SUPPORT, puis le reste) sans changer l'ordre à rôle égal. */
export function sortByRole<T>(rows: readonly T[], role: (row: T) => string): T[] {
  return [...rows].map((r, i) => ({ r, i }))
    .sort((a, b) => roleRank(role(a.r)) - roleRank(role(b.r)) || a.i - b.i)
    .map(({ r }) => r);
}
