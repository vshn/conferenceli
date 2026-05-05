// Shared helpers for theatre event implementations.

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function el(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

export function layer(id) {
  return document.getElementById(id);
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Promise-returning anime.js wrapper. Falls back to a plain timeout when
// anime hasn't loaded yet (test harness, slow CDN), so events still resolve.
export function animate(opts) {
  const anime = window.anime;
  if (!anime) return sleep(opts.duration || 1000);
  return new Promise((resolve) => {
    anime({ ...opts, complete: () => resolve() });
  });
}

// Tween a single numeric property and call onUpdate(v) each frame.
export function tween({ from, to, duration, easing = 'linear', onUpdate, onComplete }) {
  return animate({
    targets: { v: from },
    v: to,
    duration,
    easing,
    update: (anim) => onUpdate(anim.animatables[0].target.v),
    complete: () => { if (onComplete) onComplete(); },
  });
}

// Pick a target pod index from currently-running pods. Used by pod-kill events.
export function pickRunningPodIndex(stateMod) {
  const running = [];
  for (const [idx, p] of stateMod.pods) {
    if (p.state === 'Running') running.push(idx);
  }
  if (running.length === 0) return null;
  return running[Math.floor(Math.random() * running.length)];
}

// Get on-screen viewBox-coords center of a container by index. Returns null
// if the container isn't currently rendered (deleted, terminating, etc.).
export function getContainerScenePos(index) {
  const g = document.getElementById(`pod-${index}`);
  if (!g) return null;
  const stage = document.getElementById('scene');
  if (!stage) return null;
  const rect = g.getBoundingClientRect();
  const sRect = stage.getBoundingClientRect();
  if (sRect.width === 0 || sRect.height === 0) return null;
  const sx = 1280 / sRect.width;
  const sy = 800 / sRect.height;
  return {
    x: (rect.left + rect.width / 2 - sRect.left) * sx,
    y: (rect.top + rect.height / 2 - sRect.top) * sy,
  };
}
