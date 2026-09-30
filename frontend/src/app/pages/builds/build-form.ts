import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { ItemsService } from '../../core/items.service';
import { BuildInput, FREE_CHOICE, Item, RoleInfo, Slot } from '../../core/models';
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

export function allTwoHanded(mainhand: string[], get: (id: string) => Item | undefined): boolean {
  const weapons = mainhand.filter((id) => id !== FREE_CHOICE).map(get);
  return weapons.length > 0 && weapons.length === mainhand.length && weapons.every((w) => !!w?.two_handed);
}

/** Disposition de l'inventaire du jeu (null = case vide). */
const PAPER_DOLL: (Slot | null)[] = [null, 'head', 'cape', 'mainhand', 'armor', 'offhand', 'potion', 'shoes', 'food'];

@Component({
  selector: 'app-build-form',
  imports: [FormsModule, RouterLink, ItemPicker],
  template: `
    <div class="page-head">
      <h1>{{ buildId() ? 'Modifier le build' : 'Nouveau build' }}</h1>
    </div>

    <form class="form card" (ngSubmit)="save()">
      @if (error()) {
        <p class="alert">{{ error() }}</p>
      }

      <div class="field">
        <label for="name">Nom</label>
        <input id="name" name="name" class="input" required maxlength="100" [(ngModel)]="model().name" />
      </div>

      <div class="row two">
        <div class="field">
          <label for="role">Rôle</label>
          <select id="role" name="role" class="select" required [(ngModel)]="model().role">
            <option value="" disabled>Choisir…</option>
            @for (r of roles(); track r.name) {
              <option [value]="r.name">{{ r.emoji }} {{ r.name }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="type">Type</label>
          <select id="type" name="type_acti" class="select" [(ngModel)]="model().type_acti">
            <option value="PVP">PVP</option>
            <option value="PVE">PVE</option>
          </select>
        </div>
      </div>

      <fieldset class="equipment">
        <legend>Équipement</legend>
        <div class="doll">
          @for (slot of doll; track $index) {
            @if (slot) {
              <app-item-picker [slot]="slot" [value]="model().items[slot] ?? []"
                               [disabled]="slot === 'offhand' && twoHanded()"
                               [disabledReason]="slot === 'offhand' && twoHanded() ? 'Toutes les armes proposées sont à deux mains : pas de main gauche' : ''"
                               (valueChange)="setItem(slot, $event)" />
            } @else {
              <span></span>
            }
          }
        </div>
        @if (itemsError()) {
          <p class="error-text">{{ itemsError() }}</p>
        }
      </fieldset>

      <div class="field">
        <label for="weapon">Précisions sur le stuff (optionnel)</label>
        <input id="weapon" name="weapon" class="input" maxlength="200"
               placeholder="ex : tier 8.1 minimum, bouffe, potion, monture…"
               [(ngModel)]="model().weapon" />
      </div>

      <div class="field">
        <label for="notes">Notes</label>
        <textarea id="notes" name="notes" class="textarea" maxlength="4000" [(ngModel)]="model().notes"></textarea>
      </div>

      <div class="field">
        <label for="image">Image (URL, optionnel)</label>
        <input id="image" name="image" class="input" type="url" maxlength="500" [(ngModel)]="model().image" />
      </div>

      <div class="row">
        <button type="submit" class="btn btn-primary" [disabled]="saving() || !model().name.trim() || !model().role">
          {{ saving() ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
        <a class="btn" [routerLink]="['/g', guildId(), 'builds']">Annuler</a>
      </div>
    </form>
  `,
  styles: `
    .two { align-items: start; }
    .two .field { flex: 1 1 200px; }
    .equipment { border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; margin: 0; }
    legend { padding: 0 6px; font-weight: 600; color: var(--lilac); }
    .doll { display: grid; grid-template-columns: repeat(3, 100px); gap: 12px 16px; justify-content: center; }
  `,
})
export class BuildForm implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly items = inject(ItemsService);
  protected readonly doll = PAPER_DOLL;

  readonly guildId = input.required<string>();
  /** Présent en édition (/builds/:buildId/edit), absent en création. */
  readonly buildId = input<string>();

  // Signal (et pas simple propriété) : l'app est zoneless, le rechargement
  // asynchrone du build doit notifier la vue.
  protected readonly model = signal<BuildInput>(emptyBuild());
  protected readonly roles = signal<RoleInfo[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly itemsError = signal('');

  /** Main gauche bloquée seulement si TOUTES les armes proposées sont à deux mains
   *  (même règle que l'API). Arme « au choix » ou au moins une arme à une main → possible. */
  readonly twoHanded = computed(() => allTwoHanded(this.model().items.mainhand ?? [], (id) => this.items.get(id)));

  setItem(slot: Slot, choices: string[]): void {
    this.model.update((m) => {
      const items = { ...m.items };
      if (choices.length) items[slot] = choices;
      else delete items[slot];
      if (slot === 'mainhand' && allTwoHanded(choices, (id) => this.items.get(id))) delete items.offhand;
      return { ...m, items };
    });
  }

  async ngOnInit(): Promise<void> {
    this.api.roles(this.guildId()).subscribe({ next: (r) => this.roles.set(r), error: () => {} });
    this.items.load().catch(() => this.itemsError.set("Impossible de charger le catalogue d'objets."));
    const id = this.buildId();
    if (id) {
      try {
        const { id: _id, created_by_name: _by, ...rest } = await firstValueFrom(this.api.build(this.guildId(), +id));
        this.model.set({ ...rest, items: normalizeItems(rest.items) });
      } catch (err) {
        this.error.set(errorMessage(err));
      }
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const id = this.buildId();
      await firstValueFrom(
        id ? this.api.updateBuild(this.guildId(), +id, this.model()) : this.api.createBuild(this.guildId(), this.model()),
      );
      await this.router.navigate(['/g', this.guildId(), 'builds']);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
