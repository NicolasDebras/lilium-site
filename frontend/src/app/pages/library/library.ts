import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { PublicCompo, PublicComposPage, hasLevel } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { Pager } from '../../shared/pager';
import { roleColor } from '../../shared/roles';

const SEARCH_DELAY_MS = 250;

/** Modèles de compos publiés par les serveurs qui utilisent le bot : recherche, aperçu de l'image,
 *  import en un clic (staff) dans le serveur courant, avec les builds. */
@Component({
  selector: 'app-library',
  imports: [Icon, Pager],
  template: `
    <div class="page-head">
      <div>
        <h1>Modèles de compos</h1>
        <p class="subtitle">Compos publiées par les guildes qui utilisent le bot. Importe-les dans ton serveur, builds compris.</p>
      </div>
    </div>

    <div class="card toolbar">
      <label class="sr-only" for="lib-search">Chercher un modèle</label>
      <input id="lib-search" class="input" type="search" placeholder="Chercher un modèle…" maxlength="100"
             [value]="query()" (input)="search($any($event.target).value)" />
      <div class="row filters">
        @for (t of types; track t.label) {
          <button type="button" class="btn btn-sm" [class.on]="typeActi() === t.value" (click)="setType(t.value)">{{ t.label }}</button>
        }
      </div>
    </div>

    @if (error()) {
      <p class="alert">{{ error() }}</p>
    } @else if (data(); as d) {
      @if (d.items.length) {
        <div class="grid models" [class.stale]="loading()">
          @for (m of d.items; track m.id) {
            <article class="card model">
              <header>
                <h2>{{ m.name }}</h2>
                <div class="row">
                  <span class="badge badge-outline">{{ m.type_acti }}</span>
                  <span class="badge"><app-icon name="users" [size]="12" /> {{ m.total }} joueurs</span>
                  <span class="faint small">par {{ m.author_name || 'anonyme' }} · {{ m.imports }} import{{ m.imports > 1 ? 's' : '' }}</span>
                </div>
              </header>
              @if (m.description) { <p class="muted desc">{{ m.description }}</p> }
              <ul class="roles">
                @for (r of m.pf1.concat(m.pf2); track $index) {
                  <li [style.--role-color]="color(r.role)"><span class="role">{{ r.role }}</span> ×{{ r.count }}</li>
                }
              </ul>
              @if (m.builds) {
                @if (shown() === m.id) {
                  <img [src]="imageUrl(m.id)" [alt]="'Image du modèle ' + m.name" class="preview" loading="lazy" />
                } @else {
                  <button type="button" class="btn btn-sm btn-ghost" (click)="shown.set(m.id)">Voir l'image</button>
                }
              }
              <div class="row foot">
                @if (canImport()) {
                  <button type="button" class="btn btn-sm btn-primary" [disabled]="busy() === m.id" (click)="importModel(m)">
                    <app-icon name="plus" [size]="14" /> Importer dans ce serveur
                  </button>
                }
                <button type="button" class="btn btn-sm btn-ghost danger" (click)="remove(m)" title="Auteur, admin du serveur d'origine ou propriétaire du site">
                  <app-icon name="trash" [size]="14" /> Retirer
                </button>
              </div>
            </article>
          }
        </div>
        <app-pager [page]="d.page" [pageSize]="d.page_size" [total]="d.total" label="modèles" (pageChange)="load($event)" />
      } @else {
        <div class="empty"><app-icon name="book" [size]="32" />
          <p>Aucun modèle{{ query() || typeActi() ? ' ne correspond' : ' publié pour l’instant' }}. Publie une compo depuis la page Compos !</p>
        </div>
      }
    } @else {
      <div class="grid"><div class="skeleton tall"></div><div class="skeleton tall"></div></div>
    }
  `,
  styles: `
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 12px; margin-bottom: 18px; }
    .toolbar .input { flex: 1 1 240px; }
    .filters { gap: 6px; }
    .filters .on { background: var(--lilac-soft); border-color: var(--lilac-strong); color: var(--lilac); }
    .models { grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); transition: opacity .15s; }
    .model { display: grid; gap: 12px; align-content: start; }
    header h2 { margin: 0 0 6px; font-size: 1.15rem; }
    .row { flex-wrap: wrap; gap: 6px; align-items: center; }
    .small { font-size: .78rem; }
    .desc { margin: 0; font-size: .9rem; white-space: pre-line; }
    .roles { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
    .roles li { padding: 3px 8px; border-radius: 8px; background: var(--bg-2); border-left: 3px solid var(--role-color); font-size: .85rem; }
    .role { font-weight: 700; }
    .preview { width: 100%; border-radius: var(--radius-sm); background: var(--surface-2); }
    .foot { justify-content: space-between; padding-top: 10px; border-top: 1px solid var(--border-soft); }
    .danger { color: var(--danger); }
    .stale { opacity: .55; }
    .empty { display: grid; justify-items: center; gap: 8px; padding: 40px 16px; color: var(--text-muted); text-align: center; }
    .tall { min-height: 220px; }
  `,
})
export class LibraryPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  readonly guildId = input.required<string>();

  protected readonly types = [
    { label: 'Tout', value: null }, { label: 'PvP', value: 'PVP' }, { label: 'PvE', value: 'PVE' },
  ];
  protected readonly data = signal<PublicComposPage | null>(null);
  protected readonly query = signal('');
  protected readonly typeActi = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly shown = signal<number | null>(null);
  protected readonly busy = signal<number | null>(null);
  protected readonly canImport = computed(() => hasLevel(this.auth.levelFor(this.guildId()), 'staff'));
  private request = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    void this.load(1);
  }

  search(value: string): void {
    this.query.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(1), SEARCH_DELAY_MS);
  }

  setType(value: string | null): void {
    this.typeActi.set(value);
    void this.load(1);
  }

  color(role: string): string {
    return roleColor(role);
  }

  imageUrl(id: number): string {
    return this.api.publicCompoImageUrl(id);
  }

  async load(page: number): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    try {
      const d = await firstValueFrom(this.api.publicCompos(page, this.query().trim(), this.typeActi()));
      if (request === this.request) this.data.set(d);
    } catch (err) {
      if (request === this.request) this.error.set(errorMessage(err));
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  /** Import ; si le nom est déjà pris (409), propose un autre nom. */
  async importModel(m: PublicCompo, newName?: string): Promise<void> {
    this.busy.set(m.id);
    try {
      const { name } = await firstValueFrom(this.api.importPublicCompo(this.guildId(), m.id, newName));
      this.toast.success(`Compo « ${name} » importée avec ses builds.`);
      await this.router.navigate(['/g', this.guildId(), 'compos']);
    } catch (err) {
      const status = (err as { status?: number }).status;
      const other = status === 409 ? prompt(`${errorMessage(err)}\nNouveau nom pour la compo importée :`, `${m.name} 2`) : null;
      if (other) await this.importModel(m, other);
      else this.toast.error(errorMessage(err));
    } finally {
      this.busy.set(null);
    }
  }

  async remove(m: PublicCompo): Promise<void> {
    if (!confirm(`Retirer le modèle « ${m.name} » de la bibliothèque ?`)) return;
    try {
      await firstValueFrom(this.api.deletePublicCompo(m.id));
      this.toast.success('Modèle retiré.');
      await this.load(this.data()?.page ?? 1);
    } catch (err) {
      this.toast.error(errorMessage(err));
    }
  }
}
