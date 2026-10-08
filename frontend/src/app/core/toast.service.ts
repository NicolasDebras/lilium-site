import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

/** Petites notifications en bas d'écran (« Build enregistré », « Supprimé »…), 3,5 s. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  show(text: string, kind: Toast['kind'] = 'success', duration = 3500): void {
    const toast = { id: this.nextId++, kind, text };
    this.toasts.update((list) => [...list, toast].slice(-4));
    setTimeout(() => this.dismiss(toast.id), duration);
  }

  success(text: string): void {
    this.show(text, 'success');
  }

  error(text: string): void {
    this.show(text, 'error', 6000);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
