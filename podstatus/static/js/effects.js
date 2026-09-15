// Canvas particle pool + RAF loop for explosions, smoke, splashes.

const MAX_PARTICLES = 600;
// Emitters all work in 1280x800 stage coordinates. The canvas backing store is
// sized to the on-screen pixel count instead and the scale is baked into the
// context transform, so particles stay sharp when the stage is scaled up.
const WORLD_W = 1280;
const WORLD_H = 800;
let pool = [];
let active = [];
let canvas, ctx;
let brightCanvas, brightCtx;  // separate canvas above night-overlay for flashes
let lastT = 0;
let recurringEmitters = [];

// --- Weather -------------------------------------------------------------
// Rain and snow get their own pool. Sharing the main pool would let a downpour
// starve the explosion particles, which are the thing people actually came to
// see — a chaos kill during a storm has to look like a chaos kill.
const MAX_WEATHER = 260;
const weatherParts = [];
const weather = { type: null, intensity: 0 };

// Stage px/s, positive blows right. Smoke, rain and snow all read it, so a
// gusty day bends the smokestack plumes the same way it slants the rain.
let wind = 8;
let windTarget = 8;
let windPhase = 0;

export function getWind() { return wind; }

export function getWeather() { return { ...weather }; }

// Driven by the Director. `null` means clear.
export function setWeather(w) {
  const type = w?.type ?? null;
  const intensity = Math.max(0, Math.min(1, w?.intensity ?? 0));
  weather.type = intensity > 0.01 ? type : null;
  weather.intensity = weather.type ? intensity : 0;

  if (weather.type === 'rain') windTarget = 40 + 70 * intensity;
  else if (weather.type === 'snow') windTarget = 12 + 20 * intensity;
  else if (weather.type === 'fog') windTarget = 4;
  else windTarget = 8;

  // Fog is a flat veil rather than particles: thousands of slow alpha circles
  // is the single most expensive thing this scene could do on a Pi, and it
  // looks worse than a gradient.
  const scene = document.getElementById('scene');
  if (scene) {
    scene.style.setProperty('--fog-op',
      weather.type === 'fog' ? (0.62 * intensity).toFixed(3) : '0');
  }
}

function makeRainDrop() {
  return {
    type: 'rain',
    x: -120 + Math.random() * 1520,
    y: -30 - Math.random() * 120,
    vy: 900 + Math.random() * 420,
    len: 9 + Math.random() * 11,
    alpha: 0.22 + Math.random() * 0.3,
  };
}

function makeSnowFlake() {
  return {
    type: 'snow',
    x: -80 + Math.random() * 1440,
    y: -20 - Math.random() * 120,
    vy: 26 + Math.random() * 46,
    size: 1.1 + Math.random() * 2.2,
    sway: Math.random() * Math.PI * 2,
    swaySpeed: 0.6 + Math.random() * 1.1,
    alpha: 0.5 + Math.random() * 0.45,
  };
}

function spawnWeather(dt) {
  if (!weather.type || weather.type === 'fog' || weather.intensity <= 0) return;
  const rate = weather.type === 'rain' ? 430 : 85;
  const want = rate * weather.intensity * qualityScale * dt;
  let n = Math.floor(want);
  if (Math.random() < want - n) n++;
  const cap = Math.round(MAX_WEATHER * qualityScale);
  for (let i = 0; i < n && weatherParts.length < cap; i++) {
    weatherParts.push(weather.type === 'rain' ? makeRainDrop() : makeSnowFlake());
  }
}

