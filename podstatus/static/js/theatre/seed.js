// Deterministic world generation for the harbour.
//
// One seed string per conference day produces one harbour: coastline, skyline,
// cloud and star layout, lighthouse placement, palette shift, weather timeline,
// event deck and name. The same seed always rebuilds the identical world, so a
// kiosk that crashes and reloads mid-conference comes back looking the same.
//
// IMPORTANT: the seed governs *world generation* only. Per-animation jitter
// (how a tugboat wanders, where debris flies) deliberately stays on
// Math.random() — a seeded tugboat would take the exact same path every single
// time, which reads as broken rather than consistent.
//
// Every seeded value is a pick from a curated range or an authored variant
// list. A seed must not be able to generate an ugly or unreadable harbour, and
// that is guaranteed by construction rather than by luck.

// --- PRNG ----------------------------------------------------------------

// FNV-1a: string -> 32-bit integer.
function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: fast, well-distributed, 32 bits of state.
export function makeRng(seedStr) {
  let a = hashSeed(String(seedStr));
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rrange(rng, min, max) {
  return min + rng() * (max - min);
}

function rint(rng, min, max) {
  return Math.floor(rrange(rng, min, max + 1));
}

function rpick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Fisher-Yates against the seeded rng, so shuffles are reproducible too.
function rshuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- Harbour names -------------------------------------------------------

const HARBOUR_NAMES = [
  'Kestrel', 'Marlow', 'Alder', 'Brackwater', 'Cinderbay', 'Dunmore',
  'Everly', 'Fathom', 'Grimsby', 'Halcyon', 'Ironwood', 'Juniper',
  'Kelvin', 'Larkspur', 'Mistral', 'Northgate', 'Orrell', 'Pellworth',
  'Quillon', 'Ravensby', 'Saltmarsh', 'Thornwick', 'Umbergate', 'Vesper',
  'Windlass', 'Yarrow', 'Zephyr', 'Ashcombe', 'Blackreef', 'Coldharbour',
];

// --- Terrain -------------------------------------------------------------

// A smooth ridge across the full stage width. Control points are jittered
// within a bounded band, so every seed yields a plausible coastline.
function ridgePath(rng, { yBase, amp, yBottom, segments }) {
  const step = 1280 / segments;
  const ys = [];
  for (let i = 0; i <= segments; i++) {
    ys.push(yBase + rrange(rng, -amp, amp));
  }
  let d = `M0,${ys[0].toFixed(1)}`;
  for (let i = 1; i <= segments; i++) {
    const x = i * step;
    const xc = x - step / 2;
    const yc = (ys[i - 1] + ys[i]) / 2 + rrange(rng, -amp * 0.4, amp * 0.4);
    d += ` Q${xc.toFixed(1)},${yc.toFixed(1)} ${x.toFixed(1)},${ys[i].toFixed(1)}`;
  }
  d += ` L1280,${yBottom} L0,${yBottom} Z`;
  return { d, ys, step };
}

// --- Skyline -------------------------------------------------------------

// A city silhouette standing on the far ridge. Buildings are kept clear of the
// lighthouse's column on the right so the two never fight for the same pixels.
function buildSkyline(rng, ridge, lighthouseX) {
  const buildings = [];
  const leftEdge = rrange(rng, 150, 260);
  const rightEdge = lighthouseX - 150;
  let x = leftEdge;

  while (x < rightEdge) {
    const w = rrange(rng, 26, 62);
    if (x + w > rightEdge) break;

    // Sample the ridge so buildings stand on the ground rather than float.
    const idx = Math.min(ridge.ys.length - 1, Math.round((x + w / 2) / ridge.step));
    const groundY = ridge.ys[idx];
    const h = rrange(rng, 42, 150);
    const topY = groundY - h;

    const roof = rpick(rng, ['flat', 'flat', 'flat', 'step', 'pitch', 'antenna']);

    // Window grid. Each window carries its own threshold so dusk lights the
    // city up unevenly instead of flicking on as one block.
    const windows = [];
    const cols = Math.max(1, Math.floor((w - 8) / 9));
    const rows = Math.max(1, Math.floor((h - 12) / 13));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        // Some windows are simply never lit — an office nobody is working in.
        if (rng() < 0.22) continue;
        windows.push({
          x: x + 5 + c * 9,
          y: topY + 8 + r * 13,
          thresh: rng(),
        });
      }
    }

    buildings.push({ x, y: topY, w, h, groundY, roof, windows });
    x += w + rrange(rng, 4, 22);
  }

  return buildings;
}

// --- Star field ----------------------------------------------------------

// Chrome boxes the stars must avoid, in stage coordinates: the VSHN logo, the
// kill counter pill and the QR card. A star behind an opaque card is a wasted
// star (and, at dusk, a visible seam).
const CHROME_BOXES = [
  // Logo plus the two-line booth identity label sitting underneath it.
  { x0: 16, y0: 48, x1: 292, y1: 192 },
  { x0: 496, y0: 56, x1: 784, y1: 114 },  // kill counter
  { x0: 1088, y0: 48, x1: 1264, y1: 244 }, // QR card
];

