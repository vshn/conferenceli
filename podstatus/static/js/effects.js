// Canvas particle pool + RAF loop for explosions, smoke, splashes.

const MAX_PARTICLES = 600;
let pool = [];
let active = [];
let canvas, ctx;
let brightCanvas, brightCtx;  // separate canvas above night-overlay for flashes
let lastT = 0;
let recurringEmitters = [];

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
  recurringEmitters.forEach(fn => fn(dt));

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  brightCtx.clearRect(0, 0, brightCanvas.width, brightCanvas.height);
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
    p.y += p.vy * dt;
    p.rotation += p.vr * dt;
    drawParticle(p);
  }
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
