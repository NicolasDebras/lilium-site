import { httpResource } from '@angular/common/http';
import { Injectable, computed } from '@angular/core';

/** Infos publiques du site (/api/public/info), chargées une seule fois pour toute l'appli. */
@Injectable({ providedIn: 'root' })
export class PublicInfoService {
  private readonly info = httpResource<{ invite_url: string }>(() => '/api/public/info');

  /** Lien d'invitation du bot ; null tant qu'il n'est pas chargé (ou si l'API ne répond pas). */
  readonly inviteUrl = computed(() => (this.info.hasValue() ? this.info.value().invite_url : null));
}
