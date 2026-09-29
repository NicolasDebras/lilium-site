import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { CompoInput, RoleInfo, SlotRow } from '../../core/models';

export type Party = 'pf1' | 'pf2';

function emptyRow(): SlotRow {
  return { role: '', count: 1, weapon: '' };
}

@Component({
  selector: 'app-compo-form',
  imports: [FormsModule, RouterLink],
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

      @for (pf of parties; track pf.key) {
        <fieldset class="party">
          <legend>{{ pf.label }} <span class="muted">— {{ total(pf.key) }} joueurs</span></legend>
          @for (row of model()[pf.key]; track $index; let i = $index) {
            <div class="slot" [attr.data-party]="pf.key">
              <select class="select" [name]="pf.key + '-role-' + i" aria-label="Rôle" [(ngModel)]="row.role">
                <option value="" disabled>Rôle…</option>
                @for (r of roles(); track r.name) {
                  <option [value]="r.name">{{ r.emoji }} {{ r.name }}</option>
                }
              </select>
              <input class="input count" type="number" min="1" max="50" aria-label="Nombre"
                     [name]="pf.key + '-count-' + i" [(ngModel)]="row.count" />
              <input class="input" placeholder="Armes conseillées (optionnel)" aria-label="Armes"
                     [name]="pf.key + '-weapon-' + i" [(ngModel)]="row.weapon" />
              <button type="button" class="btn btn-sm btn-danger" aria-label="Retirer la ligne"
                      (click)="removeRow(pf.key, i)">✕</button>
            </div>
          }
          <button type="button" class="btn btn-sm add" (click)="addRow(pf.key)">+ Ajouter un rôle</button>
        </fieldset>
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
    .party { border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; display: grid; gap: 8px; margin: 0; }
    legend { padding: 0 6px; font-weight: 600; color: var(--lilac); }
    .slot { display: grid; grid-template-columns: minmax(120px, 1fr) 80px minmax(120px, 2fr) auto; gap: 8px; align-items: center; }
    .add { justify-self: start; }
    @media (max-width: 600px) {
      .slot { grid-template-columns: 1fr 80px auto; }
      .slot input:not(.count) { grid-column: 1 / -1; grid-row: 2; }
    }
  `,
})
export class CompoForm implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly guildId = input.required<string>();
  /** Présent en édition (/compos/:name/edit), absent en création. */
  readonly name = input<string>();

  protected readonly parties: { key: Party; label: string }[] = [
    { key: 'pf1', label: 'Party 1' },
    { key: 'pf2', label: 'Party 2 (optionnelle)' },
  ];

  protected readonly model = signal<CompoInput>({
    name: '', description: '', type_acti: 'PVP', image: '', pf1: [emptyRow()], pf2: [],
  });
  protected readonly roles = signal<RoleInfo[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  async ngOnInit(): Promise<void> {
    this.api.roles(this.guildId()).subscribe({ next: (r) => this.roles.set(r), error: () => {} });
    const name = this.name();
    if (name) {
      try {
        const { total: _t, custom: _c, ...compo } = await firstValueFrom(this.api.compo(this.guildId(), name));
        this.model.set(compo);
      } catch (err) {
        this.error.set(errorMessage(err));
      }
    }
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
      const body = this.model();
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
}
