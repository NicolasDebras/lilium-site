import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ItemsService } from '../../core/items.service';
import { BuildDetail, hasLevel } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Gear, describeGear } from '../../shared/gear';
import { Icon } from '../../shared/icon';
import { roleColor } from '../../shared/roles';

/** Page d'un build, en lecture seule, à partager sur Discord : équipement en grand,
 *  image identique au MP de /massup (télécharger / copier), compos qui l'utilisent, dupliquer. */
@Component({
  selector: 'app-build-detail',
  imports: [Gear, Icon, RouterLink],
  template: `
    <a class="back muted" [routerLink]="['/g', guildId(), 'builds']"><app-icon name="chevron" [size]="14" class="flip" /> Tous les builds</a>

    @if (error()) {
      <p class="alert">{{ error() }}</p>
    } @else if (build(); as b) {
      <div class="page-head">
        <div>
          <div class="row tags">
            <span class="role-tag" [style.--role-color]="color(b.role)">{{ b.role }}</span>
            <span class="badge badge-outline">{{ b.type_acti }}</span>
          </div>
          <h1>{{ b.name }}</h1>
          <p class="subtitle">par {{ b.created_by_name }}</p>
        </div>
        <div class="row actions">
          <button type="button" class="btn btn-sm" (click)="copyLink()"><app-icon name="swap" [size]="14" /> Copier le lien</button>
          @if (canEdit()) {
            <button type="button" class="btn btn-sm" [disabled]="busy()" (click)="duplicate()"><app-icon name="plus" [size]="14" /> Dupliquer</button>
            <a class="btn btn-sm btn-primary" [routerLink]="['/g', guildId(), 'builds', b.id, 'edit']"><app-icon name="edit" [size]="14" /> Modifier</a>
          }
        </div>
      </div>

      <div class="layout">
        <div class="card gear-card">
          <app-gear [items]="b.items" layout="doll" />
          @if (gearNames(); as names) {
            <p class="muted names">{{ names }}</p>
          }
          @if (b.weapon) {
            <p class="weapon"><app-icon name="info" [size]="14" /> {{ b.weapon }}</p>
          }
          @if (b.notes) {
            <p class="notes">{{ b.notes }}</p>
          }
          <div class="used">
            <h3>Utilisé dans</h3>
            @if (b.used_by.length) {
              <ul>
                @for (c of b.used_by; track c) { <li><span class="badge">{{ c }}</span></li> }
              </ul>
            } @else {
              <p class="muted">Aucune compo pour l'instant.</p>
            }
          </div>
        </div>

        <div class="card image-card">
          <h3>Image du build <span class="muted">— la même qu'en MP avec /massup</span></h3>
          <img [src]="imageUrl()" [alt]="'Équipement du build ' + b.name" class="preview" loading="lazy" />
          <div class="row">
            <a class="btn btn-sm" [href]="imageUrl()" [download]="fileName()">Télécharger</a>
            <button type="button" class="btn btn-sm" (click)="copyImage()">Copier l'image</button>
          </div>
        </div>
      </div>
    } @else {
      <div class="skeleton"></div>
    }
  `,
  styles: `
    .back { display: inline-flex; align-items: center; gap: 4px; font-size: .85rem; margin-bottom: 12px; }
    .flip { transform: rotate(180deg); }
    .tags { gap: 6px; margin-bottom: 6px; }
    .role-tag { color: var(--role-color); font-weight: 700; font-size: .8rem; }
    .actions { flex-wrap: wrap; gap: 8px; }
    .layout { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 16px; align-items: start; }
    .gear-card { display: grid; gap: 12px; justify-items: start; }
    .names { margin: 0; font-size: .85rem; }
    .weapon { margin: 0; display: flex; align-items: center; gap: 6px; }
    .notes { margin: 0; white-space: pre-wrap; color: var(--text-muted); }
    .used h3, .image-card h3 { margin: 0 0 8px; font-size: 1rem; }
    .image-card h3 .muted { font-weight: 400; font-size: .85rem; }
    .used ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
    .used p { margin: 0; }
    .image-card { display: grid; gap: 12px; }
    .preview { width: 100%; max-width: 460px; border-radius: var(--radius-sm); background: var(--surface-2); min-height: 200px; }
    .skeleton { min-height: 320px; }
    @media (max-width: 860px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class BuildDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly items = inject(ItemsService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  readonly guildId = input.required<string>();
  readonly buildId = input.required<string>();

  protected readonly build = signal<BuildDetail | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly canEdit = computed(() => hasLevel(this.auth.levelFor(this.guildId()), 'staff'));
  protected readonly imageUrl = computed(() => this.api.buildImageUrl(this.guildId(), Number(this.buildId())));
  protected readonly fileName = computed(() => `build-${(this.build()?.name ?? 'lilium').replace(/[^\p{L}\p{N}-]+/gu, '-')}.png`);

  /** « Épée large ou Hallebarde · Bouclier · Cape au choix » */
  protected readonly gearNames = computed(() => {
    const b = this.build();
    if (!b) return '';
    return describeGear(b.items, (id) => this.items.get(id))
      .map((g) => (g.free ? `${g.label} au choix` : g.items.map((i) => i.name).join(' ou ')))
      .join(' · ');
  });

  async ngOnInit(): Promise<void> {
    void this.items.load();
    try {
      this.build.set(await firstValueFrom(this.api.buildDetail(this.guildId(), Number(this.buildId()))));
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }

  color(role: string): string {
    return roleColor(role);
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(location.href);
      this.toast.success('Lien copié : colle-le dans Discord.');
    } catch {
      this.toast.error('Copie impossible : copie l’adresse de la page à la main.');
    }
  }

  async copyImage(): Promise<void> {
    try {
      const blob = await (await fetch(this.imageUrl())).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this.toast.success('Image copiée : colle-la dans Discord.');
    } catch {
      this.toast.error('Ton navigateur ne permet pas de copier l’image : utilise « Télécharger ».');
    }
  }

  async duplicate(): Promise<void> {
    this.busy.set(true);
    try {
      const { id } = await firstValueFrom(this.api.duplicateBuild(this.guildId(), Number(this.buildId())));
      this.toast.success('Build dupliqué : ajuste la copie.');
      await this.router.navigate(['/g', this.guildId(), 'builds', id, 'edit']);
    } catch (err) {
      this.toast.error(errorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
