import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { BuildInput, RoleInfo } from '../../core/models';

function emptyBuild(): BuildInput {
  return { name: '', role: '', type_acti: 'PVP', weapon: '', notes: '', image: '' };
}

@Component({
  selector: 'app-build-form',
  imports: [FormsModule, RouterLink],
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

      <div class="field">
        <label for="weapon">Arme / stuff</label>
        <input id="weapon" name="weapon" class="input" maxlength="200" placeholder="ex : 1H Masse, casque Gardien…"
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
  `,
})
export class BuildForm implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly guildId = input.required<string>();
  /** Présent en édition (/builds/:buildId/edit), absent en création. */
  readonly buildId = input<string>();

  // Signal (et pas simple propriété) : l'app est zoneless, le rechargement
  // asynchrone du build doit notifier la vue.
  protected readonly model = signal<BuildInput>(emptyBuild());
  protected readonly roles = signal<RoleInfo[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  async ngOnInit(): Promise<void> {
    this.api.roles(this.guildId()).subscribe({ next: (r) => this.roles.set(r), error: () => {} });
    const id = this.buildId();
    if (id) {
      try {
        const { id: _id, created_by_name: _by, ...rest } = await firstValueFrom(this.api.build(this.guildId(), +id));
        this.model.set(rest);
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
