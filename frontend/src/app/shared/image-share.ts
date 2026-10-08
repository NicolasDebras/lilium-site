import { Component, inject, input } from '@angular/core';

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
        <a class="btn btn-sm" [href]="src()" [download]="fileName() + '.png'">Télécharger</a>
        <button type="button" class="btn btn-sm" (click)="copy()">Copier l'image</button>
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
  readonly src = input.required<string>();
  readonly alt = input('');
  readonly fileName = input('lilium');

  async copy(): Promise<void> {
    try {
      const blob = await (await fetch(this.src())).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this.toast.success('Image copiée : colle-la dans Discord.');
    } catch {
      this.toast.error('Ton navigateur ne permet pas de copier l’image : utilise « Télécharger ».');
    }
  }
}
