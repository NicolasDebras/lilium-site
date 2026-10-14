import { ActivityStats, BotErrorsPage } from '../app/core/models';

/** Jeux de données des panneaux Admin, partagés entre leurs specs et celui de la page. */
export function activityStats(over: Partial<ActivityStats['totals']> = {}): ActivityStats {
  return {
    period: '30d', days: 30, start: '2026-09-09', bucket: 'day',
    totals: { activities: 12, cancelled: 2, players: 25, avg_players: 8.5, fill_rate: 76, ...over },
    timeline: [
      { start: '2026-10-07', finacti: 2, fin: 1, 'annulée': 1 },
      { start: '2026-10-08', finacti: 3, fin: 0, 'annulée': 0 },
    ],
    heatmap: Array.from({ length: 7 }, () => Array(24).fill(0)),
    top_players: [{ name: 'Bnkiller', count: 9 }],
    top_callers: [{ name: 'Lily', count: 6 }],
    top_templates: [{ name: 'ZvZ', count: 7 }],
    missing_roles: [{ name: 'HEAL', count: 5 }],
  };
}

export function botErrorsPage(total = 30): BotErrorsPage {
  return {
    items: [
      { id: 42, ts: '2026-10-08T09:12:44+00:00', command: 'acti', user_id: '123', error_type: 'KeyError',
        error_message: "'slots'" },
      { id: 41, ts: '2026-10-07T20:00:00+00:00', command: 'finacti', user_id: null, error_type: 'TimeoutError',
        error_message: '<script>alert(1)</script>' },
    ],
    total, page: 1, page_size: 25, commands: ['acti', 'finacti'],
  };
}
