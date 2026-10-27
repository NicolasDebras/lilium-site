import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localeFr from '@angular/common/locales/fr';
import { TestBed } from '@angular/core/testing';

import { Payout } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { PayoutsEditor, adjustBody, parseAmount, planAdjustment } from './payouts-editor';

async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
}

const PAYOUT: Payout = {
  id: 50, ts: '2026-10-27T21:00+01:00', action: 'finacti', template: 'ZvZ', by_user: 'Caller', total: 3_000_000,
  adjusted: false,
  players: [{ uid: '1', name: 'Alpha', amount: 1_000_000, role: 'DPS', share: 1 },
            { uid: '2', name: 'Bravo', amount: 2_000_000, role: 'TANK', share: 2 }],
};

describe('payouts : calculs', () => {
  it('parseAmount accepte les séparateurs, refuse le reste', () => {
    expect(parseAmount('1 500 000')).toBe(1_500_000);
    expect(parseAmount('1.500.000')).toBe(1_500_000);
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('12k')).toBeNull();
  });

  it('planAdjustment : total au prorata (somme exacte), même montant, puis les éditions l’emportent', () => {
    const current = { a: 1_000, b: 2_000, c: 0 };
    expect(planAdjustment(current, {}, { mode: 'total', amount: 10_000 })).toEqual({ a: 3_333, b: 6_667, c: 0 });
    const odd = planAdjustment({ a: 1, b: 1, c: 1 }, {}, { mode: 'total', amount: 100 });
    expect(Object.values(odd).reduce((x, y) => x + y, 0)).toBe(100);
    expect(planAdjustment({ a: 100, b: 300 }, { b: 50 }, { mode: 'per_player', amount: 500 })).toEqual({ a: 500, b: 50 });
    expect(planAdjustment({ a: 100 }, { z: 7 }, null)).toEqual({ a: 100, z: 7 });
  });

  it('adjustBody : seulement les éditions + le global', () => {
    expect(adjustBody({ '1': 0 }, null)).toEqual({ changes: [{ uid: '1', amount: 0 }], global_change: null });
  });
});

