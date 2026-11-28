import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

import { HasUnsavedChanges, unsavedChangesGuard, warnBeforeUnload } from './unsaved-changes';

const page = (dirty: boolean): HasUnsavedChanges => ({ hasUnsavedChanges: () => dirty });
const run = (p: HasUnsavedChanges) =>
  TestBed.runInInjectionContext(() =>
    unsavedChangesGuard(p, {} as ActivatedRouteSnapshot, {} as RouterStateSnapshot, {} as RouterStateSnapshot),
  );

describe('unsavedChangesGuard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rien de modifié : on quitte sans question', () => {
    const ask = vi.spyOn(window, 'confirm');
    expect(run(page(false))).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('modifications non enregistrées : demande confirmation et suit la réponse', () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(run(page(true))).toBe(false);
    expect(ask).toHaveBeenCalledWith('Tu as des modifications non enregistrées. Quitter quand même ?');
    ask.mockReturnValue(true);
    expect(run(page(true))).toBe(true);
  });
});

describe('warnBeforeUnload', () => {
  it('bloque la fermeture de l’onglet seulement s’il y a des modifications', () => {
    const clean = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    warnBeforeUnload(clean, page(false));
    expect(clean.defaultPrevented).toBe(false);
    const dirty = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    warnBeforeUnload(dirty, page(true));
    expect(dirty.defaultPrevented).toBe(true);
  });
});
