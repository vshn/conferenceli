// Theatre event bus: registry, weighted-random scheduler, suppression rules,
// manual fire (from /stream_events SSE or direct call).
//
// Events register themselves with a category (ambient / signature / cameo),
// a weight, an optional cooldown override, and a `run` function that performs
// the animation. The bus owns three independent timers, one per category.

import { THEATRE_CONFIG } from './config.js';
import * as state from '../state.js';

const registry = new Map();  // name -> def
const lastFiredAt = new Map();  // name -> ms timestamp

let lastChaosAt = 0;          // any pod went Terminating
let bigEventRunning = false;  // signature or cameo currently animating

// Track our own targeted kills so we can distinguish them from external
// chaos when applying the suppression rule. Without this, a signature event
// that just killed a pod would suppress the next ambient event for 8s — the
// suppression is intended for *external* chaos (the red button), not for the
// natural fallout of a theatre event we just chose.
const ourKillTimestamps = [];  // recent ms timestamps

export function register(def) {
  if (!def?.name || !def?.category || typeof def.run !== 'function') {
    console.error('[theatre] invalid event def', def);
    return;
  }
  registry.set(def.name, {
    weight: 1,
    cooldownMs: THEATRE_CONFIG[def.category]?.defaultCooldownMs ?? 0,
    dayOnly: false,
    nightOnly: false,
    ...def,
  });
}

function jitter(min, max) {
  return min + Math.random() * (max - min);
}

function isModeAllowed(def) {
  const mode = state.mode.value;
  if (def.dayOnly && mode !== 'day') return false;
  if (def.nightOnly && mode !== 'night') return false;
  return true;
}

function isCooldownReady(def, now) {
  const last = lastFiredAt.get(def.name) ?? 0;
  return (now - last) >= def.cooldownMs;
}

function externalChaosRecent(now) {
  if ((now - lastChaosAt) >= THEATRE_CONFIG.chaosSuppressionMs) return false;
  // If we caused a kill within the suppression window, treat lastChaosAt as ours.
  return !ourKillTimestamps.some(t => Math.abs(t - lastChaosAt) < 1500);
}

function pickEvent(category, now) {
  const candidates = [];
  for (const def of registry.values()) {
    if (def.category !== category) continue;
    if (!isModeAllowed(def)) continue;
    if (!isCooldownReady(def, now)) continue;
    candidates.push(def);
  }
  if (candidates.length === 0) return null;
  const total = candidates.reduce((s, d) => s + d.weight, 0);
  let r = Math.random() * total;
  for (const def of candidates) {
    r -= def.weight;
    if (r <= 0) return def;
  }
  return candidates[candidates.length - 1];
}

async function runEvent(def) {
  const isBig = def.category === 'signature' || def.category === 'cameo';
  if (isBig) bigEventRunning = true;
  lastFiredAt.set(def.name, performance.now());
  console.log(`[theatre] firing ${def.category}/${def.name}`);
  try {
    await def.run({ killPod });
  } catch (err) {
    console.error(`[theatre] event ${def.name} threw`, err);
  } finally {
    if (isBig) bigEventRunning = false;
  }
}

// Fire a specific event by name. Bypasses cooldown (manual override) but
// still respects mode + the bigEventRunning lock.
export async function fire(name) {
  const def = registry.get(name);
  if (!def) {
    console.warn(`[theatre] unknown event: ${name}`);
    return;
  }
  if (!isModeAllowed(def)) {
    console.log(`[theatre] ${name} skipped (mode mismatch)`);
    return;
  }
  if (bigEventRunning && (def.category === 'signature' || def.category === 'cameo')) {
    console.log(`[theatre] ${name} skipped (another big event running)`);
    return;
  }
  await runEvent(def);
}

// Animation helper: kill a specific pod by visual index. Translates the index
// to the full pod name (the value of the statefulset.kubernetes.io/pod-name
// label, e.g. "http-echo-4") which is what the backend label selector matches
// — passing just "4" returns an empty pod list and 404s.
//
// Records the kill so the resulting Terminating SSE event isn't mistaken for
// external chaos by the suppression rule.
export async function killPod(index) {
  const pod = state.pods.get(index);
  if (!pod) {
    console.warn('[theatre] killPod: no pod at index', index);
    return;
  }
  ourKillTimestamps.push(performance.now());
  while (ourKillTimestamps.length > 8) ourKillTimestamps.shift();
  try {
    const r = await fetch(`/theatre/chaos/${encodeURIComponent(pod.name)}`, {
      method: 'POST',
    });
    if (!r.ok) console.warn('[theatre] kill returned', r.status, 'for', pod.name);
  } catch (err) {
    console.warn('[theatre] kill request failed', err);
  }
}

function startTimer(category) {
  const cfg = THEATRE_CONFIG[category];
  if (!cfg) return;
  const tick = async () => {
    if (!THEATRE_CONFIG.enabled) {
      setTimeout(tick, 5000);
      return;
    }
    const now = performance.now();
    const blocked =
      (category !== 'ambient' && bigEventRunning) ||
      (category !== 'ambient' && externalChaosRecent(now));
    if (!blocked) {
      const def = pickEvent(category, now);
      if (def) {
        await runEvent(def);
      }
    }
    setTimeout(tick, jitter(cfg.minMs, cfg.maxMs));
  };
  setTimeout(tick, THEATRE_CONFIG.startupDelayMs + jitter(cfg.minMs, cfg.maxMs));
}

function subscribeManualEvents() {
  const es = new EventSource('/stream_events');
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.event) fire(data.event);
    } catch (err) {
      console.error('[theatre] stream_events parse', err, e.data);
    }
  };
  es.onerror = (err) => console.warn('[theatre] stream_events error', err);
}

function subscribeChaos() {
  // Any pod going Terminating counts as "chaos happened just now" for the
  // suppression window. killPod() records our own kills so we can ignore
  // those when judging whether external chaos is blocking us.
  state.events.addEventListener('pod:terminating', () => {
    lastChaosAt = performance.now();
  });
}

export function init() {
  subscribeChaos();
  subscribeManualEvents();
  startTimer('ambient');
  startTimer('signature');
  startTimer('cameo');
  console.log('[theatre] event bus initialised');
}
