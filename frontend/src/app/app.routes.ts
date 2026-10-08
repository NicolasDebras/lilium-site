import { Routes } from '@angular/router';

import { authGuard, levelGuard } from './core/guards';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage) },
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
          },
          {
            path: 'builds/:buildId',
            loadComponent: () => import('./pages/builds/build-detail').then((m) => m.BuildDetailPage),
          },
          {
            path: 'builds/:buildId/edit',
            canActivate: [levelGuard('staff')],
            loadComponent: () => import('./pages/builds/build-form').then((m) => m.BuildForm),
          },
          { path: 'compos', loadComponent: () => import('./pages/compos/compos-list').then((m) => m.ComposList) },
          {
            path: 'compos/new',
            canActivate: [levelGuard('staff')],
            loadComponent: () => import('./pages/compos/compo-form').then((m) => m.CompoForm),
          },
          {
            path: 'compos/:name/edit',
            canActivate: [levelGuard('staff')],
            loadComponent: () => import('./pages/compos/compo-form').then((m) => m.CompoForm),
          },
          { path: 'bal', loadComponent: () => import('./pages/bal/bal').then((m) => m.BalPage) },
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
