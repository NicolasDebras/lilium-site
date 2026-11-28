import { Routes } from '@angular/router';

import { authGuard, levelGuard } from './core/guards';
import { unsavedChangesGuard } from './core/unsaved-changes';

export const routes: Routes = [
  { path: 'accueil', loadComponent: () => import('./pages/landing/landing').then((m) => m.LandingPage) },
  { path: 'guide', loadComponent: () => import('./pages/guide/guide').then((m) => m.GuidePage) },
  { path: 'login', redirectTo: 'accueil' },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/guilds/guilds').then((m) => m.GuildsPage) },
      {
        path: 'g/:guildId',
        canActivate: [levelGuard('member')],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'builds' },
          { path: 'builds', loadComponent: () => import('./pages/builds/builds-list').then((m) => m.BuildsList) },
          {
            path: 'builds/new',
            canActivate: [levelGuard('staff')],
            loadComponent: () => import('./pages/builds/build-form').then((m) => m.BuildForm),
            canDeactivate: [unsavedChangesGuard],
          },
          {
            path: 'builds/:buildId',
            loadComponent: () => import('./pages/builds/build-detail').then((m) => m.BuildDetailPage),
          },
          {
            path: 'builds/:buildId/edit',
            canActivate: [levelGuard('staff')],
            loadComponent: () => import('./pages/builds/build-form').then((m) => m.BuildForm),
            canDeactivate: [unsavedChangesGuard],
          },
          { path: 'compos', loadComponent: () => import('./pages/compos/compos-list').then((m) => m.ComposList) },
          {
            path: 'compos/new',
            canActivate: [levelGuard('staff')],
            loadComponent: () => import('./pages/compos/compo-form').then((m) => m.CompoForm),
            canDeactivate: [unsavedChangesGuard],
          },
          {
            path: 'compos/:name/edit',
            canActivate: [levelGuard('staff')],
            loadComponent: () => import('./pages/compos/compo-form').then((m) => m.CompoForm),
            canDeactivate: [unsavedChangesGuard],
          },
          { path: 'modeles', loadComponent: () => import('./pages/library/library').then((m) => m.LibraryPage) },
          { path: 'bal', loadComponent: () => import('./pages/bal/bal').then((m) => m.BalPage) },
          { path: 'marche', loadComponent: () => import('./pages/market/market').then((m) => m.MarketPage) },
          {
            path: 'admin',
            canActivate: [levelGuard('admin')],
            loadComponent: () => import('./pages/admin/admin').then((m) => m.AdminPage),
          },
        ],
      },
    ],
  },
  { path: '**', loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFoundPage) },
];
