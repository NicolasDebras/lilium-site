/** Minuscules sans accents : la recherche ignore accents et majuscules. */
export function fold(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Tous les mots de la recherche doivent apparaître dans le texte. */
export function matches(query: string, ...texts: string[]): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const hay = fold(texts.join(' '));
  return words.every((w) => hay.includes(w));
}

/** « webadmin add » → ancre « webadmin-add » (lien /guide#webadmin-add). */
export function anchorOf(name: string): string {
  return name.replace(/\s+/g, '-');
}
