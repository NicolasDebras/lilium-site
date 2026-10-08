import { Component, OnInit, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { PublicCompo } from '../../core/models';
import { Icon, IconName } from '../../shared/icon';
import { Logo } from '../../shared/logo';

const BOT_FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'flag', title: 'Activités', text: '/acti : inscriptions par rôle, build imposé, validation par le caller, /massup avec l’image du build en MP.' },
  { icon: 'coins', title: 'BAL', text: 'Partage automatique du butin en fin d’activité, transferts, retraits, classement et alertes.' },
  { icon: 'users', title: 'Recrutement', text: 'Questionnaire de candidature, fame Albion, suivi des recrues et récap quotidien.' },
  { icon: 'sparkles', title: 'Serveur', text: 'Vocaux temporaires, rôles à la carte, messages de bienvenue, annonces des nouveautés.' },
];

const SITE_FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'sword', title: 'Builds', text: 'L’équipement de chaque rôle avec les vrais objets du jeu, image partageable.' },
  { icon: 'shield', title: 'Compos', text: 'Des compos prêtes pour /acti, leur image, copiables entre tes serveurs.' },
  { icon: 'book', title: 'Modèles', text: 'Une bibliothèque de compos partagée entre toutes les guildes.' },
  { icon: 'chart', title: 'BAL & Admin', text: 'Ton historique, les stats de la guilde, l’export CSV, les erreurs du bot.' },
];

/** Page publique : présentation du bot et du site, invitation du bot, connexion Discord. */
@Component({
  selector: 'app-landing',
  imports: [Icon, Logo, RouterLink],
  template: `
    <div class="landing">
      <div class="glow g1"></div>
      <div class="glow g2"></div>

      <section class="hero fade-up">
        <app-logo size="big" />
        <h1>Le QG de ta guilde <span class="gradient-text">Albion</span></h1>
        <p class="pitch">Un bot Discord et un site, synchronisés : activités, builds, compos et BAL au même endroit.</p>

        @if (error()) {
          <p class="alert">La connexion Discord a échoué ou a été annulée. Réessaie.</p>
        }
        <div class="cta">
          @if (inviteUrl(); as url) {
            <a class="btn btn-primary big" [href]="url" target="_blank" rel="noopener"><app-icon name="discord" [size]="20" /> Ajouter le bot à ton serveur</a>
          }
          @if (auth.me()) {
            <a class="btn big" routerLink="/"><app-icon name="users" [size]="18" /> Mes serveurs</a>
          } @else {
            <button type="button" class="btn big" (click)="auth.login()"><app-icon name="discord" [size]="18" /> Se connecter</button>
          }
        </div>
        <p class="muted small">Connexion : seuls ton pseudo et ton avatar Discord sont lus. <a routerLink="/guide">Lire le guide</a></p>
      </section>

      <section class="block">
        <h2>Ce que fait le bot</h2>
        <ul class="features">
          @for (f of botFeatures; track f.title) {
            <li class="card"><span class="feature-icon"><app-icon [name]="f.icon" [size]="20" /></span><strong>{{ f.title }}</strong><span class="muted">{{ f.text }}</span></li>
          }
        </ul>
      </section>

      <section class="block">
        <h2>Et sur le site</h2>
        <ul class="features">
          @for (f of siteFeatures; track f.title) {
            <li class="card"><span class="feature-icon"><app-icon [name]="f.icon" [size]="20" /></span><strong>{{ f.title }}</strong><span class="muted">{{ f.text }}</span></li>
          }
        </ul>
      </section>

      <section class="block">
        <h2>Démarrer en 3 étapes</h2>
        <ol class="steps">
          <li class="card"><b>1</b><span><strong>Invite le bot</strong> sur ton serveur avec le bouton ci-dessus.</span></li>
          <li class="card"><b>2</b><span><strong>/register</strong> ton pseudo Albion sur Discord (chaque membre).</span></li>
          <li class="card"><b>3</b><span><strong>/config</strong> → rôle staff du site, puis <strong>/webadmin add</strong> pour les admins. Connecte-toi !</span></li>
        </ol>
        <p class="center"><a class="btn btn-sm" routerLink="/guide">Tuto complet : lier ton serveur au site</a></p>
      </section>

      @if (models().length) {
        <section class="block">
          <h2>Derniers modèles de compos partagés</h2>
          <ul class="models">
            @for (m of models(); track m.id) {
              <li class="card"><strong>{{ m.name }}</strong>
                <span class="muted">{{ m.type_acti }} · {{ m.total }} joueurs · {{ m.imports }} import{{ m.imports > 1 ? 's' : '' }}</span></li>
            }
          </ul>
        </section>
      }
    </div>
  `,
  styles: `
    .landing { position: relative; min-height: 100vh; padding: 48px var(--gutter) 64px; overflow: hidden; display: grid; gap: 48px; justify-items: center; }
    .glow { position: absolute; border-radius: 50%; filter: blur(80px); opacity: .5; pointer-events: none; }
    .g1 { width: 480px; height: 480px; background: var(--lilac-deep); top: -140px; left: -120px; }
    .g2 { width: 420px; height: 420px; background: var(--lilac-strong); top: 200px; right: -140px; opacity: .3; }
    .hero { position: relative; max-width: 760px; display: grid; justify-items: center; text-align: center; gap: 16px; }
    h1 { font-size: clamp(1.9rem, 5vw, 3rem); font-weight: 800; letter-spacing: -.03em; margin: 8px 0 0; }
    .pitch { margin: 0; max-width: 560px; color: var(--text-muted); font-size: 1.05rem; }
    .cta { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
    .big { padding: 12px 18px; font-size: 1rem; }
    .small { font-size: .82rem; margin: 0; }
    .block { position: relative; width: 100%; max-width: 980px; display: grid; gap: 16px; }
    .block h2 { margin: 0; text-align: center; }
    .features, .steps, .models { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px;
                                 grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
    .features li { display: grid; gap: 6px; align-content: start; font-size: .88rem; }
    .feature-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; background: var(--lilac-soft); color: var(--lilac); }
    .steps li { display: flex; gap: 12px; align-items: flex-start; font-size: .9rem; }
    .steps b { display: grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: 50%; background: var(--gradient); color: var(--on-lilac); }
    .models li { display: grid; gap: 4px; font-size: .88rem; }
    .center { text-align: center; margin: 0; }
  `,
})
export class LandingPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);
  /** ?error=1 renvoyé par l'API quand Discord refuse / l'utilisateur annule. */
  readonly error = input<string | undefined>();

  protected readonly botFeatures = BOT_FEATURES;
  protected readonly siteFeatures = SITE_FEATURES;
  protected readonly inviteUrl = signal<string | null>(null);
  protected readonly models = signal<PublicCompo[]>([]);

  ngOnInit(): void {
    void this.auth.load().catch(() => null);
    this.http.get<{ invite_url: string }>('/api/public/info').subscribe({ next: (i) => this.inviteUrl.set(i.invite_url), error: () => {} });
    firstValueFrom(this.api.publicCompos(1, '', null)).then((p) => this.models.set(p.items.slice(0, 6)), () => {});
  }
}
