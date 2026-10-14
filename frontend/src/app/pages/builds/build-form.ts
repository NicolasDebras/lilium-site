import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormField, form, maxLength, required, requiredError, validate } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { ItemsService } from '../../core/items.service';
import { Build, BuildInput, FREE_CHOICE, Item, SWAPS_MAX, Slot } from '../../core/models';
import { parseChoice } from '../../core/tiers';
import { PAPER_DOLL } from '../../shared/gear';
import { Icon } from '../../shared/icon';
import { ItemPicker } from '../../shared/item-picker';

/** Tolère l'ancien format {slot: "ID"} renvoyé par une vieille API. */
function normalizeItems(items: unknown): BuildInput['items'] {
  const out: Record<string, string[]> = {};
  for (const [slot, value] of Object.entries((items ?? {}) as Record<string, string | string[]>)) {
    const list = Array.isArray(value) ? value : value ? [value] : [];
    if (list.length) out[slot] = list;
  }
  return out;
}

function emptyBuild(): BuildInput {
  return { name: '', role: '', type_acti: 'PVP', weapon: '', notes: '', image: '', items: {} };
}

/** Build de l'API → valeurs du formulaire (sans id ni auteur, équipement normalisé). */
function toInput({ id: _id, created_by_name: _by, ...rest }: Build): BuildInput {
  return { ...rest, items: normalizeItems(rest.items) };
}

export function allTwoHanded(mainhand: string[], get: (id: string) => Item | undefined): boolean {
  const weapons = mainhand.filter((id) => id !== FREE_CHOICE).map(get);
  return weapons.length > 0 && weapons.length === mainhand.length && weapons.every((w) => !!w?.two_handed);
}

@Component({
  selector: 'app-build-form',
  imports: [FormField, RouterLink, ItemPicker, Icon],
  template: `
    <div class="page-head">
      <div>
        <h1>{{ buildId() ? 'Modifier le build' : 'Nouveau build' }}</h1>
        <p class="subtitle">Choisis jusqu'à 3 objets par case, ou laisse le joueur libre (« au choix »).
          Chaque objet a son tier minimum (T4 à T8) et son enchantement : un équivalent convient (8.1 = 7.2 = 6.3).</p>
      </div>
    </div>

    <form class="build-form" (submit)="$event.preventDefault(); save()">
      @if (error()) {
        <p class="alert">{{ error() }}</p>
      }

      <div class="layout">
        <fieldset class="equipment card">
          <legend><app-icon name="shield" [size]="16" /> Équipement</legend>
          <div class="doll">
            @for (slot of doll; track $index) {
              @if (slot) {
                <app-item-picker [slot]="slot" [value]="model().items[slot] ?? []"
                                 [disabled]="slot === 'offhand' && twoHanded()"
                                 [disabledReason]="slot === 'offhand' && twoHanded() ? 'Toutes les armes proposées sont à deux mains : pas de main gauche' : ''"
                                 (valueChange)="setItem(slot, $event)" />
              } @else {
                <span class="doll-gap"><app-icon name="sparkles" [size]="22" /></span>
              }
            }
          </div>
          <div class="swaps-row" role="group" aria-label="Swaps" title="Objets de rechange (tous emplacements)">
            <span class="swaps-title">Swaps</span>
            @for (i of swapSlots; track i) {
              <app-item-picker slot="swaps" [limit]="1" placeholder="Swap"
                               [value]="swapAt(i)" (valueChange)="setSwap(i, $event)" />
            }
          </div>
          @if (itemsError()) {
            <p class="error-text">{{ itemsError() }}</p>
          }
        </fieldset>

        <div class="fields card form">
          <div class="field">
            <label for="name">Nom</label>
            <input id="name" class="input" placeholder="ex : Heal Sacré ZvZ" [formField]="form.name" />
          </div>

          <div class="row two">
            <div class="field">
              <label for="role">Rôle</label>
              <select id="role" class="select" [formField]="form.role">
                <option value="" disabled>Choisir…</option>
                @for (r of roles(); track r.name) {
                  <option [value]="r.name">{{ r.emoji }} {{ r.name }}</option>
                }
              </select>
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
            <label for="weapon">Précisions sur le stuff (optionnel)</label>
            <input id="weapon" class="input" placeholder="ex : monture, spé minimum, consignes de stuff…" [formField]="form.weapon" />
          </div>

          <div class="field">
            <label for="notes">Notes</label>
            <textarea id="notes" class="textarea" placeholder="Rotation, placement, consignes…" [formField]="form.notes"></textarea>
          </div>

          <div class="field">
            <label for="image">Image (URL, optionnel)</label>
            <input id="image" class="input" type="url" [formField]="form.image" />
          </div>
        </div>
      </div>

      <div class="save-bar glass">
        <a class="btn btn-ghost" [routerLink]="['/g', guildId(), 'builds']">Annuler</a>
        <button type="submit" class="btn btn-primary" [disabled]="saving() || form().invalid()">
          <app-icon name="check" /> {{ saving() ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .build-form { display: grid; gap: 18px; }
    .layout { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 18px; align-items: start; }
    .two { align-items: start; flex-wrap: nowrap; gap: 12px; }
    .two .field { flex: 1 1 0; min-width: 0; }
    /* sticky crée un contexte d'empilement : le panneau de choix d'objets (position fixed, z-index 50)
       y reste enfermé. z-index 30 > barre du haut (20), barre d'enregistrement (5) et carte des champs. */
    .equipment { margin: 0; padding: 18px; position: sticky; top: 84px; z-index: 30;
                 background: radial-gradient(circle at 50% 35%, rgba(167, 123, 243, .16), transparent 65%), var(--surface); }
    legend { display: inline-flex; align-items: center; gap: 6px; padding: 0 8px; font-weight: 700; color: var(--lilac); }
    .doll { display: grid; grid-template-columns: repeat(3, 104px); gap: 14px 16px; justify-content: center; }
    /* Swaps sous l'équipement : une case par objet de rechange, séparées par un trait lilas */
    .swaps-row { display: grid; grid-template-columns: repeat(6, 76px); gap: 12px 10px; justify-content: center;
                 align-items: start; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--lilac-strong); }
    .swaps-title { grid-column: 1 / -1; font-size: .75rem; font-weight: 700; text-transform: uppercase;
                   letter-spacing: .08em; color: var(--lilac); }
    .doll-gap { display: grid; place-items: center; color: var(--lilac); opacity: .25; }
    .save-bar { position: sticky; bottom: 12px; z-index: 5; display: flex; justify-content: flex-end; gap: 10px;
                padding: 10px; border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-lg); }
    @media (max-width: 820px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
      .equipment { position: static; }
      .doll { grid-template-columns: repeat(3, minmax(0, 100px)); gap: 10px; }
      .swaps-row { grid-template-columns: repeat(3, 76px); }
    }
  `,
})
export class BuildForm {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly items = inject(ItemsService);
  private readonly toast = inject(ToastService);
  protected readonly doll = PAPER_DOLL;