function stepWeather(dt) {
  for (let i = weatherParts.length - 1; i >= 0; i--) {
    const p = weatherParts[i];
    p.y += p.vy * dt;
    if (p.type === 'rain') {
      p.x += wind * dt * 1.8;
      // Rain stops at the waterline rather than falling through the harbour.
      if (p.y > 745) { weatherParts.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(190,215,235,${p.alpha})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - wind * 0.02, p.y + p.len);
      ctx.stroke();
    } else {
      p.sway += p.swaySpeed * dt;
      p.x += (wind * 0.5 + Math.sin(p.sway) * 14) * dt;
      if (p.y > 752) { weatherParts.splice(i, 1); continue; }
      ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    // A drop that has blown clean off the stage is never coming back.
    if (p.x < -200 || p.x > 1480) weatherParts.splice(i, 1);
  }
}

// FPS-aware quality scaling for auto-degrade (Task 26).
let fpsAvg = 60;
let qualityScale = 1.0;
export function getQualityScale() { return qualityScale; }

function makeParticle() {
  return {
    alive: false, type: 'smoke',
    x: 0, y: 0, vx: 0, vy: 0,
    age: 0, life: 1,
    size: 4, color: '128,128,128',
    rotation: 0, vr: 0,
    gravity: 0,
  };
}

function getParticle() {
  for (const p of pool) if (!p.alive) return p;
  if (pool.length < MAX_PARTICLES) {
    const p = makeParticle();
    pool.push(p);
    return p;
  }
  return null;
}

function scaledCount(c) {
  return Math.max(1, Math.round(c * qualityScale));
}

export function emitSmokeWisp(x, y, size = 8, dark = false) {
  const p = getParticle();
  if (!p) return;
  Object.assign(p, {
    alive: true, type: 'smoke',
    x: x + (Math.random() - 0.5) * 4,
    y,
    vx: -8 + Math.random() * 4,
    vy: -18 - Math.random() * 6,
    age: 0, life: 2.0 + Math.random() * 0.6,
    size: size + Math.random() * 4,
    color: dark ? '20,20,20' : '128,128,128',
    rotation: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.6,
    gravity: 0,
  });
  active.push(p);
}

export function emitFlash(x, y, size = 28) {
  const p = getParticle(); if (!p) return;
  Object.assign(p, {
    alive: true, type: 'flash',
    x, y, vx: 0, vy: 0,
    age: 0, life: 0.45,
    size,
    color: '255,210,80',
    rotation: 0, vr: 0, gravity: 0,
  });
  active.push(p);
}

export function emitDebris(x, y, color = '255,255,255', count = 30) {
  const n = scaledCount(count);
  for (let i = 0; i < n; i++) {
    const p = getParticle(); if (!p) return;
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 200;
    Object.assign(p, {
      alive: true, type: 'debris',
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 80,
      age: 0, life: 1.4 + Math.random() * 0.8,
      size: 3 + Math.random() * 4,
      color,
      rotation: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 8,
      gravity: 380,
    });
    active.push(p);
  }
}

export function emitEmbers(x, y, count = 12) {
  const n = scaledCount(count);
  for (let i = 0; i < n; i++) {
    const p = getParticle(); if (!p) return;
    Object.assign(p, {
      alive: true, type: 'ember',
      x: x + (Math.random() - 0.5) * 16,
      y: y + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 30,
      vy: -40 - Math.random() * 50,
      age: 0, life: 1.6 + Math.random() * 0.8,
      size: 2 + Math.random() * 2,
      color: '255,160,50',
      rotation: 0, vr: 0,
      gravity: 30,
    });
    active.push(p);
  }
}

export function emitSplash(x, y, count = 18) {
  const n = scaledCount(count);
  for (let i = 0; i < n; i++) {
    const p = getParticle(); if (!p) return;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.7;
    const speed = 40 + Math.random() * 80;
    Object.assign(p, {
      alive: true, type: 'splash',
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      age: 0, life: 0.8 + Math.random() * 0.4,
      size: 2 + Math.random() * 2,
      color: '230,245,255',
      rotation: 0, vr: 0,
      gravity: 320,
    });
    active.push(p);
  }
}

export function emitSmokeBurst(x, y, count = 12) {
  const n = scaledCount(count);
  for (let i = 0; i < n; i++) {
    const p = getParticle(); if (!p) return;
    Object.assign(p, {
      alive: true, type: 'smoke',
      x: x + (Math.random() - 0.5) * 24,
      y: y + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 18 - 6,
      vy: -40 - Math.random() * 25,
      age: 0, life: 2.4 + Math.random() * 0.8,
      size: 8 + Math.random() * 6,
      color: '60,60,60',
      rotation: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.6,
      gravity: -8,
    });
    active.push(p);
  }
}

export function addRecurringEmitter(fn) {
  recurringEmitters.push(fn);
}

function updateQuality(dt) {
  const fps = 1 / Math.max(dt, 0.001);
  fpsAvg = fpsAvg * 0.95 + fps * 0.05;
  if (fpsAvg < 25 && qualityScale > 0.4) qualityScale -= 0.05;
  else if (fpsAvg > 45 && qualityScale < 1.0) qualityScale += 0.02;
  qualityScale = Math.max(0.4, Math.min(1.0, qualityScale));
}

function step(dt) {
  updateQuality(dt);

  // Wind eases toward its target and breathes, so gusts feel weathery rather
  // than like a value someone typed in.
  windPhase += dt * 0.35;
  wind += (windTarget - wind) * Math.min(1, dt * 0.6);
  const gust = wind * (1 + Math.sin(windPhase) * 0.22);

  recurringEmitters.forEach(fn => fn(dt));

  ctx.clearRect(0, 0, WORLD_W, WORLD_H);
  brightCtx.clearRect(0, 0, WORLD_W, WORLD_H);
  for (let i = active.length - 1; i >= 0; i--) {
    const p = active[i];
    p.age += dt;
    if (p.age >= p.life) {
      p.alive = false;
      active.splice(i, 1);
      continue;
    }
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    // Only the light, drifting types are pushed around by the wind. Debris is
    // heavy enough that wind-blown shrapnel would look wrong.
    if (p.type === 'smoke' || p.type === 'ember') p.x += gust * dt * 0.4;
    p.y += p.vy * dt;
    p.rotation += p.vr * dt;
    drawParticle(p);
  }

  spawnWeather(dt);
  stepWeather(dt);
}

function drawParticle(p) {
  const t = p.age / p.life;
  // Flash renders to the "bright" canvas which sits above the night-mode
  // overlay so explosions actually punch through the dusk dimming.
  const c = (p.type === 'flash') ? brightCtx : ctx;
  switch (p.type) {
    case 'smoke': {
      const r = p.size * (1 + t * 3);
      const a = (1 - t) * 0.65;
      c.beginPath();
      c.fillStyle = `rgba(${p.color},${a})`;
      c.arc(p.x, p.y, r, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'flash': {
      // Tighter expansion (3.5x vs 7x) keeps per-pixel intensity high so the
      // fireball reads big instead of fading into a thin haze.
      const r = p.size * (0.9 + t * 2.6);
      // Hold-then-fade opacity: stays near full brightness for the first
      // ~40% of life, then quickly drops. Much punchier than linear.
      const a = (1 - t * t) * 0.95;
      const prevOp = c.globalCompositeOperation;
      c.globalCompositeOperation = 'lighter';  // additive — makes it FLASH
      const grd = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grd.addColorStop(0,    `rgba(255,255,220,${a})`);
      grd.addColorStop(0.35, `rgba(255,210,90,${a * 0.85})`);
      grd.addColorStop(0.7,  `rgba(255,120,30,${a * 0.45})`);
      grd.addColorStop(1,    `rgba(180,40,10,0)`);
      c.fillStyle = grd;
      c.beginPath();
      c.arc(p.x, p.y, r, 0, Math.PI * 2);
      c.fill();
      c.globalCompositeOperation = prevOp;
      break;
    }
    case 'debris': {
      const a = 1 - t;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rotation);
      c.fillStyle = `rgba(${p.color},${a})`;
      c.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
      c.restore();
      break;
    }
    case 'ember':
    case 'splash': {
      const a = 1 - t;
      c.beginPath();
      c.fillStyle = `rgba(${p.color},${a})`;
      c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      c.fill();
      break;
    }
  }
}

// Called by main.js whenever the stage scale changes. Resizing a canvas resets
// its context, so the world transform has to be re-applied here every time.
export function resize(stageScale) {
  if (!ctx) return;
  const s = Math.min(3, Math.max(1, stageScale)) * (window.devicePixelRatio || 1);
  for (const [c, cx] of [[canvas, ctx], [brightCanvas, brightCtx]]) {
    c.width = Math.round(WORLD_W * s);
    c.height = Math.round(WORLD_H * s);
    cx.setTransform(s, 0, 0, s, 0, 0);
  }
}

export function init() {
  canvas = document.getElementById('layer-fx');
  ctx = canvas.getContext('2d');
  brightCanvas = document.getElementById('layer-fx-bright');
  brightCtx = brightCanvas.getContext('2d');

  function loop(t) {
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
    lastT = t;
    step(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  console.log('[effects] particle loop started');
}
