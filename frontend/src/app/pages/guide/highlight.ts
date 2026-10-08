import { Component, computed, input } from '@angular/core';

export interface Segment { text: string; hit: boolean }

/** Minuscule sans accent d'UN caractère (« É » → « e ») ; garde la longueur pour aligner les positions. */
function foldChar(c: string): string {
  const f = c.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  return f.length === 1 ? f : c.toLowerCase().length === 1 ? c.toLowerCase() : c;
}

/** Découpe `text` en morceaux, `hit` = morceau qui correspond à un mot de la recherche
 *  (accents et majuscules ignorés). Recherche vide → un seul morceau non surligné. */
export function highlight(text: string, query: string): Segment[] {
  const words = query.trim().split(/\s+/).filter(Boolean).map((w) => [...w].map(foldChar).join(''));
  if (!words.length || !text) return [{ text, hit: false }];
  const chars = [...text];
  const folded = chars.map(foldChar).join('');
  const marked = new Array<boolean>(chars.length).fill(false);
  for (const w of words) {
    let from = 0;
    for (let at = folded.indexOf(w, from); at !== -1; at = folded.indexOf(w, from)) {
      for (let i = at; i < at + w.length; i++) marked[i] = true;
      from = at + w.length;
    }
  }
  const out: Segment[] = [];
  chars.forEach((c, i) => {
    const last = out[out.length - 1];
    if (last && last.hit === marked[i]) last.text += c;
    else out.push({ text: c, hit: marked[i] });
  });
  return out;
}

/** Texte avec les mots recherchés surlignés (en texte brut : jamais d'innerHTML). */
@Component({
  selector: 'app-hl',
  template: `@for (s of segments(); track $index) {@if (s.hit) {<mark>{{ s.text }}</mark>} @else {{{ s.text }}}}`,
  styles: `mark { background: var(--lilac-soft); color: var(--lilac); border-radius: 3px; padding: 0 1px; }`,
})
export class Highlight {
  readonly text = input('');
  readonly q = input('');
  protected readonly segments = computed(() => highlight(this.text(), this.q()));
}
