// Skip is identical to finish at v1 — close the current session and advance.
// The semantic difference (skipped vs done) is implicit: a skipped Priority's
// session has no quarter_week_focus rows written. Future M19 retrospective
// could surface this distinction; for now, closeSession + advance suffices.
export { POST } from '../finish/route';
export const runtime = 'nodejs';
