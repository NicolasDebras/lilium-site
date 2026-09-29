import { HttpErrorResponse } from '@angular/common/http';

import { errorMessage } from './api.service';

describe('errorMessage', () => {
  it('reprend le detail texte de FastAPI', () => {
    const err = new HttpErrorResponse({ status: 403, error: { detail: 'Réservé au staff.' } });
    expect(errorMessage(err)).toBe('Réservé au staff.');
  });

  it('résume les erreurs de validation (422)', () => {
    const err = new HttpErrorResponse({ status: 422, error: { detail: [{ loc: ['body', 'name'] }] } });
    expect(errorMessage(err)).toContain('Formulaire invalide');
  });

  it('API injoignable', () => {
    expect(errorMessage(new HttpErrorResponse({ status: 0 }))).toContain("L'API ne répond pas");
  });

  it('erreur inconnue', () => {
    expect(errorMessage(new Error('x'))).toBe('Une erreur est survenue.');
  });
});
