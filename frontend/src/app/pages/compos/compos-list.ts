import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ItemsService } from '../../core/items.service';
import { Build, Compo, SlotRow, hasLevel } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Gear } from '../../shared/gear';
import { Icon } from '../../shared/icon';
import { ImageShare, fileSlug } from '../../shared/image-share';
import { RoleBar } from '../../shared/role-bar';
import { roleColor, sortByRole } from '../../shared/roles';

@Component({
  selector: 'app-compos-list',
  imports: [NgTemplateOutlet, RouterLink, Gear, Icon, ImageShare, RoleBar],
  template: `
    <div class="page-head">
      <div>
        <h1>Compos</h1>
        <p class="subtitle">Utilisables directement dans <code>/acti</code> sur Discord : le joueur choisit son rôle, le build lui est imposé.</p>
      </div>
      @if (canEdit()) {
        <a class="btn btn-primary" [routerLink]="['/g', guildId(), 'compos', 'new']"><app-icon name="plus" /> Nouvelle compo</a>
      }
    </div>

    @if (error()) {
      <p class="alert">{{ error() }}</p>
    }

    @if (loading()) {
      <div class="grid">
        @for (s of [1, 2]; track s) { <div class="skeleton tall"></div> }
      </div>
    } @else {
      @if (custom().length) {
        <div class="grid compos">
          @for (c of custom(); track c.name; let i = $index) {
            <ng-container *ngTemplateOutlet="card; context: { $implicit: c, i: i }" />
          }
        </div>
      } @else {
        <div class="empty"><app-icon name="users" [size]="32" /><p>Aucune compo de guilde pour l'instant.</p></div>
      }

      @if (defaults().length) {
        <h2 class="section-title">Templates par défaut</h2>
        <div class="grid compos">
          @for (c of defaults(); track c.name; let i = $index) {
            <ng-container *ngTemplateOutlet="card; context: { $implicit: c, i: i }" />
          }
        </div>
      }
    }

    <ng-template #card let-c let-i="i">
      <article class="card card-hover compo fade-up" [style.animation-delay.ms]="i * 50">
        <header class="head">
          <div class="title">
            <h2>{{ c.name }}</h2>
            <div class="row">
              <span class="badge badge-outline">{{ c.type_acti }}</span>
              <span class="badge"><app-icon name="users" [size]="12" /> {{ c.total }} joueurs</span>
            </div>
          </div>
          @if (c.image) {
            <img [src]="c.image" alt="" class="thumb" />
          }
        </header>
        @if (c.description) {
          <p class="muted desc">{{ c.description }}</p>
        }
        <app-role-bar [rows]="allRows(c)" [emojis]="emojis()" />

        @for (pf of [{ label: 'Party 1', rows: c.pf1 }, { label: 'Party 2', rows: c.pf2 }]; track pf.label) {
          @if (pf.rows.length) {
            <section class="party">
              <h3>{{ pf.label }}</h3>
              <ul class="lines">
                @for (r of sorted(pf.rows); track r.role) {
                  <li [style.--role-color]="color(r.role)">
                    <span class="role-tag">{{ emojis()[r.role] ?? '' }} {{ r.role }}</span>
                    <span class="times num">×{{ r.count }}</span>
                    @if (buildOf(r); as b) {
                      <span class="build-name">{{ b.name }}@for (x of otherBuilds(r); track x.id) { <span class="muted"> ou </span>{{ x.name }} }</span>
                      <app-gear [items]="b.items" size="small" />
                    } @else {
                      <span class="muted build-name">{{ r.weapon || 'Rôle libre' }}</span>
                    }
                  </li>
                }
              </ul>
            </section>
          }
        }
        @if (c.custom && (canEdit() || hasBuilds(c))) {
          <div class="foot row">
            @if (hasBuilds(c)) {
              <button type="button" class="btn btn-sm" [attr.aria-expanded]="imageOf() === c.name"
                      (click)="toggleImage(c.name)"><app-icon name="sparkles" [size]="14" /> Image</button>
            }
            @if (canEdit()) {
              <a class="btn btn-sm btn-ghost" [routerLink]="['/g', guildId(), 'compos', c.name, 'edit']"><app-icon name="edit" [size]="14" /> Modifier</a>
              <button type="button" class="btn btn-sm btn-danger" (click)="remove(c)"><app-icon name="trash" [size]="14" /> Supprimer</button>
              <button type="button" class="btn btn-sm btn-ghost" (click)="publish(c)"><app-icon name="book" [size]="14" /> Publier comme modèle</button>
              @if (copyTargets().length) {
                <label class="sr-only" [attr.for]="'copy-' + i">Copier vers un autre serveur</label>
                <select class="select copy" [id]="'copy-' + i" (change)="copyTo(c, $any($event.target))">
                  <option value="">Copier vers…</option>
                  @for (g of copyTargets(); track g.id) { <option [value]="g.id">{{ g.name }}</option> }
                </select>
              }
            }
          </div>
          @if (imageOf() === c.name) {
            <app-image-share [src]="imageUrl(c.name)" [alt]="'Image de la compo ' + c.name" [fileName]="'compo-' + slug(c.name)" />
          }
        }
      </article>
    </ng-template>
  `,
  styles: `
    code { color: var(--lilac); }
    .tall { min-height: 260px; }
    .compos { grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr)); }
    .compo { display: grid; gap: 14px; align-content: start; }
    .head { display: flex; gap: 14px; justify-content: space-between; align-items: flex-start; }
    .title { display: grid; gap: 8px; min-width: 0; }
    .title h2 { margin: 0; font-size: 1.25rem; }
    .thumb { width: 64px; height: 64px; border-radius: 12px; object-fit: cover; flex: none; }
    .desc { margin: 0; white-space: pre-line; font-size: .9rem; }
    .party h3 { margin: 0 0 8px; font-size: .75rem; text-transform: uppercase; letter-spacing: .08em; color: var(--text-faint); }
    .lines { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    .lines li { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; align-items: center; gap: 10px;
                padding: 8px 10px; border-radius: 10px; background: var(--bg-2); border: 1px solid var(--border-soft);
                border-left: 3px solid var(--role-color); }
    .times { color: var(--text-muted); font-weight: 600; font-size: .85rem; }
    .build-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .9rem; }
    .foot { padding-top: 12px; border-top: 1px solid var(--border-soft); flex-wrap: wrap; }
    .copy { width: auto; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    @media (max-width: 560px) {
      .lines li { grid-template-columns: auto auto minmax(0, 1fr); }
      .lines li app-gear { grid-column: 1 / -1; }
    }
  `,
})
export class ComposList implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly items = inject(ItemsService);
  /** Mes autres serveurs où je suis staff : cibles possibles d'une copie. */
  protected readonly copyTargets = computed(() =>
    this.auth.guilds().filter((g) => g.id !== this.guildId() && hasLevel(g.level, 'staff')));

  async copyTo(c: Compo, select: HTMLSelectElement): Promise<void> {
    const target = this.copyTargets().find((g) => g.id === select.value);
    select.value = '';
    if (!target) return;
    try {
      const { name } = await firstValueFrom(this.api.copyCompo(target.id, this.guildId(), c.name));
      this.toast.success(`« ${name} » copiée vers ${target.name}, avec ses builds.`);
    } catch (err) {
      this.toast.error(errorMessage(err));
    }
  }

  async publish(c: Compo): Promise<void> {
    if (!confirm(`Publier « ${c.name} » dans la bibliothèque ? Elle sera visible par toutes les guildes (instantané : tes modifications futures ne la changeront pas).`)) return;
    try {
      await firstValueFrom(this.api.publishCompo(this.guildId(), c.name));
      this.toast.success('Compo publiée dans les Modèles.');
    } catch (err) {
      this.toast.error(errorMessage(err));
    }
  }

  /** Compo dont l'image est affichée (une à la fois). */
  protected readonly imageOf = signal<string | null>(null);
  protected readonly slug = fileSlug;

  /** L'image ne montre que les rôles liés à un build : sans build, pas d'image. */
  hasBuilds(c: Compo): boolean {
    return [...c.pf1, ...c.pf2].some((r) => r.build_id != null);
  }

  toggleImage(name: string): void {
    this.imageOf.update((open) => (open === name ? null : name));
  }

  imageUrl(name: string): string {
    return this.api.compoImageUrl(this.guildId(), name);
  }
  private readonly toast = inject(ToastService);
  private readonly builds = signal<Build[]>([]);
  private readonly buildsById = computed(() => new Map(this.builds().map((b) => [b.id, b])));

  readonly guildId = input.required<string>();

  protected readonly custom = signal<Compo[]>([]);
  protected readonly defaults = signal<Compo[]>([]);
  protected readonly emojis = signal<Record<string, string>>({});
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly canEdit = computed(() => hasLevel(this.auth.levelFor(this.guildId()), 'staff'));

  /** Autres builds proposés au choix sur la ligne (après le premier). */
  otherBuilds(r: SlotRow): Build[] {
    return (r.build_ids ?? []).slice(1).map((id) => this.buildsById().get(id)).filter((b): b is Build => !!b);
  }

  buildOf(row: SlotRow): Build | undefined {
    return row.build_id != null ? this.buildsById().get(row.build_id) : undefined;
  }

  allRows(c: Compo): SlotRow[] {
    return [...c.pf1, ...c.pf2];
  }

  sorted(rows: SlotRow[]): SlotRow[] {
    return sortByRole(rows, (r) => r.role);
  }

  color(role: string): string {
    return roleColor(role);
  }

  async ngOnInit(): Promise<void> {
    this.items.load().catch(() => {});
    this.api.builds(this.guildId()).subscribe({ next: (b) => this.builds.set(b), error: () => {} });
    this.api.roles(this.guildId()).subscribe({
      next: (roles) => this.emojis.set(Object.fromEntries(roles.map((r) => [r.name, r.emoji]))),
      error: () => {},
    });
    try {
      const list = await firstValueFrom(this.api.compos(this.guildId()));
      this.custom.set(list.custom);
      this.defaults.set(list.defaults);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  async remove(compo: Compo): Promise<void> {
    if (!confirm(`Supprimer la compo « ${compo.name} » ? Elle ne sera plus disponible dans /acti.`)) return;
    try {
      await firstValueFrom(this.api.deleteCompo(this.guildId(), compo.name));
      this.custom.update((list) => list.filter((c) => c.name !== compo.name));
      this.toast.success(`Compo « ${compo.name} » supprimée.`);
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }
}
