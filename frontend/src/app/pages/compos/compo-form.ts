import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormField, applyEach, disabled, form, max, maxLength, min, required, requiredError, validate } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { ItemsService } from '../../core/items.service';
import { Build, Compo, CompoInput, SlotRow } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Gear } from '../../shared/gear';
import { sortByRole } from '../../shared/roles';
import { Icon } from '../../shared/icon';
import { ImageShare, fileSlug } from '../../shared/image-share';
import { RoleBar } from '../../shared/role-bar';

export type Party = 'pf1' | 'pf2';

/** Valeurs spéciales du sélecteur « source » d'une ligne. */
const PICK = '';
const FREE = 'free';

/** Ligne du formulaire : `free` (côté écran seulement) = l'utilisateur a choisi « sans build ». */
type Row = SlotRow & { free?: boolean; share: number | null };

type CompoModel = Omit<CompoInput, 'custom_shares' | 'pf1' | 'pf2'> & { custom_shares: boolean; pf1: Row[]; pf2: Row[] };

/** Parts de paie max d'une ligne (même borne que l'API). */
export const MAX_SHARE = 10;

function emptyRow(): Row {
  return { build_id: null, role: '', count: 1, weapon: '', share: 1 };
}

function emptyCompo(): CompoModel {
  return { name: '', description: '', type_acti: 'PVP', image: '', custom_shares: false, pf1: [emptyRow()], pf2: [] };
}

/** Compo de l'API → valeurs du formulaire (une ligne sans build est une ligne « sans build » choisie). */
function toModel({ total: _t, custom: _c, ...compo }: Compo): CompoModel {
  const withMode = (rows: SlotRow[]): Row[] =>
    rows.map(({ slot_key: _k, ...r }) => ({ ...r, share: r.share ?? 1, free: r.build_id == null }));
  return { ...compo, custom_shares: !!compo.custom_shares, pf1: withMode(compo.pf1), pf2: withMode(compo.pf2) };
}

