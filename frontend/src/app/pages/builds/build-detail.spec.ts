import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { BuildDetail, Level } from '../../core/models';
import { BuildDetailPage } from './build-detail';

async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
}

const BUILD: BuildDetail = {
  id: 7, name: 'Tank Masse', role: 'TANK', type_acti: 'PVP', weapon: '1H Masse', notes: 'T8 mini', image: '',
  items: { mainhand: ['MAIN_MACE'] }, created_by_name: 'Coskko', used_by: ['ZvZ', 'Statik'],
};

describe('BuildDetailPage (build partageable)', () => {
  async function render(level: Level) {
    TestBed.configureTestingModule({
      imports: [BuildDetailPage],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: { levelFor: () => level } },
      ],
    });
    const fixture = TestBed.createComponent(BuildDetailPage);
    fixture.componentRef.setInput('guildId', '111');
    fixture.componentRef.setInput('buildId', '7');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.match('/api/items').forEach((r) => r.flush([]));
    http.expectOne('/api/guilds/111/builds/7').flush(BUILD);
    await settle(fixture);
    return { fixture, http, el: fixture.nativeElement as HTMLElement };
  }

  it('affiche le build, ses compos et son image (téléchargeable)', async () => {
    const { el } = await render('member');
    expect(el.querySelector('h1')?.textContent).toBe('Tank Masse');
    expect([...el.querySelectorAll('.used .badge')].map((b) => b.textContent)).toEqual(['ZvZ', 'Statik']);
    expect(el.querySelector('img.preview')?.getAttribute('src')).toBe('/api/guilds/111/builds/7/image.png');
    expect(el.querySelector('a[download]')?.getAttribute('download')).toBe('build-Tank-Masse.png');
  });

  it('un membre ne voit ni Dupliquer ni Modifier', async () => {
    const { el } = await render('member');
    expect(el.textContent).not.toContain('Dupliquer');
    expect(el.textContent).not.toContain('Modifier');
  });

  it('le staff duplique puis arrive sur le formulaire de la copie', async () => {
    const { fixture, http, el } = await render('staff');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const button = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Dupliquer'))!;
    button.click();
    const req = http.expectOne('/api/guilds/111/builds/7/duplicate');
    expect(req.request.method).toBe('POST');
    req.flush({ id: 8 });
    await settle(fixture);
    expect(navigate).toHaveBeenCalledWith(['/g', '111', 'builds', 8, 'edit']);
  });

  it("affiche l'erreur si le build n'existe pas", async () => {
    TestBed.configureTestingModule({
      imports: [BuildDetailPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
                  { provide: AuthService, useValue: { levelFor: () => 'member' } }],
    });
    const fixture = TestBed.createComponent(BuildDetailPage);
    fixture.componentRef.setInput('guildId', '111');
    fixture.componentRef.setInput('buildId', '99');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.match('/api/items').forEach((r) => r.flush([]));
    http.expectOne('/api/guilds/111/builds/99').flush({ detail: 'Build introuvable.' }, { status: 404, statusText: 'Not Found' });
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('.alert')?.textContent).toContain('Build introuvable.');
  });
});
