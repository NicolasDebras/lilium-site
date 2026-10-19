import { HttpInterceptorFn } from '@angular/common/http';

import { lang } from './i18n/i18n';

/** Langue du site envoyée à l'API (messages d'erreur traduits). */
export const languageInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.url.startsWith('/api') ? req.clone({ setHeaders: { 'Accept-Language': lang() } }) : req);
