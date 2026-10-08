/** Rôles du bot (TANK, HEAL, DPS, SUPPORT) : ordre d'affichage et couleur d'identité. */
export const ROLE_ORDER = ['TANK', 'HEAL', 'DPS', 'SUPPORT'] as const;

const ROLE_VAR: Record<string, string> = {
  TANK: 'var(--role-tank)',
  HEAL: 'var(--role-heal)',
  DPS: 'var(--role-dps)',
  SUPPORT: 'var(--role-support)',
};

/** Rôle de base d'une clé de ligne : « PF2:TANK · Main tank » → « TANK », « DPS 2 » → « DPS »
 *  (plusieurs lignes du même rôle dans une compo ; même règle que le bot et l'API). */
export function baseRole(key: string): string {
  const role = key.replace(/^PF2:/, '').split(' · ')[0].trim().toUpperCase();
  const m = /^(.*) \d+$/.exec(role);
  return m && (ROLE_ORDER as readonly string[]).includes(m[1]) ? m[1] : role;
}

/** Variable CSS de la couleur du rôle (rôle inconnu → gris). Tolère « PF2:DPS », « TANK · X » et la casse. */
export function roleColor(role: string): string {
  return ROLE_VAR[baseRole(role)] ?? 'var(--role-other)';
}

export function roleRank(role: string): number {
  const i = (ROLE_ORDER as readonly string[]).indexOf(baseRole(role));
  return i === -1 ? ROLE_ORDER.length : i;
}

/** Trie par rôle (TANK, HEAL, DPS, SUPPORT, puis le reste) sans changer l'ordre à rôle égal. */
export function sortByRole<T>(rows: readonly T[], role: (row: T) => string): T[] {
  return [...rows].map((r, i) => ({ r, i }))
    .sort((a, b) => roleRank(role(a.r)) - roleRank(role(b.r)) || a.i - b.i)
    .map(({ r }) => r);
}
