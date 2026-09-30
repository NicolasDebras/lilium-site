import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { ItemsService } from '../../core/items.service';
import { Build, CompoInput, RoleInfo, SlotRow } from '../../core/models';
import { Gear } from '../../shared/gear';

export type Party = 'pf1' | 'pf2';

/** Valeurs spéciales du sélecteur « source » d'une ligne. */
const PICK = '';
const FREE = 'free';

/** Ligne du formulaire : `free` (côté écran seulement) = l'utilisateur a choisi « sans build ». */
type Row = SlotRow & { free?: boolean };

function emptyRow(): Row {
  return { build_id: null, role: '', count: 1, weapon: '' };
}

@Component({
  selector: 'app-compo-form',
  imports: [FormsModule, RouterLink, Gear],
  template: `
    <div class="page-head">
      <h1>{{ name() ? 'Modifier « ' + name() + ' »' : 'Nouvelle compo' }}</h1>
    </div>

    <form class="form card" (ngSubmit)="save()">
      @if (error()) {
        <p class="alert">{{ error() }}</p>
      }

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

      <p class="muted help">
        Chaque ligne = un build × un nombre de joueurs. Un seul build par rôle et par party :
        sur Discord, le joueur choisit son rôle et le build lui est imposé.
      </p>

      @for (pf of parties; track pf.key) {
        <fieldset class="party">
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
                        {{ b.name }}{{ isRoleTaken(pf.key, b.role, i) ? ' (rôle déjà pris)' : '' }}
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
          <button type="button" class="btn btn-sm add" (click)="addRow(pf.key)">+ Ajouter une ligne</button>
        </fieldset>
      }

      @if (!builds().length) {
        <p class="muted">Aucun build sur ce serveur pour l'instant : crée d'abord des builds, ou utilise des lignes « sans build ».</p>
      }

      <div class="row">
        <button type="submit" class="btn btn-primary" [disabled]="saving() || !model().name.trim()">
          {{ saving() ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
        <a class="btn" [routerLink]="['/g', guildId(), 'compos']">Annuler</a>
      </div>
    </form>
  `,
  styles: `
    .two { align-items: start; }
    .two .field { flex: 1 1 200px; }
    .help { margin: 0; font-size: .85rem; }
    .party { border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; display: grid; gap: 10px; margin: 0; }
    legend { padding: 0 6px; font-weight: 600; color: var(--lilac); }
    .slot { display: grid; grid-template-columns: minmax(160px, 1fr) 80px auto; gap: 8px; align-items: center;
            padding-bottom: 10px; border-bottom: 1px solid var(--border); }
    .detail { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .free-row .select { width: auto; min-width: 150px; }
    .free-row .input { flex: 1 1 200px; }
    .add { justify-self: start; }
  `,
})
export class CompoForm implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly items = inject(ItemsService);

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

  private readonly buildsById = computed(() => new Map(this.builds().map((b) => [b.id, b])));
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
        const withMode = (rows: SlotRow[]): Row[] => rows.map((r) => ({ ...r, free: r.build_id == null }));
        this.model.set({ ...compo, pf1: withMode(compo.pf1), pf2: withMode(compo.pf2) });
      } catch (err) {
        this.error.set(errorMessage(err));
      }
    }
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
      if (value === FREE) return { ...row, build_id: null, free: true, role: '', weapon: '' };
      const build = this.buildsById().get(Number(value));
      return build ? { ...row, build_id: build.id, free: false, role: build.role, weapon: build.name } : row;
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

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const name = this.name();
      const { pf1, pf2, ...rest } = this.model();
      const clean = (rows: Row[]): SlotRow[] => rows.map(({ free: _f, ...r }) => r);
      const body: CompoInput = { ...rest, pf1: clean(pf1), pf2: clean(pf2) };
      await firstValueFrom(
        name ? this.api.updateCompo(this.guildId(), name, { ...body, name }) : this.api.createCompo(this.guildId(), body),
      );
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
