import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PublicInfoService } from './public-info.service';

describe('PublicInfoService', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));

  it('charge le lien d’invitation une seule fois pour toute l’appli', async () => {
    const info = TestBed.inject(PublicInfoService);
    expect(info.inviteUrl()).toBeNull();
    TestBed.tick();
    TestBed.inject(HttpTestingController).expectOne('/api/public/info').flush({ invite_url: 'https://discord.com/x' });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(info.inviteUrl()).toBe('https://discord.com/x');
    expect(TestBed.inject(PublicInfoService)).toBe(info);   // même instance : pas de 2e requête
    TestBed.inject(HttpTestingController).verify();
  });

  it('API indisponible : pas de lien (et pas d’erreur levée)', async () => {
    const info = TestBed.inject(PublicInfoService);
    TestBed.tick();
    TestBed.inject(HttpTestingController).expectOne('/api/public/info').flush('', { status: 503, statusText: 'Unavailable' });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(info.inviteUrl()).toBeNull();
  });
});
