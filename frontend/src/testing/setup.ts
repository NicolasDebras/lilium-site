/** Setup global des tests (Vitest + jsdom).
 *  jsdom n'implémente pas le défilement : on le remplace par des no-op, sinon chaque appel
 *  affiche « Not implemented: Window's scrollTo() method » dans la sortie des tests. */
window.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};
