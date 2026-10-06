// Phone stand-in for config.js. The real one stays private; the extension uploads the parts
// the dashboard needs alongside your data.

const c = globalThis.tracker.data.config;

export const { COURSE_COLORS, CODE_LABELS, BASE, OUTLINES, LETTERS } = c;
