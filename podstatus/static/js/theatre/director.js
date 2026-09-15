// The Director: a wall-clock state machine that walks the harbour through the
// booth day.
//
// Seven phases (dawn -> morning -> midday -> afternoon -> golden -> dusk ->
// night) are mapped onto *booth hours*, not real time. A conference runs
// roughly 09:00-18:00, so anchoring to real time would mean dawn never happens
// and every dawn-locked animation is dead content. Compressed onto booth hours,
// doors open at dawn and teardown happens at night.
//
// The Director is a pure function of (seed, wall clock). It accumulates no
// state, so a kiosk that crashes at 14:30 reloads straight back into the right
// phase, palette and weather with no drift and no resync.

import { world } from './seed.js';
import * as state from '../state.js';
import * as effects from '../effects.js';

const bus = new EventTarget();
export const events = bus;

// --- Colour helpers ------------------------------------------------------

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]) {
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function lerp(a, b, t) { return a + (b - a) * t; }

function lerpHex(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  return rgbToHex([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]);
}

// Bounded hue rotation so each seed's harbour has its own cast without ever
// turning the water a colour water cannot be.
function shiftHue(hex, deg) {
  if (!deg) return hex;
  let [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  h = (h + deg / 360 + 1) % 1;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) return rgbToHex([l * 255, l * 255, l * 255]);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return rgbToHex([
    hue2rgb(p, q, h + 1 / 3) * 255,
    hue2rgb(p, q, h) * 255,
    hue2rgb(p, q, h - 1 / 3) * 255,
  ]);
}

// --- Phase palettes ------------------------------------------------------

// `at` is the fraction of the booth day where the phase begins. Values between
// phases are interpolated continuously, so the scene never snaps.
const PHASES = [
  {
    name: 'dawn', at: 0.00,
    skyTop: '#2b3a6b', skyMid: '#b97a78', skyBot: '#f0c49c',
    water: '#33546f', wave: ['#496f8a', '#3d637e', '#33546f'],
    hazeOp: 0.42, overlayOp: 0.46, glintOp: 0.2, reflectOp: 0.18,
    sunOp: 0.75, moonOp: 0.35, starOp: 0.25, lampOp: 0.9, beamOp: 0.35,
    shadowLen: 2.6, shadowOp: 0.18,
  },
  {
    name: 'morning', at: 0.12,
    skyTop: '#62aede', skyMid: '#bfe0f2', skyBot: '#d8ecf7',
    water: '#2f7495', wave: ['#4e90ad', '#3e819e', '#2f7495'],
    hazeOp: 0.5, overlayOp: 0.04, glintOp: 0.7, reflectOp: 0.26,
    sunOp: 1, moonOp: 0, starOp: 0, lampOp: 0, beamOp: 0,
    shadowLen: 1.6, shadowOp: 0.22,
  },
  {
    name: 'midday', at: 0.34,
    skyTop: '#4ea6e8', skyMid: '#cfe9f5', skyBot: '#b8d8e8',
    water: '#2b6e8f', wave: ['#4a8caa', '#3a7d9a', '#2b6e8f'],
    hazeOp: 0.55, overlayOp: 0, glintOp: 1, reflectOp: 0.3,
    sunOp: 1, moonOp: 0, starOp: 0, lampOp: 0, beamOp: 0,
    shadowLen: 0.5, shadowOp: 0.3,
  },
  {
    name: 'afternoon', at: 0.52,
    skyTop: '#5aa9e0', skyMid: '#d7e6ee', skyBot: '#c6dbe6',
    water: '#2f6f8c', wave: ['#4e8ea8', '#3f7f9a', '#2f6f8c'],
    hazeOp: 0.55, overlayOp: 0.02, glintOp: 0.9, reflectOp: 0.3,
    sunOp: 1, moonOp: 0, starOp: 0, lampOp: 0, beamOp: 0,
    shadowLen: 1.4, shadowOp: 0.26,
  },
  {
    name: 'golden', at: 0.70,
    skyTop: '#d9843f', skyMid: '#f6c98a', skyBot: '#f2ddb4',
    water: '#3c6d85', wave: ['#6d8a92', '#55798a', '#3c6d85'],
    hazeOp: 0.45, overlayOp: 0.1, glintOp: 1, reflectOp: 0.42,
    sunOp: 1, moonOp: 0.12, starOp: 0, lampOp: 0.25, beamOp: 0.1,
    shadowLen: 3.4, shadowOp: 0.2,
  },
  {
    name: 'dusk', at: 0.84,
    skyTop: '#262c58', skyMid: '#6d4470', skyBot: '#b05f58',
    water: '#294863', wave: ['#3c5f78', '#33546d', '#294863'],
    hazeOp: 0.4, overlayOp: 0.52, glintOp: 0.35, reflectOp: 0.3,
    sunOp: 0.25, moonOp: 0.7, starOp: 0.45, lampOp: 0.85, beamOp: 0.35,
    shadowLen: 4.0, shadowOp: 0.12,
  },
  {
    name: 'night', at: 0.94,
    skyTop: '#060b22', skyMid: '#0c1738', skyBot: '#14203f',
    water: '#17364a', wave: ['#25495d', '#1e4053', '#17364a'],
    hazeOp: 0.35, overlayOp: 1, glintOp: 0.15, reflectOp: 0.22,
    sunOp: 0, moonOp: 1, starOp: 1, lampOp: 1, beamOp: 1,
    shadowLen: 0, shadowOp: 0,
  },
];

const PHASE_NAMES = PHASES.map(p => p.name);
export { PHASE_NAMES };

// How busy each phase feels. Multiplies the event bus's timer intervals, so
// >1 means longer gaps (quieter) and <1 means shorter gaps (busier).
const PHASE_TEMPO = {
  dawn: 1.5, morning: 1.0, midday: 0.7, afternoon: 0.85,
  golden: 0.9, dusk: 1.1, night: 1.3,
};

// --- Clock ---------------------------------------------------------------

let boothOpenMin = 9 * 60;
let boothCloseMin = 18 * 60;
let fastMinutes = 0;      // ?fast=N compresses the whole day into N minutes
let startedAt = 0;

function parseClock(str, fallbackMin) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || '').trim());
  if (!m) return fallbackMin;
  const h = Math.min(23, parseInt(m[1], 10));
  const mi = Math.min(59, parseInt(m[2], 10));
  return h * 60 + mi;
}

