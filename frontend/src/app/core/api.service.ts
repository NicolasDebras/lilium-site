import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  ActivityStats, AdminOverview, Bal, BalAction, BalOperationsPage, BalPeriod, BalPlayer, BalStats, BotErrorDetail, BotErrorsPage, Build, BuildDetail, BuildInput,
  Compo, CompoInput, CompoList, MyBalHistory, PublicComposPage, RoleInfo,
} from './models';

/** Message lisible à partir d'une erreur HTTP de l'API (champ "detail" de FastAPI). */
export function errorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const detail = err.error?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return 'Formulaire invalide : vérifie les champs obligatoires.';
    if (err.status === 0) return "L'API ne répond pas (est-elle lancée ?).";
  }
  return 'Une erreur est survenue.';
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  private g(guildId: string): string {
    return `/api/guilds/${guildId}`;
  }

  // ── Builds ────────────────────────────────────────────────────────────────
  builds(guildId: string, filters: { role?: string; type_acti?: string } = {}): Observable<Build[]> {
    let params = new HttpParams();
    if (filters.role) params = params.set('role', filters.role);
    if (filters.type_acti) params = params.set('type_acti', filters.type_acti);
    return this.http.get<Build[]>(`${this.g(guildId)}/builds`, { params });
  }

  build(guildId: string, id: number): Observable<Build> {
    return this.http.get<Build>(`${this.g(guildId)}/builds/${id}`);
  }

  buildDetail(guildId: string, id: number): Observable<BuildDetail> {
    return this.http.get<BuildDetail>(`${this.g(guildId)}/builds/${id}`);
  }

  /** Image PNG du build (cookie de session, même domaine) : utilisable directement en <img src>. */
  buildImageUrl(guildId: string, id: number): string {
    return `${this.g(guildId)}/builds/${id}/image.png`;
  }

  duplicateBuild(guildId: string, id: number): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.g(guildId)}/builds/${id}/duplicate`, {});
  }

  createBuild(guildId: string, body: BuildInput): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.g(guildId)}/builds`, body);
  }

  updateBuild(guildId: string, id: number, body: BuildInput): Observable<{ id: number }> {
    return this.http.put<{ id: number }>(`${this.g(guildId)}/builds/${id}`, body);
  }

  deleteBuild(guildId: string, id: number): Observable<void> {
    return this.http.delete<void>(`${this.g(guildId)}/builds/${id}`);
  }

  // ── Compos ────────────────────────────────────────────────────────────────
  compos(guildId: string): Observable<CompoList> {
    return this.http.get<CompoList>(`${this.g(guildId)}/compos`);
  }

  compo(guildId: string, name: string): Observable<Compo> {
    return this.http.get<Compo>(`${this.g(guildId)}/compos/${encodeURIComponent(name)}`);
  }

  /** Image PNG de la compo (comme sous /acti), utilisable directement en <img src>. */
  compoImageUrl(guildId: string, name: string): string {
    return `${this.g(guildId)}/compos/${encodeURIComponent(name)}/image.png`;
  }

  /** Aperçu de l'image d'une compo en cours d'édition (rien n'est enregistré). */
  previewCompoImage(guildId: string, body: CompoInput): Observable<Blob> {
    return this.http.post(`${this.g(guildId)}/compos/preview-image`, body, { responseType: 'blob' });
  }

  createCompo(guildId: string, body: CompoInput): Observable<{ name: string }> {
    return this.http.post<{ name: string }>(`${this.g(guildId)}/compos`, body);
  }

  updateCompo(guildId: string, name: string, body: CompoInput): Observable<{ name: string }> {
    return this.http.put<{ name: string }>(`${this.g(guildId)}/compos/${encodeURIComponent(name)}`, body);
  }

  deleteCompo(guildId: string, name: string): Observable<void> {
    return this.http.delete<void>(`${this.g(guildId)}/compos/${encodeURIComponent(name)}`);
  }

  // ── Divers ────────────────────────────────────────────────────────────────
  roles(guildId: string): Observable<RoleInfo[]> {
    return this.http.get<RoleInfo[]>(`${this.g(guildId)}/roles`);
  }

  myBal(guildId: string): Observable<Bal> {
    return this.http.get<Bal>(`${this.g(guildId)}/bal/me`);
  }

  adminOverview(guildId: string): Observable<AdminOverview> {
    return this.http.get<AdminOverview>(`${this.g(guildId)}/admin/overview`);
  }

  adminBal(guildId: string, period: BalPeriod): Observable<BalStats> {
    return this.http.get<BalStats>(`${this.g(guildId)}/admin/bal`, { params: { period } });
  }

  myBalHistory(guildId: string, period: BalPeriod): Observable<MyBalHistory> {
    return this.http.get<MyBalHistory>(`${this.g(guildId)}/bal/me/history`, { params: { period } });
  }

  myBalOperations(guildId: string, page: number, action: BalAction | null): Observable<BalOperationsPage> {
    let params = new HttpParams().set('page', page);
    if (action) params = params.set('action', action);
    return this.http.get<BalOperationsPage>(`${this.g(guildId)}/bal/me/operations`, { params });
  }

  /** Lien de téléchargement direct (cookie de session, même domaine) de l'export CSV. */
  myBalCsvUrl(guildId: string, action: BalAction | null): string {
    const query = action ? `?action=${encodeURIComponent(action)}` : '';
    return `${this.g(guildId)}/bal/me/operations.csv${query}`;
  }

  // ── Bibliothèque de compos ───────────────────────────────────────────────
  copyCompo(guildId: string, sourceGuildId: string, name: string, newName?: string): Observable<{ name: string }> {
    return this.http.post<{ name: string }>(`${this.g(guildId)}/compos/import`,
      { source_guild_id: Number(sourceGuildId), name, new_name: newName || null });
  }

  publishCompo(guildId: string, name: string): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.g(guildId)}/compos/${encodeURIComponent(name)}/publish`, {});
  }

  publicCompos(page: number, q: string, typeActi: string | null): Observable<PublicComposPage> {
    let params = new HttpParams().set('page', page).set('q', q);
    if (typeActi) params = params.set('type_acti', typeActi);
    return this.http.get<PublicComposPage>('/api/public/compos', { params });
  }

  publicCompoImageUrl(id: number): string {
    return `/api/public/compos/${id}/image.png`;
  }

  importPublicCompo(guildId: string, publicId: number, newName?: string): Observable<{ name: string }> {
    return this.http.post<{ name: string }>(`${this.g(guildId)}/compos/import-public`,
      { public_id: publicId, new_name: newName || null });
  }

  deletePublicCompo(id: number): Observable<void> {
    return this.http.delete<void>(`/api/public/compos/${id}`);
  }

  adminActivity(guildId: string, period: BalPeriod): Observable<ActivityStats> {
    return this.http.get<ActivityStats>(`${this.g(guildId)}/admin/activity`, { params: { period } });
  }

  // ── Admin : BAL par joueur ────────────────────────────────────────────────
  balPlayers(guildId: string, q: string): Observable<BalPlayer[]> {
    return this.http.get<BalPlayer[]>(`${this.g(guildId)}/admin/bal/players`, { params: { q } });
  }

  playerBalOperations(guildId: string, uid: string, page: number, action: BalAction | null): Observable<BalOperationsPage> {
    let params = new HttpParams().set('page', page);
    if (action) params = params.set('action', action);
    return this.http.get<BalOperationsPage>(`${this.g(guildId)}/admin/bal/players/${uid}/operations`, { params });
  }

  playerBalCsvUrl(guildId: string, uid: string, action: BalAction | null): string {
    const query = action ? `?action=${encodeURIComponent(action)}` : '';
    return `${this.g(guildId)}/admin/bal/players/${uid}/operations.csv${query}`;
  }

  guildBalCsvUrl(guildId: string, period: BalPeriod): string {
    return `${this.g(guildId)}/admin/bal/operations.csv?period=${period}`;
  }

  // ── Admin : erreurs du bot ────────────────────────────────────────────────
  botErrors(guildId: string, page: number, command: string | null): Observable<BotErrorsPage> {
    let params = new HttpParams().set('page', page);
    if (command) params = params.set('command', command);
    return this.http.get<BotErrorsPage>(`${this.g(guildId)}/admin/errors`, { params });
  }

  botError(guildId: string, id: number): Observable<BotErrorDetail> {
    return this.http.get<BotErrorDetail>(`${this.g(guildId)}/admin/errors/${id}`);
  }
}
