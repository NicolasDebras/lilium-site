/** Halo lilas qui suit la souris sur les cartes cliquables (.card-hover, .card-link) :
 *  position du pointeur dans la carte → --mx / --my (dessin dans styles.scss).
 *  Écouteur natif hors Angular : pas de détection de changements à chaque mouvement. */
export const SPOTLIGHT_SELECTOR = '.card-hover, .card-link';

export function trackSpotlight(doc: Document): () => void {
  const onMove = (e: PointerEvent) => {
    const card = (e.target as Element | null)?.closest?.<HTMLElement>(SPOTLIGHT_SELECTOR);
    if (!card) return;
    const box = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${Math.round(e.clientX - box.left)}px`);
    card.style.setProperty('--my', `${Math.round(e.clientY - box.top)}px`);
  };
  doc.addEventListener('pointermove', onMove, { passive: true });
  return () => doc.removeEventListener('pointermove', onMove);
}
