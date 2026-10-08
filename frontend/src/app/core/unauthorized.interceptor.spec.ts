import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { fakeAuth } from '../../testing/fake-auth';
import { AuthService } from './auth.service';
import { unauthorizedInterceptor } from './unauthorized.interceptor';

describe('unauthorizedInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        fakeAuth({ levels: { '1': 'member' } }),
        provideHttpClient(withInterceptors([unauthorizedInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  it('401 sur une route de l’API → oubli de la session + /login', async () => {
    const p = firstValueFrom(http.get('/api/guilds/1/builds')).catch((e) => e);
    ctrl.expectOne('/api/guilds/1/builds').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect((await p).status).toBe(401);
    expect(navigate).toHaveBeenCalledWith(['/accueil']);
    expect(TestBed.inject(AuthService).user()).toBeNull();
  });

  it('ignore /api/me (géré par AuthService)', async () => {
    const p = firstValueFrom(http.get('/api/me')).catch((e) => e);
    ctrl.expectOne('/api/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    await p;
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ne touche pas aux autres erreurs (403)', async () => {
    const p = firstValueFrom(http.get('/api/guilds/1/admin/overview')).catch((e) => e);
    ctrl.expectOne('/api/guilds/1/admin/overview').flush({}, { status: 403, statusText: 'Forbidden' });
    expect((await p).status).toBe(403);
    expect(navigate).not.toHaveBeenCalled();
  });
});
