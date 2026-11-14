import { Component, ElementRef, afterNextRender, computed, inject, input, linkedSignal, output, signal, Injector } from '@angular/core';

import { I18nService } from '../core/i18n/i18n';
import { ItemsService, itemIconUrl, normalize, useFallbackIcon } from '../core/items.service';
import { Build, FREE_CHOICE } from '../core/models';
import { roleColor, sortByRole } from './roles';

/** Valeur choisie : un id de build, ou « sans build » (ligne libre). */
export type BuildChoice = number | 'free';

/** Un build tel que le sélecteur l'affiche (icône d'arme et texte de recherche calculés une fois). */
interface PickerOption {
  build: Build;
  icon: string | null;
  color: string;
  haystack: string;
  taken: boolean;
}

/** Sélecteur de build avec recherche (sans accents), pastilles de rôle et icône de l'arme :
 *  remplace un long menu déroulant dans le formulaire de compo. Clavier : ↑ ↓ Entrée Échap. */
@Component({
  selector: 'app-build-picker',
  template: `
    <button type="button" class="trigger" [class.empty]="!selected() && value() !== 'free'"
            [attr.aria-label]="ariaLabel() + ' : ' + triggerText()" aria-haspopup="dialog" [attr.aria-expanded]="open()"
            (click)="show()">
      @if (selected(); as o) {
        @if (o.icon) { <img [src]="o.icon" alt="" width="28" height="28" (error)="fallback($event)" /> }
        <span class="trigger-name">{{ o.build.name }}</span>
        <span class="role-tag" [style.--role-color]="o.color">{{ o.build.role }}</span>
      } @else {
        <span class="trigger-name" [class.muted]="value() !== 'free'">{{ triggerText() }}</span>
      }
      <span class="caret" aria-hidden="true">▾</span>
    </button>

    @if (open()) {
      <div class="overlay" (click)="close()"></div>
      <div class="panel card" role="dialog" [attr.aria-label]="ariaLabel()" (keydown.escape)="close()">
        <div class="panel-head">
          <h3>{{ ariaLabel() }}</h3>
          <button type="button" class="btn btn-sm" (click)="close()" [attr.aria-label]="t().common.close">✕</button>
        </div>
        <input class="input search" type="search" [placeholder]="t().compos.searchBuild" [attr.aria-label]="t().compos.searchBuild"
               [value]="query()" (input)="setQuery($any($event.target).value)" (keydown)="onKey($event)" />
        @if (!lockRole() && roles().length > 1) {
          <div class="chips" role="group">
            <button type="button" class="chip" [class.on]="!roleFilter()" [attr.aria-pressed]="!roleFilter()"
                    (click)="setRole('')">{{ t().compos.allRoles }}</button>
            @for (r of roles(); track r) {
              <button type="button" class="chip" [class.on]="roleFilter() === r" [attr.aria-pressed]="roleFilter() === r"
                      [style.--role-color]="color(r)" (click)="setRole(r)">{{ r }}</button>
            }
          </div>
        }
        <ul class="options" role="listbox" [attr.aria-label]="ariaLabel()">
          @for (o of results(); track o.build.id; let i = $index) {
            <li role="option" [attr.aria-selected]="value() === o.build.id" [attr.aria-disabled]="o.taken">
              <button type="button" class="option" [class.active]="i === active()" [class.current]="value() === o.build.id"
                      [disabled]="o.taken" [title]="o.taken ? t().compos.taken : o.build.name"
                      (click)="choose(o.build.id)" (mouseenter)="active.set(i)">
                <span class="opt-icon">
                  @if (o.icon) { <img [src]="o.icon" alt="" width="36" height="36" loading="lazy" (error)="fallback($event)" /> }
                </span>
                <span class="opt-text">
                  <span class="opt-name">{{ o.build.name }}</span>
                  @if (o.taken) { <span class="faint opt-sub">{{ t().compos.taken }}</span> }
                  @else if (o.build.weapon) { <span class="faint opt-sub">{{ o.build.weapon }}</span> }
                </span>
                <span class="role-tag" [style.--role-color]="o.color">{{ o.build.role }}</span>
                <span class="badge badge-outline">{{ o.build.type_acti }}</span>
              </button>
            </li>
          } @empty {
            <li class="muted none">{{ t().compos.noBuildMatch }}</li>
          }
        </ul>
        @if (allowFree()) {
          <button type="button" class="btn btn-sm free-btn" [class.btn-primary]="value() === 'free'" (click)="choose('free')">
            {{ t().compos.noBuild }}
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .trigger { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 40px; padding: 5px 10px; text-align: left;
               border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-2); color: var(--text);
               font: inherit; cursor: pointer; transition: border-color .15s, background .15s; }
    .trigger:hover { border-color: var(--lilac-strong); }
    .trigger.empty { border-style: dashed; }
    .trigger img { flex: none; border-radius: 6px; }
    .trigger-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .caret { color: var(--text-muted); font-size: .8rem; }
    .overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, .6); z-index: 50; }
    .panel { position: fixed; z-index: 51; top: 50%; left: 50%; transform: translate(-50%, -50%);
             width: min(560px, calc(100vw - 2 * var(--gutter)));
             max-height: min(80vh, 680px); max-height: min(80dvh, 680px);
             display: flex; flex-direction: column; gap: 10px; overscroll-behavior: contain; }
    .panel > * { flex: none; }
    .panel-head { display: flex; justify-content: space-between; align-items: center; }
    .panel-head h3 { margin: 0; color: var(--lilac); font-size: 1rem; }
    .search { width: 100%; }
    .chip { padding: 3px 10px; font-size: .8rem; }
    .chip.on { background: var(--role-color, var(--gradient)); color: #fff; }
    .options { flex: 1 1 auto; overflow-y: auto; list-style: none; margin: 0; padding: 0; display: grid; gap: 4px;
               align-content: start; min-height: 120px; }
    .option { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto auto; align-items: center; gap: 10px; width: 100%;
              padding: 6px 8px; border-radius: 10px; border: 1px solid transparent; background: var(--surface-2); color: var(--text);
              font: inherit; text-align: left; cursor: pointer; }
    .option.active:not(:disabled) { border-color: var(--lilac-strong); background: var(--lilac-soft); }
    .option.current { border-color: var(--lilac); }
    .option:disabled { opacity: .45; cursor: not-allowed; }
    .opt-icon { width: 36px; height: 36px; border-radius: 8px; background: var(--surface-3); overflow: hidden; }
    .opt-text { display: grid; min-width: 0; }
    .opt-name, .opt-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .opt-name { font-weight: 600; font-size: .9rem; }
    .opt-sub { font-size: .75rem; }
    .none { padding: 12px; text-align: center; }
    .free-btn { align-self: flex-start; }
    @media (max-width: 480px) { .option { grid-template-columns: 36px minmax(0, 1fr) auto; } .option .badge { display: none; } }
  `,
})
export class BuildPicker {
  private readonly catalog = inject(ItemsService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly t = inject(I18nService).t;

  readonly builds = input.required<readonly Build[]>();
  /** Choix actuel : id de build, « free », ou null (rien de choisi). */
  readonly value = input<BuildChoice | null>(null);
  /** Builds déjà utilisés ailleurs dans la party : visibles mais grisés. */
  readonly taken = input<ReadonlySet<number>>(new Set());
  /** Rôle présélectionné à l'ouverture (celui de la ligne) ; avec `lockRole`, seuls ses builds sont proposés. */
  readonly role = input('');
  readonly lockRole = input(false);
  /** Propose « Sans build (rôle libre) ». */
  readonly allowFree = input(true);
  /** Texte du bouton quand rien n'est choisi, et titre du panneau. */
  readonly placeholder = input('');
  readonly pick = output<BuildChoice>();

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly roleFilter = linkedSignal(() => this.role());
  /** Option surlignée (clavier / souris) dans `results`. */
  protected readonly active = signal(0);

  protected readonly ariaLabel = computed(() => this.placeholder() || this.t().compos.pickBuild);

  private readonly options = computed((): PickerOption[] => {
    this.catalog.byId();   // icônes recalculées une fois le catalogue chargé
    const taken = this.taken();
    return this.builds().map((build) => {
      const main = (build.items.mainhand ?? []).find((id) => id !== FREE_CHOICE);
      const item = main ? this.catalog.get(main) : undefined;
      return {
        build,
        icon: item ? itemIconUrl(item.icon, 64) : null,
        color: roleColor(build.role),
        haystack: normalize([build.name, build.role, build.type_acti, build.weapon].join(' ')),
        taken: taken.has(build.id),
      };
    });
  });

  protected readonly selected = computed(() => {
    const v = this.value();
    return typeof v === 'number' ? this.options().find((o) => o.build.id === v) : undefined;
  });

  protected readonly triggerText = computed(() => {
    const v = this.value();
    if (v === 'free') return this.t().compos.noBuild;
    return this.selected()?.build.name ?? this.ariaLabel();
  });

  /** Rôles présents parmi les builds, dans l'ordre TANK, HEAL, DPS, SUPPORT, puis le reste. */
  protected readonly roles = computed(() => sortByRole([...new Set(this.builds().map((b) => b.role))], (r) => r));

  /** Builds filtrés : rôle (verrouillé ou pastille), puis tous les mots de la recherche ; les pris en dernier. */
  protected readonly results = computed(() => {
    const words = normalize(this.query()).split(/\s+/).filter(Boolean);
    const role = this.lockRole() ? this.role() : this.roleFilter();
    const found = this.options().filter((o) => (!role || o.build.role === role) && words.every((w) => o.haystack.includes(w)));
    return [...sortByRole(found.filter((o) => !o.taken), (o) => o.build.role), ...found.filter((o) => o.taken)];
  });

  protected color(role: string): string {
    return roleColor(role);
  }

  protected fallback(event: Event): void {
    useFallbackIcon(event);
  }

  show(): void {
    this.query.set('');
    this.roleFilter.set(this.role());
    this.active.set(0);
    this.open.set(true);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLInputElement>('.panel .search')?.focus(),
                    { injector: this.injector });
  }

  close(): void {
    this.open.set(false);
  }

  protected setQuery(text: string): void {
    this.query.set(text);
    this.active.set(0);
  }

  protected setRole(role: string): void {
    this.roleFilter.set(this.roleFilter() === role ? '' : role);
    this.active.set(0);
  }

  choose(choice: BuildChoice): void {
    if (typeof choice === 'number' && this.taken().has(choice)) return;
    this.pick.emit(choice);
    this.close();
  }

  protected onKey(event: KeyboardEvent): void {
    const count = this.results().length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (count) this.active.update((i) => (i + (event.key === 'ArrowDown' ? 1 : count - 1)) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = this.results()[this.active()];
      if (option) this.choose(option.build.id);
    }
  }
}
