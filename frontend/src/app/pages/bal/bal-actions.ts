import { dict } from '../../core/i18n/i18n';
import { BalAction } from '../../core/models';
import { longDate } from '../../shared/charts';
import { IconName } from '../../shared/icon';

/** Icône de chaque opération du bal_log (commandes du bot) ; libellés : dictionnaire `bal.actions`. */
export const BAL_ACTIONS: Record<BalAction, IconName> = {
  finacti: 'flag',
  paybal: 'flag',
  addbal: 'plus',
  retirebal: 'coins',
  transferbal: 'swap',
};

export function balAction(name: string): { label: string; icon: IconName } {
  return { label: dict().bal.actions[name] ?? name, icon: BAL_ACTIONS[name as BalAction] ?? 'info' };
}

/** « 2026-10-07T22:17+02:00 » → « mer. 7 oct. · 22:17 » (heure de Paris fournie par l'API). */
export function opWhen(ts: string): string {
  const [date, time = ''] = ts.split('T');
  return `${longDate(date)} · ${time.slice(0, 5)}`;
}