// Fraction of the booth day elapsed, clamped to [0, 1].
function dayProgress() {
  if (fastMinutes > 0) {
    const elapsedMin = (performance.now() - startedAt) / 60000;
    return (elapsedMin / fastMinutes) % 1;
  }
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const span = boothCloseMin - boothOpenMin;
  if (span <= 0) return 0.5;
  return Math.max(0, Math.min(1, (nowMin - boothOpenMin) / span));
}

// --- Current state -------------------------------------------------------

const override = {
  phase: null,      // operator pinned a phase
  frozen: false,    // operator stopped the clock
  frozenAt: null,   // progress captured when freezing
  weather: null,    // operator forced weather ('clear' clears it)
};

let currentPhase = 'midday';
let currentProgress = 0.4;

export function phase() { return currentPhase; }
export function progress() { return currentProgress; }

// Events declaring dayOnly/nightOnly are resolved against the arc rather than
// the old binary mode, so they keep working unchanged.
export function isNightish() {
  return currentPhase === 'dusk' || currentPhase === 'night';
}

export function timerScale() {
  return PHASE_TEMPO[currentPhase] ?? 1;
}

export function describe() {
  return {
    phase: currentPhase,
    progress: Math.round(currentProgress * 1000) / 1000,
    seed: world.seed,
    name: world.name,
    frozen: override.frozen,
    pinned: override.phase,
    weather: activeWeather()?.type ?? 'clear',
  };
}

// --- Weather -------------------------------------------------------------

function activeWeather() {
  if (override.weather) {
    return override.weather === 'clear'
      ? null
      : { type: override.weather, intensity: 0.8 };
  }
  const p = currentProgress;
  for (const w of world.weather || []) {
    if (p >= w.start && p <= w.end) {
      // Ramp in and out over the first/last 15% of the window so weather
      // arrives and leaves rather than blinking on.
      const span = w.end - w.start;
      const edge = span * 0.15;
      let k = 1;
      if (p < w.start + edge) k = (p - w.start) / edge;
      else if (p > w.end - edge) k = (w.end - p) / edge;
      return { type: w.type, intensity: w.intensity * Math.max(0, Math.min(1, k)) };
    }
  }
  return null;
}

// --- Rendering -----------------------------------------------------------

