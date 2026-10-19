/** Setup global des tests (Vitest + jsdom).
 *  jsdom n'implémente pas le défilement : on le remplace par des no-op, sinon chaque appel
 *  affiche « Not implemented: Window's scrollTo() method » dans la sortie des tests. */
import { beforeEach } from 'vitest';

import { setLang } from '../app/core/i18n/i18n';

window.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};

// jsdom annonce navigator.language = en-US : les specs vérifient les textes français (langue source),
// sauf celles qui basculent explicitement en anglais.
beforeEach(() => setLang('fr'));
