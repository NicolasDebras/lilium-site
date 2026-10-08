import { BalAction } from '../../core/models';
import { longDate } from '../../shared/charts';
import { IconName } from '../../shared/icon';

/** Libellé et icône de chaque opération du bal_log (commandes du bot). */
export const BAL_ACTIONS: Record<BalAction, { label: string; icon: IconName }> = {
  finacti: { label: "Fin d'activité", icon: 'flag' },
  paybal: { label: 'Paiement BAL', icon: 'flag' },
  addbal: { label: 'Ajout', icon: 'plus' },
  retirebal: { label: 'Retrait (payé)', icon: 'coins' },
  transferbal: { label: 'Transfert', icon: 'swap' },
};

export function balAction(name: string): { label: string; icon: IconName } {
  return BAL_ACTIONS[name as BalAction] ?? { label: name, icon: 'info' };
}

/** « 2026-10-07T22:17+02:00 » → « mer. 7 oct. · 22:17 » (heure de Paris fournie par l'API). */
export function opWhen(ts: string): string {
  const [date, time = ''] = ts.split('T');
  return `${longDate(date)} · ${time.slice(0, 5)}`;
}
