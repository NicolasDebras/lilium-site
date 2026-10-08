import { TestBed } from '@angular/core/testing';

import {
  Delta, FlowChart, HBarChart, Heatmap, LineChart, columnPath, compactSilver, deltaPct, heatLevel, niceStep, shortDate,
} from './charts';

describe('formatage', () => {
  it('compactSilver', () => {
    expect(compactSilver(950)).toBe('950');
    expect(compactSilver(350_400)).toBe('350 k');
    expect(compactSilver(12_340_000)).toBe('12,3 M');
    expect(compactSilver(174_873_783)).toBe('175 M');
    expect(compactSilver(4_016_770_211)).toBe('4,02 Md');
    expect(compactSilver(-2_000_000)).toBe('-2 M');
  });

  it('shortDate', () => expect(shortDate('2026-09-28')).toBe('28/09'));

  it('niceStep donne des pas ronds', () => {
    expect(niceStep(100, 4)).toBe(25);
    expect(niceStep(174_873_783, 4)).toBe(50_000_000);
    expect(niceStep(0)).toBe(1);
  });
});

describe('columnPath', () => {
  it('vide pour une valeur nulle', () => expect(columnPath(0, 100, 100, 10)).toBe(''));
  it('bout arrondi en haut, carré sur la ligne de base', () => {
    const d = columnPath(10, 100, 40, 20);
    expect(d.startsWith('M10,100V44Q10,40 14,40')).toBe(true);
    expect(d.endsWith('V100Z')).toBe(true);
  });
  it('vers le bas pour les retraits', () => {
    expect(columnPath(10, 100, 160, 20)).toContain('V156Q10,160 14,160');
  });
});

describe('FlowChart', () => {
  function render(data: { start: string; credited: number; withdrawn: number }[]) {
    const fixture = TestBed.createComponent(FlowChart);
    fixture.componentRef.setInput('data', data);
    fixture.componentRef.setInput('bucket', 'day');
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('une colonne par sens et par jour, légende à 2 entrées', () => {
    const { el } = render([
      { start: '2026-09-30', credited: 100, withdrawn: 0 },
      { start: '2026-10-01', credited: 50, withdrawn: 80 },
    ]);
    const filled = [...el.querySelectorAll('svg path')].filter((p) => p.getAttribute('d'));
    expect(filled.length).toBe(3);
    expect(el.querySelectorAll('.legend span').length).toBe(2);
    expect(el.querySelectorAll('rect.hit').length).toBe(2);
  });

  it('les colonnes ne dépassent pas 24 px de large', () => {
    const { el } = render([{ start: '2026-10-01', credited: 100, withdrawn: 0 }]);
    const d = el.querySelector('svg path')!.getAttribute('d')!;
    const xs = [...d.matchAll(/[MH](\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(24);
  });

  it('info-bulle au survol avec le détail', () => {
    const { fixture, el } = render([{ start: '2026-10-01', credited: 1_500_000, withdrawn: 500_000 }]);
    el.querySelector('rect.hit')!.dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();
    const tip = el.querySelector('.tip')!.textContent!.replace(/\s/g, '');
    expect(tip).toContain('Crédité1500000');
    expect(tip).toContain('Retiré500000');
    expect(tip).toContain('Net+1000000');
  });
});

describe('LineChart', () => {
  it('trace la courbe et étiquette la dernière valeur', () => {
    const fixture = TestBed.createComponent(LineChart);
    fixture.componentRef.setInput('data', [{ date: '2026-09-30', total: 10_000_000 }, { date: '2026-10-01', total: 12_500_000 }]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('svg path').length).toBe(2);   // aire + ligne
    expect(el.querySelector('.end-label')?.textContent).toBe('12,5 M');
  });
});

describe('HBarChart', () => {
  it('barres proportionnelles à la plus grande valeur', () => {
    const fixture = TestBed.createComponent(HBarChart);
    fixture.componentRef.setInput('rows', [{ label: 'A', value: 200 }, { label: 'B', value: 50, sub: '2 activités' }]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const widths = [...el.querySelectorAll<HTMLElement>('.bar')].map((b) => b.style.width);
    expect(widths).toEqual(['100%', '25%']);
    expect(el.textContent).toContain('2 activités');
  });

  it('message quand il n’y a rien', () => {
    const fixture = TestBed.createComponent(HBarChart);
    fixture.componentRef.setInput('rows', []);
    fixture.componentRef.setInput('empty', 'Rien.');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Rien.');
  });
});

describe('Delta (variation)', () => {
  function render(current: number, previous: number, upIsGood: boolean | null = true) {
    const fixture = TestBed.createComponent(Delta);
    fixture.componentRef.setInput('current', current);
    fixture.componentRef.setInput('previous', previous);
    fixture.componentRef.setInput('upIsGood', upIsGood);
    fixture.detectChanges();
    const el = (fixture.nativeElement as HTMLElement).querySelector('.delta');
    return { text: el?.textContent?.replace(/\s+/g, ' ').trim(), el };
  }

  it('deltaPct', () => {
    expect(deltaPct(150, 100)).toBe(50);
    expect(deltaPct(50, 100)).toBe(-50);
    expect(deltaPct(10, 0)).toBeNull();
  });

  it('hausse bonne en vert, baisse en rouge, flèche + % toujours affichés', () => {
    const up = render(200, 100);
    expect(up.text).toBe('▲ 100 %');
    expect(up.el?.classList).toContain('good');
    const down = render(25, 100);
    expect(down.text).toBe('▼ 75 %');
    expect(down.el?.classList).toContain('bad');
  });

  it('neutre quand le sens n’est ni bon ni mauvais, « nouveau » sans base, rien si 0 → 0', () => {
    expect(render(200, 100, null).el?.classList).toContain('neutral');
    expect(render(5, 0).text).toBe('nouveau');
    expect(render(0, 0).el).toBeNull();
  });
});

describe('Heatmap', () => {
  it('heatLevel : 0 vide, 1 à 5 selon le maximum', () => {
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(1, 10)).toBe(1);
    expect(heatLevel(10, 10)).toBe(5);
    expect(heatLevel(6, 10)).toBe(3);
  });

  it('7 × 24 cases, niveaux, infobulles et créneau le plus actif', () => {
    const data = Array.from({ length: 7 }, () => Array(24).fill(0));
    data[5][21] = 4;
    data[0][9] = 1;
    const fixture = TestBed.createComponent(Heatmap);
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const cells = el.querySelectorAll('.heat .cell');
    expect(cells.length).toBe(168);
    const sat21 = cells[5 * 24 + 21];
    expect(sat21.getAttribute('data-level')).toBe('5');
    expect(sat21.getAttribute('title')).toBe('Samedi 21h : 4 activités');
    expect(cells[9].getAttribute('data-level')).toBe('2');
    expect(el.querySelector('.peak')?.textContent).toContain('samedi 21h–22h (4)');
    expect(el.querySelector('.heat')?.getAttribute('aria-label')).toContain('samedi 21h');
  });
});
