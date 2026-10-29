import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withRouterConfig, withViewTransitions } from '@angular/router';

import { routes } from './app.routes';
import { languageInterceptor } from './core/language.interceptor';
import { unauthorizedInterceptor } from './core/unauthorized.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // paramsInheritanceStrategy 'always' : les pages reçoivent aussi :guildId du parent en input.
    // withViewTransitions : fondu/glissement du contenu entre les pages (styles.scss, « Transitions de pages »).
    provideRouter(
      routes,
      withComponentInputBinding(),
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
      withViewTransitions({ skipInitialTransition: true }),
    ),
    provideHttpClient(withInterceptors([languageInterceptor, unauthorizedInterceptor])),
  ],
};
