import { trackSpotlight } from './spotlight';

describe('halo des cartes', () => {
  function card(cls: string): HTMLElement {
    const el = document.createElement('article');
    el.className = `card ${cls}`;
    el.innerHTML = '<h2>Titre</h2>';
    el.getBoundingClientRect = () => ({ left: 100, top: 50 }) as DOMRect;
    document.body.appendChild(el);
    return el;
  }

  function move(target: Element, x: number, y: number): void {
    const e = new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y });
    target.dispatchEvent(e);
  }

  afterEach(() => (document.body.innerHTML = ''));

  it('position du pointeur dans la carte (enfant compris) → --mx / --my', () => {
    const stop = trackSpotlight(document);
    const el = card('card-hover');
    move(el.querySelector('h2')!, 130.4, 72);
    expect(el.style.getPropertyValue('--mx')).toBe('30px');
    expect(el.style.getPropertyValue('--my')).toBe('22px');
    stop();
  });

  it('ignore les cartes non cliquables ; plus rien après arrêt', () => {
    const stop = trackSpotlight(document);
    const plain = card('');
    move(plain, 110, 60);
    expect(plain.style.getPropertyValue('--mx')).toBe('');

    stop();
    const link = card('card-link');
    move(link, 110, 60);
    expect(link.style.getPropertyValue('--mx')).toBe('');
  });
});