function inChrome(x, y) {
  return CHROME_BOXES.some(b => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
}

function buildStars(rng) {
  const stars = [];
  let guard = 0;
  while (stars.length < 16 && guard++ < 400) {
    const x = rrange(rng, 40, 1240);
    const y = rrange(rng, 56, 320);
    if (inChrome(x, y)) continue;
    // Keep them from clumping into a constellation nobody asked for.
    if (stars.some(s => Math.abs(s.x - x) < 55 && Math.abs(s.y - y) < 45)) continue;
    stars.push({ x, y, r: rrange(rng, 1, 2.2), cls: stars.length % 4 });
  }
  return stars;
}

// --- Clouds --------------------------------------------------------------

function buildClouds(rng) {
  const n = rint(rng, 3, 6);
  const clouds = [];
  for (let i = 0; i < n; i++) {
    clouds.push({
      x: rrange(rng, -100, 1280),
      y: rrange(rng, 72, 190),
      scale: rrange(rng, 0.55, 1.25),
      opacity: rrange(rng, 0.62, 0.92),
      // Slow enough to read as weather rather than traffic.
      durationS: rrange(rng, 80, 150),
      dir: rng() < 0.75 ? 1 : -1,
      puffs: rint(rng, 3, 4),
    });
  }
  return clouds;
}

// --- Weather timeline ----------------------------------------------------

// Zero to two weather windows across the booth day, expressed as fractions of
// the day so they survive any booth-hours configuration. Snow is deliberately
// rare: it is a delight at a December conference and a non-sequitur in July,
// and the seed has no calendar to tell them apart.
function buildWeather(rng) {
  const windows = [];
  const count = rpick(rng, [0, 1, 1, 1, 2]);
  let cursor = rrange(rng, 0.08, 0.3);

  let previousType = null;
  for (let i = 0; i < count; i++) {
    // Two fog banks in one day reads as a bug rather than as weather, so the
    // second window never repeats the first.
    const pool = ['rain', 'rain', 'rain', 'fog', 'fog', 'snow']
      .filter(t => t !== previousType);
    const type = rpick(rng, pool);
    previousType = type;
    const length = type === 'fog'
      ? rrange(rng, 0.08, 0.16)
      : rrange(rng, 0.1, 0.22);
    if (cursor + length > 0.96) break;
    windows.push({
      start: cursor,
      end: cursor + length,
      type,
      intensity: rrange(rng, 0.35, 1.0),
    });
    cursor += length + rrange(rng, 0.18, 0.4);
  }
  return windows;
}

// --- Event deck ----------------------------------------------------------

const CAMEO_POOL = [
  'kraken', 'ufo-abduction', 'jaws-fin', 'nessie', 'meteor', 'godzilla',
  'rubber-duck',
];

const MICRO_POOL = ['dock-worker', 'forklift', 'harbour-cat'];

// Bench part of the cameo pool and promote one survivor to headliner. This is
// what makes "I saw the kraken last year" stop being a guarantee.
function buildDeck(rng) {
  const shuffled = rshuffle(rng, CAMEO_POOL);
  const benched = shuffled.slice(0, rint(rng, 2, 3));
  const active = shuffled.slice(benched.length);
  return {
    benched,
    active,
    headliner: active[0],
  };
}

// --- World ---------------------------------------------------------------

function generate(seedStr) {
  const rng = makeRng(seedStr);

  // Drawn first so the skyline and reflections can be placed relative to it.
  const lighthouseX = rrange(rng, 1120, 1215);

  const farRidge = ridgePath(rng, { yBase: 498, amp: 26, yBottom: 560, segments: 7 });
  const nearRidge = ridgePath(rng, { yBase: 556, amp: 14, yBottom: 600, segments: 6 });

  return {
    seed: seedStr,
    rng,
    name: `Port ${rpick(rng, HARBOUR_NAMES)}`,
    lighthouseX,
    farRidge,
    nearRidge,
    skyline: buildSkyline(rng, farRidge, lighthouseX),
    clouds: buildClouds(rng),
    stars: buildStars(rng),
    // Bounded hue rotation: enough to shift the mood, never enough to make the
    // water look like something other than water.
    paletteShift: rrange(rng, -12, 12),
    weather: buildWeather(rng),
    deck: buildDeck(rng),
    micro: rshuffle(rng, MICRO_POOL).slice(0, rint(rng, 2, 3)),
    // Buoys are permanent scenery rather than events, so they get seeded spots.
    buoys: Array.from({ length: rint(rng, 1, 3) }, () => ({
      x: rrange(rng, 120, 1160),
      y: rrange(rng, 728, 752),
      color: rpick(rng, ['#d64545', '#e0a030', '#3f8f56']),
    })),
  };
}

// Resolve the seed: ?seed= wins (for previewing), otherwise the value the
// server rendered into <body data-seed>, otherwise a static fallback so the
// scene still builds when opened as a bare file.
export function resolveSeed() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('seed');
  if (fromQuery) return fromQuery;
  const fromDom = document.body?.dataset?.seed;
  if (fromDom) return fromDom;
  return 'conferenceli-default';
}

// Generated at module-evaluation time, deliberately — not from an init() that
// main.js calls on DOMContentLoaded. Event modules read `world.micro` and
// `world.rng` while they register themselves, and ES module evaluation all
// happens before any DOMContentLoaded handler runs, so a deferred init would
// hand them an empty world. Module scripts are themselves deferred, so
// document.body is already available here.
export const world = generate(resolveSeed());

console.log(`[seed] ${world.name} (seed "${world.seed}")`,
  `headliner=${world.deck.headliner}`,
  `benched=[${world.deck.benched.join(', ')}]`,
  `weather=${world.weather.map(w => w.type).join('+') || 'clear'}`);
