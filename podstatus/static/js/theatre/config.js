// Tunable timings for the theatre layer. All times in milliseconds.
// Booth operators can edit this file at the conference without touching logic.

export const THEATRE_CONFIG = {
  enabled: true,

  // Hard suppression after a real chaos kill (button or external) so the
  // theatre doesn't pile spectacle on top of in-flight death animations.
  chaosSuppressionMs: 8000,

  ambient: {
    minMs: 30000,
    maxMs: 60000,
    defaultCooldownMs: 180000,  // ~3 min per individual ambient event
  },

  signature: {
    minMs: 240000,  // 4 min
    maxMs: 420000,  // 7 min
    defaultCooldownMs: 720000,  // ~12 min per individual signature event
  },

  cameo: {
    minMs: 240000,  // 4 min
    maxMs: 420000,  // 7 min
    defaultCooldownMs: 900000,  // ~15 min per individual cameo event
  },

  // Initial delay before any timer fires, so the page has time to settle.
  startupDelayMs: 8000,
};
