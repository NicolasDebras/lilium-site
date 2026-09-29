import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AdminOverview, Bal, Build, BuildInput, Compo, CompoInput, CompoList, RoleInfo } from './models';

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
}
