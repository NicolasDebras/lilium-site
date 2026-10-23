import { dict, lang } from '../../core/i18n/i18n';
import { fullSilver } from '../../shared/charts';
import { BLACK_MARKET, City } from './market-logic';

/** Montant en silver arrondi (« 12 500 ») ; « – » sans valeur. */
export function silver(n: number | null | undefined): string {
  return n == null ? '–' : fullSilver(Math.round(n));
}

/** Pourcentage arrondi (« 12 % » / « 12% ») ; « – » sans valeur. */
export function percent(n: number | null | undefined): string {
  if (n == null) return '–';
  return lang() === 'en' ? `${n.toFixed(0)}%` : `${n.toFixed(0)} %`;
}

export function cityLabel(city: City): string {
  return city === BLACK_MARKET ? dict().market.blackMarket : city;
}

/** Nom d'un objet dans la langue du site (le nom FR sert si l'anglais manque). */
export function itemLabel(item: { fr: string; en: string }): string {
  return lang() === 'en' ? item.en || item.fr : item.fr;
}

/** Nom dans l'autre langue, affiché en petit sous le nom (utile pour chercher en jeu). */
export function otherLabel(item: { fr: string; en: string }): string {
  const other = lang() === 'en' ? item.fr : item.en;
  return other && other !== itemLabel(item) ? other : '';
}

/** Famille de recettes : libellé traduit, sinon le mot du jeu en minuscules (« TORNADO » → « Tornado »). */
export function familyLabel(key: string): string {
  return dict().market.families[key] ?? key.charAt(0) + key.slice(1).toLowerCase();
}

/** « 6.1 » */
export function tierText(tier: number, ench: number): string {
  return `${tier}.${ench}`;
}
