import { Component, inject, input } from '@angular/core';

import { I18nService } from '../core/i18n/i18n';
import { ToastService } from '../core/toast.service';

/** Nom de fichier sûr : « Raid AVA #2 » → « raid-ava-2 ». */
export function fileSlug(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lilium';
}

/** Image générée par l'API (build ou compo) + « Télécharger » et « Copier » (à coller dans Discord). */
@Component({
  selector: 'app-image-share',
  template: `
    <figure class="share">
      <img [src]="src()" [alt]="alt()" loading="lazy" />
      <figcaption class="row">
        <a class="btn btn-sm" [href]="src()" [download]="fileName() + '.png'">{{ t().imageShare.download }}</a>
        <button type="button" class="btn btn-sm" (click)="copy()">{{ t().imageShare.copy }}</button>
      </figcaption>
    </figure>
  `,
  styles: `
    .share { margin: 0; display: grid; gap: 10px; }
    img { width: 100%; border-radius: var(--radius-sm); background: var(--surface-2); min-height: 120px; }
    .row { gap: 8px; flex-wrap: wrap; }
  `,
})
export class ImageShare {
  private readonly toast = inject(ToastService);
  protected readonly t = inject(I18nService).t;
  readonly src = input.required<string>();
  readonly alt = input('');
  readonly fileName = input('lilium');

  async copy(): Promise<void> {
    try {
      const blob = await (await fetch(this.src())).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this.toast.success(this.t().imageShare.copied);
    } catch {
      this.toast.error(this.t().imageShare.copyFailed);
    }
  }
}
