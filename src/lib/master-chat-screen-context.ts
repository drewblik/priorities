/**
 * Screen context envelope sent with every master chat turn. The shape
 * matches TDD §617-627.
 *
 * M16 ships path-derived fields only (page, horizon, current_*_id /
 * _date). `visible_items` and `selected_item` are deferred to M17 — they
 * require each page to compute and surface its visible-items list, which
 * is more wiring for less return at this stage.
 */
export type ScreenContext = {
  page: string;
  horizon?: 'quarter' | 'week' | 'day';
  current_quarter_id?: string;
  current_week_start_date?: string;
  current_day_date?: string;
  current_priority_id?: string;
};

const FROM_PATH_DENYLIST = new Set(['/signin', '/chat']);

/** Sanitize the `from` query param. Same-origin paths only; falls back
 *  to /today (the app's default home) for anything suspicious or empty.
 *  Without this guard, an attacker-crafted absolute URL in `from` could
 *  surface external content as a back link. */
export function sanitizeFromPath(raw: string | null | undefined): string {
  if (!raw) return '/today';
  if (typeof raw !== 'string') return '/today';
  if (!raw.startsWith('/')) return '/today';
  if (raw.startsWith('//')) return '/today'; // protocol-relative
  if (FROM_PATH_DENYLIST.has(raw.split('?')[0] ?? '')) return '/today';
  return raw;
}

/**
 * Inspect a URL path and produce a populated ScreenContext.
 *
 * Path patterns recognised:
 * - `/plan/quarter/<id>`           → horizon='quarter', current_quarter_id
 * - `/plan/week/<dateISO>`         → horizon='week', current_week_start_date
 * - `/plan/day/<dateISO>`          → horizon='day', current_day_date
 * - `/priorities/<id>`             → current_priority_id (no horizon)
 * - `/priorities/<id>/...`         → current_priority_id (subpages)
 * - `/today?date=<dateISO>`        → no horizon set (Daily View ≠ planning),
 *                                     but current_day_date inferred from ?date
 *
 * All other paths return just { page }.
 */
export function parseScreenContextFromPath(path: string): ScreenContext {
  // Strip the query string for the page field; we'll re-extract specific
  // params after.
  const queryIndex = path.indexOf('?');
  const pathnameOnly = queryIndex === -1 ? path : path.slice(0, queryIndex);
  const search = queryIndex === -1 ? '' : path.slice(queryIndex + 1);
  const sp = new URLSearchParams(search);

  const ctx: ScreenContext = { page: path };

  // /plan/quarter/<id>
  const quarterMatch = pathnameOnly.match(/^\/plan\/quarter\/([^/]+)/);
  if (quarterMatch && quarterMatch[1]) {
    ctx.horizon = 'quarter';
    ctx.current_quarter_id = quarterMatch[1];
    return ctx;
  }

  // /plan/week/<dateISO>
  const weekMatch = pathnameOnly.match(/^\/plan\/week\/(\d{4}-\d{2}-\d{2})/);
  if (weekMatch && weekMatch[1]) {
    ctx.horizon = 'week';
    ctx.current_week_start_date = weekMatch[1];
    return ctx;
  }

  // /plan/day/<dateISO>
  const dayMatch = pathnameOnly.match(/^\/plan\/day\/(\d{4}-\d{2}-\d{2})/);
  if (dayMatch && dayMatch[1]) {
    ctx.horizon = 'day';
    ctx.current_day_date = dayMatch[1];
    return ctx;
  }

  // /priorities/<id>(/...) — Priority Detail or any subpage
  const priorityMatch = pathnameOnly.match(/^\/priorities\/([^/]+)/);
  if (priorityMatch && priorityMatch[1] && priorityMatch[1] !== 'new') {
    ctx.current_priority_id = priorityMatch[1];
    return ctx;
  }

  // /today?date=<dateISO> — daily VIEW (not planning). Surface the date but
  // don't set horizon (the user isn't in a planning session).
  if (pathnameOnly === '/today') {
    const date = sp.get('date');
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      ctx.current_day_date = date;
    }
    return ctx;
  }

  return ctx;
}
