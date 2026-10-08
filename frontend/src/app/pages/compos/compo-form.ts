import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { ItemsService } from '../../core/items.service';
import { Build, CompoInput, RoleInfo, SlotRow } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Gear } from '../../shared/gear';
import { Icon } from '../../shared/icon';
import { ImageShare, fileSlug } from '../../shared/image-share';
import { RoleBar } from '../../shared/role-bar';

export type Party = 'pf1' | 'pf2';

/** Valeurs spéciales du sélecteur « source » d'une ligne. */
const PICK = '';
const FREE = 'free';

/** Ligne du formulaire : `free` (côté écran seulement) = l'utilisateur a choisi « sans build ». */
/** `extra` : builds supplémentaires proposés au choix (même rôle que build_id). */
type Row = SlotRow & { free?: boolean; extra?: number[] };

function emptyRow(): Row {
  return { build_id: null, role: '', count: 1, weapon: '' };
}

@Component({
  selector: 'app-compo-form',
  imports: [FormsModule, RouterLink, Gear, Icon, ImageShare, RoleBar],
  template: `
    <div class="page-head">
      <div>
        <h1>{{ name() ? 'Modifier « ' + name() + ' »' : 'Nouvelle compo' }}</h1>
        <p class="subtitle">Chaque ligne = un build × un nombre de joueurs. Un seul build par rôle et par party.</p>
      </div>
    </div>

    <form class="form" (ngSubmit)="save()">
      @if (error()) {
        <p class="alert">{{ error() }}</p>
      }

      <div class="card form infos">
      <div class="row two">
        <div class="field">
          <label for="name">Nom</label>
          <input id="name" name="name" class="input" required maxlength="100" [disabled]="!!name()"
                 [(ngModel)]="model().name" />
        </div>
        <div class="field">
          <label for="type">Type</label>
          <select id="type" name="type_acti" class="select" [(ngModel)]="model().type_acti">
            <option value="PVP">PVP</option>
            <option value="PVE">PVE</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label for="description">Description</label>
        <textarea id="description" name="description" class="textarea" maxlength="2000"
                  [(ngModel)]="model().description"></textarea>
      </div>

      <div class="field">
        <label for="image">Image (URL, optionnel)</label>
        <input id="image" name="image" class="input" type="url" maxlength="500" [(ngModel)]="model().image" />
      </div>
      </div>

      <div class="card preview">
        <div class="preview-head">
          <strong>Aperçu</strong>
          <span class="badge">{{ total('pf1') + total('pf2') }} joueurs</span>
        </div>
        <app-role-bar [rows]="previewRows()" [emojis]="emojiMap()" />
        <p class="muted help">Sur Discord, le joueur choisit son rôle et le build lui est imposé.</p>
      </div>

      @for (pf of parties; track pf.key) {
        <fieldset class="party card">
          <legend>{{ pf.label }} <span class="muted">— {{ total(pf.key) }} joueurs</span></legend>
          @for (row of model()[pf.key]; track $index; let i = $index) {
            <div class="slot" [attr.data-party]="pf.key">
              <select class="select source" [name]="pf.key + '-source-' + i" aria-label="Build"
                      [ngModel]="sourceOf(row)" (ngModelChange)="setSource(pf.key, i, $event)">
                <option [value]="pick" disabled>Choisir un build…</option>
                @for (group of buildGroups(); track group.role) {
                  <optgroup [label]="group.role">
                    @for (b of group.builds; track b.id) {
                      <option [value]="'' + b.id" [disabled]="isRoleTaken(pf.key, b.role, i)">
                        {{ b.name }}{{ isRoleTaken(pf.key, b.role, i) ? ' (rôle déjà sur une ligne : ajoute-le « au choix » dessus)' : '' }}
                      </option>
                    }
                  </optgroup>
                }
                <option [value]="free">Sans build (rôle libre)</option>
              </select>
              <input class="input count" type="number" min="1" max="50" aria-label="Nombre"
                     [name]="pf.key + '-count-' + i" [(ngModel)]="row.count" />
              <button type="button" class="btn btn-sm btn-danger" aria-label="Retirer la ligne"
                      (click)="removeRow(pf.key, i)">✕</button>

              @if (buildOf(row); as b) {
                <div class="detail">
                  <span class="badge">{{ emoji(b.role) }} {{ b.role }}</span>
                  <app-gear [items]="b.items" size="small" />
                </div>
                @for (x of extraBuilds(row); track x.id) {
                  <div class="detail extra">
                    <span class="muted or">ou</span>
                    <strong class="extra-name">{{ x.name }}</strong>
                    <app-gear [items]="x.items" size="small" />
                    <button type="button" class="btn btn-sm btn-ghost" [attr.aria-label]="'Retirer ' + x.name"
                            (click)="removeExtra(pf.key, i, x.id)">✕</button>
                  </div>
                }
                @if (addableBuilds(row).length) {
                  <div class="detail">
                    <select class="select add-build" [name]="pf.key + '-extra-' + i" aria-label="Ajouter un build au choix"
                            (change)="addExtra(pf.key, i, $any($event.target))">
                      <option value="">+ Ajouter un build au choix ({{ b.role }})…</option>
                      @for (o of addableBuilds(row); track o.id) { <option [value]="o.id">{{ o.name }}</option> }
                    </select>
                  </div>
                }
              } @else if (row.free) {
                <div class="detail free-row">
                  <select class="select" [name]="pf.key + '-role-' + i" aria-label="Rôle" [(ngModel)]="row.role">
                    <option value="" disabled>Rôle…</option>
                    @for (r of roles(); track r.name) {
                      <option [value]="r.name">{{ r.emoji }} {{ r.name }}</option>
                    }
                  </select>
                  <input class="input" placeholder="Armes conseillées (optionnel)" aria-label="Armes"
                         [name]="pf.key + '-weapon-' + i" [(ngModel)]="row.weapon" />
                </div>
              }
            </div>
          }
          <button type="button" class="btn btn-sm btn-ghost add" (click)="addRow(pf.key)"><app-icon name="plus" [size]="14" /> Ajouter une ligne</button>
        </fieldset>
      }

      @if (!builds().length) {
        <p class="muted">Aucun build sur ce serveur pour l'instant : crée d'abord des builds, ou utilise des lignes « sans build ».</p>
      }

      <section class="card image-preview">
        <div class="preview-head">
          <h3>Image de la compo <span class="muted">— celle postée sous /acti</span></h3>
          <button type="button" class="btn btn-sm" [disabled]="previewing() || !model().name.trim()" (click)="previewImage()">
            <app-icon name="sparkles" [size]="14" /> {{ previewing() ? 'Génération…' : previewUrl() ? 'Régénérer' : "Aperçu de l'image" }}
          </button>
        </div>
        @if (previewError()) {
          <p class="alert">{{ previewError() }}</p>
        } @else if (previewUrl(); as url) {
          <app-image-share [src]="url" [alt]="'Aperçu de la compo ' + model().name" [fileName]="'compo-' + slug(model().name)" />
        } @else {
          <p class="muted help">Seuls les rôles liés à un build apparaissent sur l'image. Rien n'est enregistré.</p>
        }
      </section>

      <div class="save-bar glass">
        <a class="btn btn-ghost" [routerLink]="['/g', guildId(), 'compos']">Annuler</a>
        <button type="submit" class="btn btn-primary" [disabled]="saving() || !model().name.trim()">
          <app-icon name="check" /> {{ saving() ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .form { max-width: 860px; }
    .two { align-items: start; }
    .two .field { flex: 1 1 200px; }
    .help { margin: 0; font-size: .85rem; }
    .preview { display: grid; gap: 10px; }
    .preview-head { display: flex; align-items: center; justify-content: space-between; }
    .party { display: grid; gap: 10px; margin: 0; padding-top: 14px; }
    legend { padding: 4px 10px; font-weight: 700; color: var(--lilac); background: var(--surface); border-radius: 8px;
             border: 1px solid var(--border); }
    .save-bar { position: sticky; bottom: 12px; z-index: 5; display: flex; justify-content: flex-end; gap: 10px;
                padding: 10px; border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-lg); }
    .slot { display: grid; grid-template-columns: minmax(160px, 1fr) 80px auto; gap: 8px; align-items: center;
            padding-bottom: 10px; border-bottom: 1px solid var(--border); }
    .detail { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .free-row .select { width: auto; min-width: 150px; }
    .free-row .input { flex: 1 1 200px; }
    .add { justify-self: start; }
    .extra { padding-left: 12px; border-left: 2px solid var(--lilac-soft); }
    .or { font-size: .8rem; }
    .extra-name { font-size: .85rem; }
    .add-build { width: auto; }
    .image-preview { display: grid; gap: 10px; margin: 16px 0; }
    .image-preview h3 { margin: 0; font-size: 1rem; }
    .image-preview h3 .muted { font-weight: 400; font-size: .85rem; }
  `,
})
export class CompoForm implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly items = inject(ItemsService);
  private readonly toast = inject(ToastService);

  readonly guildId = input.required<string>();
  /** Présent en édition (/compos/:name/edit), absent en création. */
  readonly name = input<string>();

  protected readonly parties: { key: Party; label: string }[] = [
    { key: 'pf1', label: 'Party 1' },
    { key: 'pf2', label: 'Party 2 (optionnelle)' },
  ];
  protected readonly pick = PICK;
  protected readonly free = FREE;

  protected readonly model = signal<CompoInput & { pf1: Row[]; pf2: Row[] }>({
    name: '', description: '', type_acti: 'PVP', image: '', pf1: [emptyRow()], pf2: [],
  });
  protected readonly roles = signal<RoleInfo[]>([]);
  protected readonly builds = signal<Build[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly previewing = signal(false);
  protected readonly previewError = signal('');
  protected readonly slug = fileSlug;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.setPreview(null));
  }

  private readonly buildsById = computed(() => new Map(this.builds().map((b) => [b.id, b])));
  /** Aperçu de la composition (PF1 + PF2, lignes avec un rôle). Méthode et pas computed :
   *  le nombre est modifié en place par ngModel, comme pour total(). */
  previewRows(): { role: string; count: number }[] {
    return [...this.model().pf1, ...this.model().pf2]
      .filter((r) => r.role)
      .map((r) => ({ role: r.role, count: Number(r.count) || 0 }));
  }
  protected readonly emojiMap = computed(() => Object.fromEntries(this.roles().map((r) => [r.name, r.emoji])));
  /** Builds regroupés par rôle pour le sélecteur. */
  protected readonly buildGroups = computed(() => {
    const groups = new Map<string, Build[]>();
    for (const b of this.builds()) groups.set(b.role, [...(groups.get(b.role) ?? []), b]);
    return [...groups].map(([role, builds]) => ({ role, builds }));
  });

  async ngOnInit(): Promise<void> {
    this.api.roles(this.guildId()).subscribe({ next: (r) => this.roles.set(r), error: () => {} });
    this.api.builds(this.guildId()).subscribe({ next: (b) => this.builds.set(b), error: () => {} });
    this.items.load().catch(() => {});
    const name = this.name();
    if (name) {
      try {
        const { total: _t, custom: _c, ...compo } = await firstValueFrom(this.api.compo(this.guildId(), name));
        const withMode = (rows: SlotRow[]): Row[] =>
          rows.map(({ build_ids, ...r }) => ({ ...r, free: r.build_id == null, extra: (build_ids ?? []).slice(1) }));
        this.model.set({ ...compo, pf1: withMode(compo.pf1), pf2: withMode(compo.pf2) });
      } catch (err) {
        this.error.set(errorMessage(err));
      }
    }
  }

  extraBuilds(row: Row): Build[] {
    return (row.extra ?? []).map((id) => this.buildsById().get(id)).filter((b): b is Build => !!b);
  }

  /** Builds du même rôle pas encore proposés sur cette ligne. */
  addableBuilds(row: Row): Build[] {
    const first = this.buildOf(row);
    if (!first) return [];
    const taken = new Set([first.id, ...(row.extra ?? [])]);
    return this.builds().filter((b) => b.role === first.role && !taken.has(b.id));
  }

  addExtra(party: Party, index: number, select: HTMLSelectElement): void {
    const id = Number(select.value);
    select.value = '';
    if (id) this.updateRow(party, index, (row) => ({ ...row, extra: [...(row.extra ?? []), id] }));
  }

  removeExtra(party: Party, index: number, id: number): void {
    this.updateRow(party, index, (row) => ({ ...row, extra: (row.extra ?? []).filter((x) => x !== id) }));
  }

  buildOf(row: Row): Build | undefined {
    return row.build_id != null ? this.buildsById().get(row.build_id) : undefined;
  }

  sourceOf(row: Row): string {
    if (row.build_id != null) return String(row.build_id);
    return row.free ? FREE : PICK;
  }

  /** Choix dans le sélecteur : un build (id), ou « sans build ». */
  setSource(party: Party, index: number, value: string): void {
    this.updateRow(party, index, (row) => {
      if (value === FREE) return { ...row, build_id: null, free: true, role: '', weapon: '', extra: [] };
      const build = this.buildsById().get(Number(value));
      return build ? { ...row, build_id: build.id, free: false, role: build.role, weapon: build.name, extra: [] } : row;
    });
  }

  /** Un rôle ne peut apparaître qu'une fois par party (même règle que l'API). */
  isRoleTaken(party: Party, role: string, exceptIndex: number): boolean {
    const wanted = role.toUpperCase();
    return this.model()[party].some((r, i) => i !== exceptIndex && r.role.toUpperCase() === wanted);
  }

  emoji(role: string): string {
    return this.roles().find((r) => r.name === role)?.emoji ?? '';
  }

  addRow(party: Party): void {
    this.model.update((m) => ({ ...m, [party]: [...m[party], emptyRow()] }));
  }

  removeRow(party: Party, index: number): void {
    this.model.update((m) => ({ ...m, [party]: m[party].filter((_, i) => i !== index) }));
  }

  total(party: Party): number {
    return this.model()[party].reduce((sum, r) => sum + (r.role ? Number(r.count) || 0 : 0), 0);
  }

  /** Corps envoyé à l'API (sans l'état d'interface « free »). */
  private body(): CompoInput {
    const { pf1, pf2, ...rest } = this.model();
    const clean = (rows: Row[]): SlotRow[] => rows.map(({ free: _f, extra, ...r }) =>
      extra?.length && r.build_id != null ? { ...r, build_ids: [r.build_id, ...extra] } : r);
    return { ...rest, pf1: clean(pf1), pf2: clean(pf2) };
  }

  /** Génère l'image de la compo telle qu'elle est dans le formulaire (non enregistrée). */
  async previewImage(): Promise<void> {
    this.previewing.set(true);
    this.previewError.set('');
    try {
      const blob = await firstValueFrom(this.api.previewCompoImage(this.guildId(), this.body()));
      this.setPreview(URL.createObjectURL(blob));
    } catch (err) {
      this.setPreview(null);
      this.previewError.set(await blobErrorMessage(err));
    } finally {
      this.previewing.set(false);
    }
  }

  private setPreview(url: string | null): void {
    const old = this.previewUrl();
    if (old) URL.revokeObjectURL(old);
    this.previewUrl.set(url);
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const name = this.name();
      const body = this.body();
      await firstValueFrom(
        name ? this.api.updateCompo(this.guildId(), name, { ...body, name }) : this.api.createCompo(this.guildId(), body),
      );
      this.toast.success(name ? 'Compo enregistrée.' : `Compo « ${body.name} » créée.`);
      await this.router.navigate(['/g', this.guildId(), 'compos']);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  private updateRow(party: Party, index: number, change: (row: Row) => Row): void {
    this.model.update((m) => ({ ...m, [party]: m[party].map((r, i) => (i === index ? change(r) : r)) }));
  }
}

/** Les erreurs d'une requête en `responseType: 'blob'` arrivent en Blob : on relit le « detail » JSON. */
export async function blobErrorMessage(err: unknown): Promise<string> {
  if (err instanceof HttpErrorResponse && err.error instanceof Blob) {
    try {
      const detail = JSON.parse(await err.error.text())?.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail)) return 'Compo invalide : vérifie les lignes (nombre de joueurs, rôles).';
    } catch {
      /* corps non JSON : message générique */
    }
  }
  return errorMessage(err);
}