function blendPalette(p) {
  let i = 0;
  while (i < PHASES.length - 1 && p >= PHASES[i + 1].at) i++;
  const a = PHASES[i];
  const b = PHASES[Math.min(PHASES.length - 1, i + 1)];
  const span = (b.at - a.at) || 1;
  const t = b === a ? 0 : Math.max(0, Math.min(1, (p - a.at) / span));

  const hue = world.paletteShift || 0;
  const mixHex = (k) => shiftHue(lerpHex(a[k], b[k], t), hue);
  const mixNum = (k) => lerp(a[k], b[k], t);

  return {
    name: a.name,
    skyTop: mixHex('skyTop'), skyMid: mixHex('skyMid'), skyBot: mixHex('skyBot'),
    water: mixHex('water'),
    wave: [0, 1, 2].map(j => shiftHue(lerpHex(a.wave[j], b.wave[j], t), hue)),
    hazeOp: mixNum('hazeOp'), overlayOp: mixNum('overlayOp'),
    glintOp: mixNum('glintOp'), reflectOp: mixNum('reflectOp'),
    sunOp: mixNum('sunOp'), moonOp: mixNum('moonOp'), starOp: mixNum('starOp'),
    lampOp: mixNum('lampOp'), beamOp: mixNum('beamOp'),
    shadowLen: mixNum('shadowLen'), shadowOp: mixNum('shadowOp'),
  };
}

// Celestial arc. The sun rides it across the booth day; the moon runs the same
// arc half a day out of step, which puts it near its apex at night and safely
// below the horizon (and at zero opacity) at noon.
function arcPos(t) {
  return {
    x: 120 + 1040 * t,
    y: 440 - 210 * Math.sin(Math.PI * Math.max(0, Math.min(1, t))),
  };
}

// Windows light up unevenly at dusk and go dark again after dawn. Each window
// carries its own threshold, so the city fills in rather than flicking on.
function windowLitFraction(p) {
  const duskRamp = Math.max(0, Math.min(1, (p - 0.68) / 0.22));
  const dawnRamp = Math.max(0, Math.min(1, (0.18 - p) / 0.16));
  return Math.max(duskRamp, dawnRamp);
}

function applyWindows(frac) {
  const group = document.getElementById('skyline-windows');
  if (!group) return;
  // Degrade with the particle quality scaler: on a struggling Pi the windows
  // stop being individually addressed and fall back to a single group opacity.
  if (effects.getQualityScale() < 0.6) {
    group.style.opacity = String(frac);
    return;
  }
  group.style.opacity = '1';
  for (const w of group.children) {
    const thresh = parseFloat(w.getAttribute('data-thresh')) || 0;
    w.style.opacity = frac > thresh ? '1' : '0';
  }
}

function applyCelestial(p, pal) {
  const s = arcPos(p);
  const m = arcPos((p + 0.5) % 1);

  const sun = document.querySelector('#layer-sky .sun');
  if (sun) {
    sun.setAttribute('cx', s.x.toFixed(1));
    sun.setAttribute('cy', s.y.toFixed(1));
  }
  const moon = document.querySelector('#layer-night-additive .moon');
  if (moon) {
    moon.setAttribute('transform', `translate(${m.x.toFixed(1)}, ${m.y.toFixed(1)})`);
  }

  // The glitter column tracks whichever body is actually lighting the scene.
  const glitter = document.getElementById('sun-glitter');
  if (glitter) {
    const lit = pal.moonOp > pal.sunOp ? m : s;
    glitter.setAttribute('transform', `translate(${lit.x.toFixed(1)}, 0)`);
  }
}

