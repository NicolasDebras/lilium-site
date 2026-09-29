import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';
import { appConfig } from './app/app.config';

// Séparateur de milliers français (1 500 000) pour les montants BAL.
registerLocaleData(localeFr);

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
