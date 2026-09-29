import { DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService, errorMessage } from '../../core/api.service';
import { Bal } from '../../core/models';

@Component({
  selector: 'app-bal',
  imports: [DecimalPipe],
  template: `
    <div class="page-head"><h1>Ma BAL</h1></div>

    @if (error()) {
      <p class="alert">{{ error() }}</p>
    } @else if (bal(); as b) {
      <div class="card stat">
        <span class="muted">{{ b.ig_name || 'Ton solde' }}</span>
        <strong class="amount">{{ b.amount | number: '1.0-0' : 'fr-FR' }}</strong>
        <span class="muted">silver</span>
      </div>
      <p class="muted">Même solde que <code>/monbal</code> sur Discord.</p>
    } @else {
      <p class="muted">Chargement…</p>
    }
  `,
  styles: `
    .stat { display: grid; gap: 4px; max-width: 360px; }
    .amount { font-size: 2.2rem; color: var(--lilac); font-weight: 700; }
    code { color: var(--lilac); }
  `,
})
export class BalPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly guildId = input.required<string>();

  protected readonly bal = signal<Bal | null>(null);
  protected readonly error = signal('');

  async ngOnInit(): Promise<void> {
    try {
      this.bal.set(await firstValueFrom(this.api.myBal(this.guildId())));
    } catch (err) {
      this.error.set(errorMessage(err));
    }
  }
}
