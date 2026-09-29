import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TEST_ITEMS } from '../../testing/items';
import { FALLBACK_ICON, ItemsService, filterItems, itemIconUrl, normalize, useFallbackIcon } from './items.service';

describe('normalize / filterItems / itemIconUrl', () => {
  it('ignore accents et majuscules', () => {
    expect(normalize('  Épée LARGE ')).toBe('epee large');
  });

  it('filtre par emplacement', () => {
    expect(filterItems(TEST_ITEMS, 'head').map((i) => i.id)).toEqual(['HEAD_PLATE_SET1', 'HEAD_CLOTH_SET2']);
  });

  it('cherche dans le nom FR sans accent', () => {
    expect(filterItems(TEST_ITEMS, 'mainhand', 'epee').map((i) => i.id)).toEqual(['MAIN_SWORD']);
  });

  it('cherche aussi dans le nom anglais et la famille', () => {
    expect(filterItems(TEST_ITEMS, 'mainhand', 'holy').map((i) => i.id)).toEqual(['2H_HOLYSTAFF']);
    expect(filterItems(TEST_ITEMS, 'head', 'tissu').map((i) => i.id)).toEqual(['HEAD_CLOTH_SET2']);
  });

  it('filtre par famille', () => {
    expect(filterItems(TEST_ITEMS, 'head', '', 'Plaque').map((i) => i.id)).toEqual(['HEAD_PLATE_SET1']);
  });

  it('URL du CDN Albion', () => {
    expect(itemIconUrl('T8_MAIN_SWORD')).toBe('https://render.albiononline.com/v1/item/T8_MAIN_SWORD.png?size=64');
  });
});

describe('ItemsService', () => {
  let service: ItemsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ItemsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('charge le catalogue une seule fois', async () => {
    const a = service.load();
    const b = service.load();
    http.expectOne('/api/items').flush(TEST_ITEMS);
    await Promise.all([a, b]);
    await service.load();
    http.expectNone('/api/items');
    expect(service.items().length).toBe(TEST_ITEMS.length);
  });

  it('retrouve un objet par id', async () => {
    const p = service.load();
    http.expectOne('/api/items').flush(TEST_ITEMS);
    await p;
    expect(service.get('OFF_SHIELD')?.name).toBe('Bouclier');
    expect(service.get('INCONNU')).toBeUndefined();
    expect(service.get(undefined)).toBeUndefined();
  });
});

describe('useFallbackIcon', () => {
  it('remplace une image introuvable par l’icône de secours, une seule fois', () => {
    const img = document.createElement('img');
    img.src = 'https://render.albiononline.com/v1/item/INEXISTANT.png';
    useFallbackIcon({ target: img } as unknown as Event);
    expect(img.src).toBe(FALLBACK_ICON);
    useFallbackIcon({ target: img } as unknown as Event);
    expect(img.src).toBe(FALLBACK_ICON);
  });
});
