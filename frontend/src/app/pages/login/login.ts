import { Component, OnInit, inject, input } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  template: `
    <div class="login">
      <div class="card login-card">
        <div class="logo">❀</div>
        <h1>Lilium <span class="beta">BETA</span></h1>
        <p class="muted">Builds, compos et BAL de la guilde.</p>
        @if (error()) {
          <p class="alert">La connexion Discord a échoué ou a été annulée. Réessaie.</p>
        }
        <button type="button" class="btn btn-primary login-btn" (click)="auth.login()">
          Se connecter avec Discord
        </button>
        <p class="muted small">Seul ton pseudo et ton avatar Discord sont lus.</p>
      </div>
    </div>
  `,
  styles: `
    .login { min-height: 100vh; display: grid; place-items: center; padding: var(--gutter);
             background: radial-gradient(ellipse at 50% 0%, var(--lilac-soft), transparent 60%), var(--bg); }
    .login-card { width: 100%; max-width: 380px; text-align: center; padding: 36px 28px; }
    .logo { font-size: 2.6rem; color: var(--lilac); line-height: 1; margin-bottom: 8px; }
    h1 { color: var(--lilac); font-size: 2rem; }
    .login-btn { width: 100%; margin: 12px 0; padding: 12px; }
    .small { font-size: .8rem; margin: 0; }
  `,
})
export class LoginPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  /** ?error=1 renvoyé par l'API quand Discord refuse / l'utilisateur annule. */
  readonly error = input<string | undefined>();

  async ngOnInit(): Promise<void> {
    // Déjà connecté (retour de Discord, favori…) → directement à l'accueil.
    if (await this.auth.load().catch(() => null)) {
      await this.router.navigate(['/']);
    }
  }
}
