import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n/i18n';
import { PublicInfoService } from '../../core/public-info.service';
import { Icon, IconName } from '../../shared/icon';
import { LangSwitch } from '../../shared/lang-switch';
import { Logo } from '../../shared/logo';

/** Icônes des cartes, dans l'ordre des textes `landing.botFeatures` / `landing.siteFeatures`. */
const BOT_ICONS: IconName[] = ['flag', 'coins', 'users', 'sparkles'];
const SITE_ICONS: IconName[] = ['sword', 'shield', 'book', 'chart'];

/** Page publique : présentation du bot et du site, invitation du bot, connexion Discord. */
@Component({
  selector: 'app-landing',
  imports: [Icon, LangSwitch, Logo, RouterLink],
  template: `
    <div class="landing">
      <div class="glow g1"></div>
      <div class="glow g2"></div>

      <app-lang-switch class="lang" />
      <section class="hero fade-up">
        <app-logo size="big" />
        <h1>{{ t().landing.title[0] }}<span class="gradient-text">Albion</span>{{ t().landing.title[1] }}</h1>
        <p class="pitch">{{ t().landing.pitch }}</p>

        @if (error()) {
          <p class="alert">{{ t().landing.loginFailed }}</p>
        }
        <div class="cta">
          @if (inviteUrl(); as url) {
            <a class="btn btn-primary big" [href]="url" target="_blank" rel="noopener"><app-icon name="discord" [size]="20" /> {{ t().landing.addBot }}</a>
          }
          @if (auth.me()) {
            <a class="btn big" routerLink="/"><app-icon name="users" [size]="18" /> {{ t().landing.myServers }}</a>
          } @else {
            <button type="button" class="btn big" (click)="auth.login()"><app-icon name="discord" [size]="18" /> {{ t().landing.login }}</button>
          }
        </div>
        <p class="muted small">{{ t().landing.privacy }} <a routerLink="/guide">{{ t().landing.readGuide }}</a></p>
      </section>

      <section class="block">
        <h2>{{ t().landing.botTitle }}</h2>
        <ul class="features">
          @for (f of t().landing.botFeatures; track $index) {
            <li class="card"><span class="feature-icon"><app-icon [name]="botIcons[$index]" [size]="20" /></span><strong>{{ f.title }}</strong><span class="muted">{{ f.text }}</span></li>
          }
        </ul>
      </section>

      <section class="block">
        <h2>{{ t().landing.siteTitle }}</h2>
        <ul class="features">
          @for (f of t().landing.siteFeatures; track $index) {
            <li class="card"><span class="feature-icon"><app-icon [name]="siteIcons[$index]" [size]="20" /></span><strong>{{ f.title }}</strong><span class="muted">{{ f.text }}</span></li>
          }
        </ul>
      </section>

      <section class="block">
        <h2>{{ t().landing.stepsTitle }}</h2>
        <ol class="steps">
          <li class="card"><b>1</b><span><strong>{{ t().landing.step1[0] }}</strong>{{ t().landing.step1[1] }}</span></li>
          <li class="card"><b>2</b><span><strong>/register</strong>{{ t().landing.step2 }}</span></li>
          <li class="card"><b>3</b><span><strong>/config</strong>{{ t().landing.step3[0] }}<strong>/webadmin add</strong>{{ t().landing.step3[1] }}</span></li>
        </ol>
        <p class="center"><a class="btn btn-sm" routerLink="/guide">{{ t().landing.fullTuto }}</a></p>
      </section>

      @if (models().length) {
        <section class="block">
          <h2>{{ t().landing.modelsTitle }}</h2>
          <ul class="models">
            @for (m of models(); track m.id) {
              <li class="card"><strong>{{ m.name }}</strong>
                <span class="muted">{{ m.type_acti }} · {{ t().common.players(m.total) }} · {{ t().common.imports(m.imports) }}</span></li>
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
    .lang { position: absolute; top: 16px; right: var(--gutter); z-index: 1; }
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
export class LandingPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  protected readonly inviteUrl = inject(PublicInfoService).inviteUrl;
  /** ?error=1 renvoyé par l'API quand Discord refuse / l'utilisateur annule. */
  readonly error = input<string | undefined>();

  protected readonly t = inject(I18nService).t;
  protected readonly botIcons = BOT_ICONS;
  protected readonly siteIcons = SITE_ICONS;
  /** Aperçu de la bibliothèque : 6 premiers modèles publics (rien si l'API ne répond pas). */
  private readonly publicCompos = rxResource({ stream: () => this.api.publicCompos(1, '', null) });
  protected readonly models = computed(() => (this.publicCompos.hasValue() ? this.publicCompos.value().items.slice(0, 6) : []));

  constructor() {
    void this.auth.load().catch(() => null);
  }
}