@Component({
  selector: 'app-compo-form',
  imports: [FormField, RouterLink, Gear, Icon, ImageShare, RoleBar],
  template: `
    <div class="page-head">
      <div>
        <h1>{{ name() ? 'Modifier « ' + name() + ' »' : 'Nouvelle compo' }}</h1>
        <p class="subtitle">Chaque ligne = un build × un nombre de joueurs. Un seul build par rôle et par party.</p>
      </div>
    </div>

    <form class="form" (submit)="$event.preventDefault(); save()">
      @if (error()) {
        <p class="alert">{{ error() }}</p>
      }

      <div class="card form infos">
      <div class="row two">
        <div class="field">
          <label for="name">Nom</label>
          <input id="name" class="input" [formField]="form.name" />
        </div>
        <div class="field">
          <label for="type">Type</label>
          <select id="type" class="select" [formField]="form.type_acti">
            <option value="PVP">PVP</option>
            <option value="PVE">PVE</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label for="description">Description</label>
        <textarea id="description" class="textarea" [formField]="form.description"></textarea>
      </div>

      <div class="field">
        <label for="image">Image (URL, optionnel)</label>
        <input id="image" class="input" type="url" [formField]="form.image" />
      </div>

      <label class="check" [class.on]="model().custom_shares">
        <span class="check-icon" aria-hidden="true">💰</span>
        <span class="check-text">
          <strong>Parts de paie personnalisées</strong>
          <span class="muted">Une colonne « Parts » par ligne pour /finacti : 1 par défaut, 2 = double part,
            0,5 = demi-part, 0 = non payé.</span>
        </span>
        <input type="checkbox" role="switch" [formField]="form.custom_shares" />
      </label>
      </div>

      <div class="card preview">
        <div class="preview-head">
          <strong>Aperçu</strong>
          <span class="badge">{{ totals().pf1 + totals().pf2 }} joueurs</span>
        </div>
        <app-role-bar [rows]="previewRows()" [emojis]="emojiMap()" />
        <p class="muted help">Sur Discord, le joueur choisit son rôle et le build lui est imposé.</p>
      </div>

      @for (pf of parties; track pf.key) {
        <fieldset class="party card">
          <legend>{{ pf.label }} <span class="muted">— {{ totals()[pf.key] }} joueurs</span></legend>
          @if (model().custom_shares && model()[pf.key].length) {
            <div class="slot-head with-shares" aria-hidden="true"><span>Build</span><span>Joueurs</span><span>Parts</span></div>
          }
          @for (field of form[pf.key]; track $index; let i = $index) {
            @let row = field().value();
            @let source = sourceOf(row);
            <div class="slot" [class.with-shares]="model().custom_shares" [attr.data-party]="pf.key">
              <select class="select source" aria-label="Build" (change)="setSource(pf.key, i, $any($event.target).value)">
                <option [value]="pick" disabled [selected]="source === pick">Choisir un build…</option>
                @for (group of buildGroups(); track group.role) {
                  <optgroup [label]="group.role">
                    @for (b of group.builds; track b.id) {
                      @let taken = isBuildTaken(pf.key, b.id, i);
                      <option [value]="'' + b.id" [disabled]="taken" [selected]="source === '' + b.id">
                        {{ b.name }}{{ taken ? ' (déjà dans cette party : augmente le nombre)' : '' }}
                      </option>
                    }
                  </optgroup>
                }
                <option [value]="free" [selected]="source === free">Sans build (rôle libre)</option>
              </select>
              <input class="input count" type="number" aria-label="Nombre" [formField]="field.count" />
              @if (model().custom_shares) {
                <input class="input share" type="number" step="0.5" aria-label="Parts de paie" [formField]="field.share" />
              }
              <button type="button" class="btn btn-sm btn-danger" aria-label="Retirer la ligne"
                      (click)="removeRow(pf.key, i)">✕</button>

              @if (buildOf(row); as b) {
                <div class="detail">
                  <span class="badge">{{ emojiMap()[b.role] }} {{ b.role }}</span>
                  <app-gear [items]="b.items" size="small" />
                </div>
              } @else if (row.free) {
                <div class="detail free-row">
                  <select class="select" aria-label="Rôle" [formField]="field.role" (change)="sortRows(pf.key)">
                    <option value="" disabled>Rôle…</option>
                    @for (r of roles(); track r.name) {
                      <option [value]="r.name">{{ r.emoji }} {{ r.name }}</option>
                    }
                  </select>
                  <input class="input" placeholder="Armes conseillées (optionnel)" aria-label="Armes" [formField]="field.weapon" />
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
          <button type="button" class="btn btn-sm" [disabled]="previewing() || form.name().invalid()" (click)="previewImage()">
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
        <button type="submit" class="btn btn-primary" [disabled]="saving() || form().invalid()">
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
    .slot.with-shares, .slot-head { grid-template-columns: minmax(0, 1fr) 68px 68px 34px; }
    .slot-head { display: grid; gap: 8px; font-size: .75rem; font-weight: 600; text-transform: uppercase;
                 letter-spacing: .06em; color: var(--text-faint); }
    /* Option « parts de paie » : carte cliquable + interrupteur, lilas quand activée */
    .check { display: flex; align-items: center; gap: 14px; padding: 12px 14px; cursor: pointer;
             border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-2);
             transition: border-color .15s, background .15s, box-shadow .15s; }
    .check:hover { border-color: var(--lilac-deep); }
    .check.on { border-color: var(--lilac-strong); background: var(--lilac-soft); box-shadow: var(--shadow-glow); }
    .check-icon { display: grid; place-items: center; flex: none; width: 38px; height: 38px; border-radius: 10px;
                  background: var(--surface-2); font-size: 1.15rem; }
    .check.on .check-icon { background: var(--lilac-soft); }
    .check-text { display: grid; gap: 2px; flex: 1; min-width: 0; }
    .check-text .muted { font-size: .85rem; }
    .check input { appearance: none; flex: none; position: relative; width: 42px; height: 24px; margin: 0;
                   border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border);
                   cursor: pointer; transition: background .15s, border-color .15s; }
    .check input::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px;
                          border-radius: 50%; background: var(--text-muted); transition: transform .15s, background .15s; }
    .check input:checked { background: var(--lilac-strong); border-color: var(--lilac-strong); }
    .check input:checked::after { transform: translateX(18px); background: var(--on-lilac); }
    .check input:focus-visible { outline: 2px solid var(--lilac); outline-offset: 2px; }
    .detail { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .free-row .select { width: auto; min-width: 150px; }
    .free-row .input { flex: 1 1 200px; }
    .add { justify-self: start; }
    .image-preview { display: grid; gap: 10px; margin: 16px 0; }
    .image-preview h3 { margin: 0; font-size: 1rem; }
    .image-preview h3 .muted { font-weight: 400; font-size: .85rem; }
  `,
})
export class CompoForm {
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

  private readonly rolesRes = rxResource({ params: () => this.guildId(), stream: ({ params }) => this.api.roles(params) });
  private readonly buildsRes = rxResource({ params: () => this.guildId(), stream: ({ params }) => this.api.builds(params) });
  /** Compo éditée (rien à charger en création : la ressource reste inactive). */
  private readonly existing = rxResource({
    params: () => {
      const name = this.name();
      return name ? { guildId: this.guildId(), name } : undefined;
    },
    stream: ({ params }) => this.api.compo(params.guildId, params.name),
  });