describe('PayoutsEditor (Admin → payouts de la semaine)', () => {
  beforeAll(() => registerLocaleData(localeFr));

  async function loaded(payouts: Payout[] = [PAYOUT]) {
    TestBed.configureTestingModule({ imports: [PayoutsEditor], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(PayoutsEditor);
    fixture.componentRef.setInput('guildId', '111');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const req = http.expectOne((q) => q.url === '/api/guilds/111/admin/payouts');
    expect(req.request.params.get('week')).toBe('0');
    req.flush({ week: 0, start: '', payouts });
    await settle(fixture);
    const toast = TestBed.inject(ToastService);
    return { fixture, http, toast, cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('liste les payouts de la semaine ; vide : message', async () => {
    const { el } = await loaded();
    expect(el.querySelector('.payout .what strong')?.textContent).toBe('ZvZ');
    expect(el.querySelector('.payout .total')?.textContent).toContain('3');
    TestBed.resetTestingModule();
    const empty = await loaded([]);
    expect(empty.el.querySelector('.empty')?.textContent).toContain('Aucun payout');
  });

  it('semaine dernière : recharge avec week=-1', async () => {
    const { el, http, fixture } = await loaded();
    [...el.querySelectorAll<HTMLButtonElement>('.weeks .chip')][1].click();
    fixture.detectChanges();
    const req = http.expectOne((q) => q.url === '/api/guilds/111/admin/payouts');
    expect(req.request.params.get('week')).toBe('-1');
  });

  it('modifier, retirer, ajouter un joueur puis appliquer : corps envoyé, toasts, rechargement', async () => {
    const { el, cmp, http, fixture, toast } = await loaded();
    const success = vi.spyOn(toast, 'success');
    const error = vi.spyOn(toast, 'error');
    el.querySelector<HTMLButtonElement>('.payout .head')!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('tbody tr').length).toBe(2);

    cmp.setAmount('1', 'Alpha', '1 500 000');
    cmp.setAmountValue('2', 'Bravo', 0);                // 🗑
    cmp['addAmount'].set('400000');
    cmp.addPlayer('6', 'Nouveau');
    fixture.detectChanges();
    expect(cmp['changes']().map((c) => [c.uid, c.before, c.after])).toEqual([
      ['1', 1_000_000, 1_500_000], ['2', 2_000_000, 0], ['6', 0, 400_000]]);
    expect(el.querySelector('tr.removed')?.textContent).toContain('retiré');

    el.querySelector<HTMLButtonElement>('.foot .btn-primary')!.click();
    const req = http.expectOne('/api/guilds/111/admin/payouts/50/adjust');
    expect(req.request.body).toEqual({
      changes: [{ uid: '1', amount: 1_500_000 }, { uid: '2', amount: 0 }, { uid: '6', amount: 400_000 }], global_change: null });
    req.flush({ payout: PAYOUT, dm_sent: 2, dm_failed: ['Bravo'] });
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    http.expectOne((q) => q.url === '/api/guilds/111/admin/payouts').flush({ week: 0, start: '', payouts: [PAYOUT] });
    await settle(fixture);
    expect(success).toHaveBeenCalledWith('Payout corrigé · 2 MP envoyés.');
    expect(error).toHaveBeenCalledWith('MP impossibles (MP fermés) : Bravo');
    expect(cmp['edits']()).toEqual({});
  });

  it('changement global et « Remettre »', async () => {
    const { el, cmp, fixture } = await loaded();
    el.querySelector<HTMLButtonElement>('.payout .head')!.click();
    cmp['globalMode'].set('total');
    cmp['globalAmount'].set('6 000 000');
    fixture.detectChanges();
    expect(cmp['nextTotal']()).toBe(6_000_000);
    cmp.setAmountValue('1', 'Alpha', 0);
    cmp.restore('1');
    expect(cmp['edits']()).toEqual({});
    cmp.reset();
    expect(cmp['changes']()).toEqual([]);
  });

  it('suggestions : un ID Discord tapé peut être ajouté directement', async () => {
    const { el, cmp, fixture } = await loaded();
    el.querySelector<HTMLButtonElement>('.payout .head')!.click();
    cmp['addQuery'].set('123456789012345678');
    fixture.detectChanges();
    expect(cmp['suggestions']()).toEqual([{ uid: '123456789012345678', name: '123456789012345678' }]);
  });
});

describe('PayoutsEditor — parts', () => {
  beforeAll(() => registerLocaleData(localeFr));

  it('affiche le rôle et les parts de chaque joueur (déduites : « ≈ », Scoot, ajouté : rien)', async () => {
    TestBed.configureTestingModule({ imports: [PayoutsEditor], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(PayoutsEditor);
    fixture.componentRef.setInput('guildId', '111');
    fixture.detectChanges();
    const players = [...PAYOUT.players, { uid: '3', name: 'Charlie', amount: 1_500_000, role: '', share: 1.5, inferred: true },
                     { uid: '4', name: 'Scout', amount: 500_000, role: 'SCOOT', share: null }];
    TestBed.inject(HttpTestingController).expectOne((q) => q.url === '/api/guilds/111/admin/payouts')
      .flush({ week: 0, start: '', payouts: [{ ...PAYOUT, players }] });
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('.payout .head')!.click();
    fixture.componentInstance['addAmount'].set('100');
    fixture.componentInstance.addPlayer('6', 'Nouveau');
    fixture.detectChanges();
    const shares = [...el.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('.share')?.textContent ?? '');
    expect(shares).toEqual(['×1', '×2', '≈ ×1,5', 'Scoot', '']);
    expect(el.querySelectorAll('tbody tr')[1].querySelector('.role')?.textContent).toBe('TANK');
    expect(el.querySelectorAll('tbody tr')[1].querySelector('.share')?.classList).toContain('multi');
  });
});
