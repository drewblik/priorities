// Skip == Finish at v1: both close the current daily session and advance the
// queue. Saved time blocks / events / memory entries from the conversation
// stay; closing the conversation doesn't roll back tool-call writes. The
// /skip and /finish split exists for future semantics (e.g. M15 re-planning
// might want to distinguish "completed" from "skipped without input").
export { POST } from '../finish/route';