function applyPalette(pal, p) {
  const scene = document.getElementById('scene');
  if (!scene) return;
  const s = scene.style;

  s.setProperty('--sky-top', pal.skyTop);
  s.setProperty('--sky-mid', pal.skyMid);
  s.setProperty('--sky-bot', pal.skyBot);
  s.setProperty('--water-base', pal.water);
  s.setProperty('--wave-0', pal.wave[0]);
  s.setProperty('--wave-1', pal.wave[1]);
  s.setProperty('--wave-2', pal.wave[2]);
  s.setProperty('--haze-op', pal.hazeOp.toFixed(3));
  s.setProperty('--overlay-op', pal.overlayOp.toFixed(3));
  s.setProperty('--glint-op', pal.glintOp.toFixed(3));
  s.setProperty('--reflect-op', pal.reflectOp.toFixed(3));
  s.setProperty('--sun-op', pal.sunOp.toFixed(3));
  s.setProperty('--moon-op', pal.moonOp.toFixed(3));
  s.setProperty('--star-op', pal.starOp.toFixed(3));
  s.setProperty('--lamp-op', pal.lampOp.toFixed(3));
  s.setProperty('--beam-op', pal.beamOp.toFixed(3));

  // Shadows point away from the sun and stretch as it drops. The sign flips at
  // midday, which is what sells "the day is passing" without any explanation.
  const dir = p < 0.5 ? 1 : -1;
  s.setProperty('--shadow-dx', `${(dir * pal.shadowLen * 3).toFixed(1)}px`);
  s.setProperty('--shadow-dy', `${(pal.shadowLen * 1.2 + 1).toFixed(1)}px`);
  s.setProperty('--shadow-blur', `${(2 + pal.shadowLen).toFixed(1)}px`);
  s.setProperty('--shadow-op', pal.shadowOp.toFixed(3));
}

function tick() {
  let p;
  if (override.frozen && override.frozenAt !== null) {
    p = override.frozenAt;
  } else {
    p = dayProgress();
  }

  // A pinned phase parks progress at that phase's midpoint so the palette,
  // celestial arc and weather all agree with the label.
  if (override.phase) {
    const idx = PHASE_NAMES.indexOf(override.phase);
    if (idx >= 0) {
      const next = idx + 1 < PHASES.length ? PHASES[idx + 1].at : 1;
      p = (PHASES[idx].at + next) / 2;
    }
  }

  currentProgress = p;

  const pal = blendPalette(p);

  // The manual night switch always wins over the arc. An operator flipping it
  // for an evening reception must not be overruled by the clock.
  const manualNight = state.mode.value === 'night';
  const nextPhase = manualNight ? 'night' : pal.name;

  const shownPal = manualNight ? blendPalette(0.99) : pal;
  const shownP = manualNight ? 0.99 : p;
  applyPalette(shownPal, shownP);
  applyCelestial(shownP, shownPal);
  applyWindows(manualNight ? 1 : windowLitFraction(p));

  const scene = document.getElementById('scene');
  if (scene) {
    for (const n of PHASE_NAMES) scene.classList.toggle(`phase-${n}`, n === nextPhase);
    // Kept for the existing night affordances and for any event that checks it.
    scene.classList.toggle('night-mode', nextPhase === 'dusk' || nextPhase === 'night');
  }

  const w = manualNight ? null : activeWeather();
  effects.setWeather(w);

  if (nextPhase !== currentPhase) {
    const prev = currentPhase;
    currentPhase = nextPhase;
    console.log(`[director] phase ${prev} -> ${nextPhase}`);
    bus.dispatchEvent(new CustomEvent('phase:change', {
      detail: { phase: nextPhase, prev, progress: p },
    }));
  }
}

// --- Operator control ----------------------------------------------------

// Called from the event bus when a `director` payload arrives on /stream_events.
export function applyControl(data) {
  if (!data || typeof data !== 'object') return;
  if ('phase' in data) {
    override.phase = PHASE_NAMES.includes(data.phase) ? data.phase : null;
  }
  if ('frozen' in data) {
    override.frozen = !!data.frozen;
    override.frozenAt = override.frozen ? currentProgress : null;
  }
  if ('weather' in data) {
    override.weather = data.weather || null;
  }
  if (data.seed) {
    // A reroll needs a full rebuild of the generated scenery, which only
    // happens on load. Reloading is both simpler and guaranteed correct.
    const url = new URL(window.location.href);
    url.searchParams.set('seed', data.seed);
    window.location.replace(url.toString());
    return;
  }
  console.log('[director] control', describe());
  tick();
}

export function init() {
  const ds = document.body?.dataset || {};
  boothOpenMin = parseClock(ds.boothOpen, 9 * 60);
  boothCloseMin = parseClock(ds.boothClose, 18 * 60);

  const params = new URLSearchParams(window.location.search);
  const fast = parseFloat(params.get('fast'));
  if (Number.isFinite(fast) && fast > 0) {
    fastMinutes = fast;
    startedAt = performance.now();
    console.log(`[director] fast mode: full day every ${fast} min`);
  }

  // The manual night toggle must take effect immediately, not on the next tick.
  state.events.addEventListener('mode:change', () => tick());

  tick();
  setInterval(tick, 2000);
  console.log('[director] started', describe());
}
