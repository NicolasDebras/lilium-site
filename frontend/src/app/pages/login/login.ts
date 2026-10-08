import { Component, OnInit, inject, input } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { Icon, IconName } from '../../shared/icon';
import { Logo } from '../../shared/logo';

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'sword', title: 'Builds', text: "L'équipement de chaque rôle, avec les vrais objets du jeu." },
  { icon: 'users', title: 'Compos', text: 'Des compos prêtes à lancer avec /acti sur Discord.' },
  { icon: 'coins', title: 'BAL', text: 'Ton solde, tes gains et toute la BAL de la guilde.' },
];

@Component({
  selector: 'app-login',
  imports: [Icon, Logo],
  template: `
    <div class="login">
      <div class="glow g1"></div>
      <div class="glow g2"></div>

      <section class="hero fade-up">
        <app-logo size="big" />
        <h1>Le QG de ta guilde <span class="gradient-text">Albion</span></h1>
        <p class="pitch">Builds, compos et BAL réunis au même endroit, synchronisés avec le bot Discord.</p>

        <div class="card glass login-card">
          @if (error()) {
            <p class="alert">La connexion Discord a échoué ou a été annulée. Réessaie.</p>
          }
          <button type="button" class="btn btn-primary login-btn" (click)="auth.login()">
            <app-icon name="discord" [size]="20" /> Se connecter avec Discord
          </button>
          <p class="muted small">Seul ton pseudo et ton avatar Discord sont lus.</p>
        </div>

        <ul class="features">
          @for (f of features; track f.title) {
            <li>
              <span class="feature-icon"><app-icon [name]="f.icon" [size]="20" /></span>
              <strong>{{ f.title }}</strong>
              <span class="muted">{{ f.text }}</span>
            </li>
          }
        </ul>
      </section>
    </div>
  `,
  styles: `
    .login { position: relative; min-height: 100vh; display: grid; place-items: center; padding: 48px var(--gutter);
             overflow: hidden; }
    .glow { position: absolute; border-radius: 50%; filter: blur(80px); opacity: .55; pointer-events: none;
            animation: drift 14s ease-in-out infinite alternate; }
    .g1 { width: 480px; height: 480px; background: #7254bd; top: -140px; left: -120px; }
    .g2 { width: 420px; height: 420px; background: #a77bf3; bottom: -160px; right: -100px; opacity: .35; animation-delay: -6s; }
    @keyframes drift { to { transform: translate(60px, 40px) scale(1.1); } }

    .hero { position: relative; width: 100%; max-width: 760px; display: grid; justify-items: center; text-align: center; gap: 18px; }
    h1 { font-size: clamp(1.9rem, 5vw, 3rem); font-weight: 800; letter-spacing: -.03em; margin: 8px 0 0; }
    .pitch { margin: 0; max-width: 520px; color: var(--text-muted); font-size: 1.05rem; }
    .login-card { width: 100%; max-width: 400px; padding: 22px; display: grid; gap: 10px; margin-top: 8px; }
    .login-btn { width: 100%; padding: 13px; font-size: 1rem; }
    .small { font-size: .8rem; margin: 0; }

    .features { list-style: none; padding: 0; margin: 18px 0 0; width: 100%;
                display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
    .features li { display: grid; justify-items: center; gap: 6px; padding: 18px 14px; border-radius: var(--radius);
                   border: 1px solid var(--border-soft); background: rgba(21, 19, 28, .5); font-size: .88rem; }
    .feature-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px;
                    background: var(--lilac-soft); color: var(--lilac); }
  `,
})
export class LoginPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly features = FEATURES;
  /** ?error=1 renvoyé par l'API quand Discord refuse / l'utilisateur annule. */
  readonly error = input<string | undefined>();

  async ngOnInit(): Promise<void> {
    // Déjà connecté (retour de Discord, favori…) → directement à l'accueil.
    if (await this.auth.load().catch(() => null)) {
      await this.router.navigate(['/']);
    }
  }
}