  protected readonly roles = computed(() => (this.rolesRes.hasValue() ? this.rolesRes.value() : []));
  protected readonly builds = computed(() => (this.buildsRes.hasValue() ? this.buildsRes.value() : []));

  /** Valeurs du formulaire : une ligne vide en création, la compo une fois chargée en édition. */
  protected readonly model = linkedSignal<CompoModel>(() => (this.existing.hasValue() ? toModel(this.existing.value()) : emptyCompo()));
  protected readonly form = form(this.model, (p) => {
    required(p.name);
    validate(p.name, ({ value }) => (value().trim() ? undefined : requiredError()));
    maxLength(p.name, 100);
    disabled(p.name, () => !!this.name());   // le nom identifie la compo : pas de renommage
    maxLength(p.description, 2000);
    maxLength(p.image, 500);
    for (const party of [p.pf1, p.pf2]) {
      applyEach(party, (row) => {
        min(row.count, 1);
        max(row.count, 50);
        min(row.share, 0);
        max(row.share, MAX_SHARE);
      });
    }
  });

  protected readonly saving = signal(false);
  private readonly saveError = signal('');
  protected readonly error = computed(() => (this.existing.error() ? errorMessage(this.existing.error()) : this.saveError()));
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly previewing = signal(false);
  protected readonly previewError = signal('');
  protected readonly slug = fileSlug;

  constructor() {
    this.items.load().catch(() => {});
    inject(DestroyRef).onDestroy(() => this.setPreview(null));
  }

  private readonly buildsById = computed(() => new Map(this.builds().map((b) => [b.id, b])));
  /** Aperçu de la composition (PF1 + PF2, lignes avec un rôle). */
  protected readonly previewRows = computed(() => [...this.model().pf1, ...this.model().pf2]
    .filter((r) => r.role)
    .map((r) => ({ role: r.role, count: Number(r.count) || 0 })));
  /** Joueurs par party, en ignorant les lignes sans rôle. */
  protected readonly totals = computed((): Record<Party, number> => ({ pf1: this.total('pf1'), pf2: this.total('pf2') }));
  protected readonly emojiMap = computed(() => Object.fromEntries(this.roles().map((r) => [r.name, r.emoji])));
  /** Builds regroupés par rôle pour le sélecteur. */
  protected readonly buildGroups = computed(() => {
    const groups = new Map<string, Build[]>();
    for (const b of this.builds()) groups.set(b.role, [...(groups.get(b.role) ?? []), b]);
    return [...groups].map(([role, builds]) => ({ role, builds }));
  });

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
      if (value === FREE) return { ...row, build_id: null, free: true, role: '', weapon: '' };
      const build = this.buildsById().get(Number(value));
      return build ? { ...row, build_id: build.id, free: false, role: build.role, weapon: build.name } : row;
    });
    this.sortRows(party);
  }

  /** Un même build ne peut être qu'une fois par party (même règle que l'API) : sinon on augmente le nombre.
   *  Plusieurs lignes du même rôle avec des builds différents sont permises (ex. 2 tanks). */
  isBuildTaken(party: Party, buildId: number, exceptIndex: number): boolean {
    return this.model()[party].some((r, i) => i !== exceptIndex && r.build_id === buildId);
  }

  /** Range les lignes par rôle (TANK, HEAL, DPS, SUPPORT, puis le reste), ordre de saisie gardé
   *  à rôle égal ; les lignes sans rôle choisi restent en bas. */
  sortRows(party: Party): void {
    this.model.update((m) => {
      const rows = m[party];
      const withRole = sortByRole(rows.filter((r) => r.role), (r) => r.role);
      return { ...m, [party]: [...withRole, ...rows.filter((r) => !r.role)] };
    });
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
    // Champs explicites : ni « free » ni l'identifiant interne que les signal forms posent sur chaque ligne.
    const clean = (rows: Row[]): SlotRow[] =>
      rows.map(({ build_id, role, count, weapon, share }) => ({ build_id, role, count, weapon, share: share ?? 1 }));
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
    if (this.form().invalid()) return;
    this.saving.set(true);
    this.saveError.set('');
    try {
      const name = this.name();
      const body = this.body();
      await firstValueFrom(
        name ? this.api.updateCompo(this.guildId(), name, { ...body, name }) : this.api.createCompo(this.guildId(), body),
      );
      this.toast.success(name ? 'Compo enregistrée.' : `Compo « ${body.name} » créée.`);
      await this.router.navigate(['/g', this.guildId(), 'compos']);
    } catch (err) {
      this.saveError.set(errorMessage(err));
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