  readonly guildId = input.required<string>();
  /** Présent en édition (/builds/:buildId/edit), absent en création. */
  readonly buildId = input<string>();

  private readonly rolesRes = rxResource({
    params: () => this.guildId(),
    stream: ({ params }) => this.api.roles(params),
  });
  protected readonly roles = computed(() => (this.rolesRes.hasValue() ? this.rolesRes.value() : []));

  /** Build édité (rien à charger en création : la ressource reste inactive). */
  private readonly existing = rxResource({
    params: () => {
      const id = this.buildId();
      return id ? { guildId: this.guildId(), id: Number(id) } : undefined;
    },
    stream: ({ params }) => this.api.build(params.guildId, params.id),
  });

  /** Valeurs du formulaire : vides en création, celles du build une fois chargé en édition. */
  protected readonly model = linkedSignal<BuildInput>(() => (this.existing.hasValue() ? toInput(this.existing.value()) : emptyBuild()));
  protected readonly form = form(this.model, (p) => {
    required(p.name);
    validate(p.name, ({ value }) => (value().trim() ? undefined : requiredError()));
    maxLength(p.name, 100);
    required(p.role);
    maxLength(p.weapon, 200);
    maxLength(p.notes, 4000);
    maxLength(p.image, 500);
  });

  protected readonly saving = signal(false);
  private readonly saveError = signal('');
  protected readonly error = computed(() => (this.existing.error() ? errorMessage(this.existing.error()) : this.saveError()));
  protected readonly itemsError = signal('');

  /** Main gauche bloquée seulement si TOUTES les armes proposées sont à deux mains
   *  (même règle que l'API). Arme « au choix » ou au moins une arme à une main → possible. */
  readonly twoHanded = computed(() => allTwoHanded(this.model().items.mainhand ?? [], (id) => this.items.get(id)));

  /** Une case par swap possible, sous l'équipement. */
  protected readonly swapSlots = Array.from({ length: SWAPS_MAX }, (_, i) => i);

  swapAt(index: number): string[] {
    const id = this.model().items.swaps?.[index];
    return id ? [id] : [];
  }

  /** Remplit ou vide la case `index` ; les swaps restent tassés à gauche (pas de trou)
   *  et un objet déjà présent dans une autre case y est déplacé (pas de doublon). */
  setSwap(index: number, ids: string[]): void {
    const swaps = [...(this.model().items.swaps ?? [])];
    if (!ids.length) {
      swaps.splice(index, 1);
      this.setSwaps(swaps);
      return;
    }
    const pos = Math.min(index, swaps.length);
    swaps[pos] = ids[0];
    const base = parseChoice(ids[0]).base;   // même objet à un autre tier = doublon
    this.setSwaps(swaps.filter((id, i) => parseChoice(id).base !== base || i === pos));
  }

  /** Objets de rechange (tous emplacements), affichés sous l'équipement. */
  setSwaps(ids: string[]): void {
    this.model.update((m) => {
      const items = { ...m.items };
      if (ids.length) items.swaps = ids;
      else delete items.swaps;
      return { ...m, items };
    });
  }

  setItem(slot: Slot, choices: string[]): void {
    this.model.update((m) => {
      const items = { ...m.items };
      if (choices.length) items[slot] = choices;
      else delete items[slot];
      if (slot === 'mainhand' && allTwoHanded(choices, (id) => this.items.get(id))) delete items.offhand;
      return { ...m, items };
    });
  }

  constructor() {
    this.items.load().catch(() => this.itemsError.set("Impossible de charger le catalogue d'objets."));
  }

  async save(): Promise<void> {
    if (this.form().invalid()) return;
    this.saving.set(true);
    this.saveError.set('');
    try {
      const id = this.buildId();
      await firstValueFrom(
        id ? this.api.updateBuild(this.guildId(), +id, this.model()) : this.api.createBuild(this.guildId(), this.model()),
      );
      this.toast.success(id ? 'Build enregistré.' : `Build « ${this.model().name} » créé.`);
      await this.router.navigate(['/g', this.guildId(), 'builds']);
    } catch (err) {
      this.saveError.set(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
