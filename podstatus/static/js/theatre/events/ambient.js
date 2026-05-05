// Ambient theatre events. Theatre-only (no pod kills). Each one is short and
// keeps the scene feeling alive between bigger moments.

import { register } from '../eventBus.js';
import { el, layer, rand, pick, sleep, animate, tween } from '../util.js';
import { emitSmokeWisp, emitFlash, emitSplash, emitEmbers } from '../../effects.js';

// --- 1. Tugboat / fishing boat traversal ---------------------------------

register({
  name: 'tugboat',
  category: 'ambient',
  weight: 1.2,
  async run() {
    const bg = layer('layer-background');
    const fromLeft = Math.random() < 0.5;
    const y = rand(595, 615);
    const x0 = fromLeft ? -80 : 1360;
    const x1 = fromLeft ? 1360 : -80;
    const dir = fromLeft ? 1 : -1;
    const palette = pick([
      { hull: '#4a3520', cabin: '#d6b070', stack: '#3a2615' },
      { hull: '#7a3a2a', cabin: '#e8e8e8', stack: '#1a1a1a' },
      { hull: '#2d4a5e', cabin: '#f0f0f0', stack: '#202020' },
    ]);
    const g = el('g', {
      class: 'theatre-tugboat',
      transform: `translate(${x0},${y}) scale(${dir},1)`,
    }, bg);
    el('polygon', { points: '0,0 56,0 50,9 6,9', fill: palette.hull, stroke: '#000', 'stroke-width': 0.4 }, g);
    el('rect', { x: 18, y: -14, width: 22, height: 14, fill: palette.cabin, stroke: '#000', 'stroke-width': 0.4 }, g);
    el('rect', { x: 22, y: -10, width: 6, height: 5, fill: '#7ec0e8' }, g);
    el('rect', { x: 31, y: -10, width: 5, height: 5, fill: '#7ec0e8' }, g);
    el('rect', { x: 30, y: -22, width: 5, height: 8, fill: palette.stack }, g);
    el('rect', { x: 29, y: -23, width: 7, height: 2, fill: '#444' }, g);
    el('line', { x1: 38, y1: -14, x2: 38, y2: -32, stroke: '#222', 'stroke-width': 0.6 }, g);
    el('polygon', { points: '38,-32 48,-30 38,-26', fill: '#cc2a2a' }, g);

    // Periodic puff from the stack while it sails.
    let puffT = 0;
    const stop = { v: false };
    (async () => {
      while (!stop.v) {
        await sleep(450);
        const m = g.getAttribute('transform').match(/translate\(([-\d.]+),([\d.]+)\)/);
        if (m) emitSmokeWisp(parseFloat(m[1]) + 32 * dir, parseFloat(m[2]) - 24, 4, false);
        puffT++;
      }
    })();

    await tween({
      from: x0, to: x1, duration: 14000, easing: 'linear',
      onUpdate: (v) => g.setAttribute('transform', `translate(${v},${y}) scale(${dir},1)`),
    });
    stop.v = true;
    g.remove();
  },
});

// --- 2. Cargo helicopter flyby -------------------------------------------

register({
  name: 'helicopter',
  category: 'ambient',
  weight: 1,
  async run() {
    const fg = layer('layer-foreground');
    const fromLeft = Math.random() < 0.5;
    const y0 = rand(120, 220);
    const y1 = y0 + rand(-30, 30);
    const x0 = fromLeft ? -80 : 1360;
    const x1 = fromLeft ? 1360 : -80;
    const dir = fromLeft ? 1 : -1;
    const g = el('g', {
      class: 'theatre-helicopter',
      transform: `translate(${x0},${y0}) scale(${dir * 0.9},0.9)`,
    }, fg);
    el('ellipse', { cx: 0, cy: 0, rx: 22, ry: 8, fill: '#2a3540' }, g);
    el('rect', { x: 18, y: -2, width: 18, height: 3, fill: '#2a3540' }, g);
    el('ellipse', { cx: 38, cy: -1, rx: 5, ry: 4, fill: '#2a3540' }, g);
    el('rect', { x: -22, y: 7, width: 44, height: 1.5, fill: '#1a1a1a' }, g);
    // Rotor — wide thin ellipse, opacity flickers to suggest motion blur.
    const rotor = el('ellipse', { cx: 0, cy: -8, rx: 30, ry: 1.5, fill: '#1a1a1a', opacity: 0.55 }, g);
    el('circle', { cx: 0, cy: -8, r: 2, fill: '#444' }, g);
    el('rect', { x: -18, y: 0, width: 4, height: 2, fill: '#7ec0e8' }, g);
    let blink = 0;
    const blinkTimer = setInterval(() => {
      blink = !blink;
      rotor.setAttribute('opacity', blink ? 0.25 : 0.65);
    }, 80);

    await tween({
      from: 0, to: 1, duration: 11000, easing: 'linear',
      onUpdate: (t) => {
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t;
        g.setAttribute('transform', `translate(${x},${y}) scale(${dir * 0.9},0.9)`);
      },
    });
    clearInterval(blinkTimer);
    g.remove();
  },
});

// --- 3. Lighthouse beam pulse --------------------------------------------

// The CSS-driven beam is normally at low opacity. Briefly brighten it for one
// rotation so it visibly sweeps the scene.

register({
  name: 'lighthouse-pulse',
  category: 'ambient',
  weight: 0.8,
  async run() {
    const beam = document.getElementById('lighthouse-beam');
    if (!beam) return;
    const wasInline = beam.style.opacity;
    beam.style.transition = 'opacity 1s ease-in-out';
    beam.style.opacity = '0.55';
    await sleep(8500);
    beam.style.opacity = '';
    await sleep(1000);
    beam.style.transition = '';
    beam.style.opacity = wasInline;
  },
});

// --- 4. Fog wisp drift ---------------------------------------------------

register({
  name: 'fog-drift',
  category: 'ambient',
  weight: 1,
  async run() {
    const startY = rand(620, 700);
    const fromLeft = Math.random() < 0.5;
    let t = 0;
    const total = 12;  // seconds
    const tick = 90;
    while (t < total * 1000) {
      const x = fromLeft ? rand(-40, 200) : rand(1080, 1320);
      emitSmokeWisp(x, startY + rand(-18, 18), 14, false);
      await sleep(tick);
      t += tick;
    }
  },
});

// --- 5. Distant lightning flash ------------------------------------------

register({
  name: 'distant-lightning',
  category: 'ambient',
  weight: 0.7,
  async run() {
    // Two close flashes at horizon — looks like lightning behind a far cloud.
    const x = rand(200, 1080);
    emitFlash(x, rand(120, 200), 90);
    await sleep(80);
    emitFlash(x + rand(-40, 40), rand(120, 200), 60);
    await sleep(800);
  },
});

// --- 6. Submarine periscope ----------------------------------------------

register({
  name: 'periscope',
  category: 'ambient',
  weight: 0.9,
  async run() {
    const w = layer('layer-water');
    const x = rand(280, 1000);
    const baseY = 745;
    const g = el('g', { class: 'theatre-periscope', transform: `translate(${x},${baseY})` }, w);
    el('rect', { x: -2, y: 0, width: 4, height: 0, fill: '#1a2a30' }, g).id = 'pscope-pole';
    const head = el('g', { transform: 'translate(0,0)' }, g);
    el('rect', { x: -8, y: -4, width: 12, height: 5, fill: '#1a2a30' }, head);
    el('rect', { x: 4, y: -3, width: 3, height: 2, fill: '#7ec0e8' }, head);
    el('ellipse', { cx: 0, cy: 0, rx: 16, ry: 2, fill: '#fff', opacity: 0.55 }, g);

    const pole = g.querySelector('#pscope-pole');
    // Rise
    await tween({
      from: 0, to: 22, duration: 700, easing: 'easeOutQuad',
      onUpdate: (v) => {
        pole.setAttribute('y', String(-v));
        pole.setAttribute('height', String(v));
        head.setAttribute('transform', `translate(0,${-v})`);
      },
    });
    // Scan left/right
    for (const angle of [25, -25, 15, 0]) {
      await animate({
        targets: head,
        rotate: angle,
        duration: 400,
        easing: 'easeInOutSine',
        update: () => head.setAttribute('transform', `translate(0,${-22}) rotate(${head._a ?? angle})`),
      });
      head._a = angle;
      head.setAttribute('transform', `translate(0,${-22}) rotate(${angle})`);
      await sleep(150);
    }
    // Submerge
    await tween({
      from: 22, to: 0, duration: 600, easing: 'easeInQuad',
      onUpdate: (v) => {
        pole.setAttribute('y', String(-v));
        pole.setAttribute('height', String(v));
        head.setAttribute('transform', `translate(0,${-v}) rotate(0)`);
      },
    });
    // Tiny splash on submerge
    emitSplash(x, baseY, 8);
    g.remove();
  },
});

// --- 7. Whale spout ------------------------------------------------------

register({
  name: 'whale-spout',
  category: 'ambient',
  weight: 0.9,
  async run() {
    const x = rand(150, 1130);
    const yWater = rand(720, 745);
    // Soft splash + upward spout particles
    emitSplash(x, yWater, 24);
    // Spout column — short stream of upward smoke wisps tinted white.
    for (let i = 0; i < 8; i++) {
      emitSmokeWisp(x + rand(-3, 3), yWater - 4 - i * 2, 5, false);
      await sleep(60);
    }
    // Flick of a fluke
    const w = layer('layer-water');
    const g = el('g', { class: 'theatre-whale', transform: `translate(${x + 30},${yWater + 4}) scale(0.8)` }, w);
    el('path', {
      d: 'M0,0 Q6,-12 0,-22 Q-6,-12 0,0 Z',
      fill: '#1a2a36', opacity: 0.85,
    }, g);
    await tween({
      from: 0, to: 1, duration: 1200, easing: 'easeInOutQuad',
      onUpdate: (t) => {
        const o = t < 0.5 ? t * 2 : (1 - t) * 2;
        g.setAttribute('opacity', String(o));
        const tilt = Math.sin(t * Math.PI) * 35;
        g.setAttribute('transform', `translate(${x + 30},${yWater + 4}) scale(0.8) rotate(${tilt})`);
      },
    });
    g.remove();
  },
});

// --- 8. Seagull frenzy ---------------------------------------------------

register({
  name: 'seagull-frenzy',
  category: 'ambient',
  weight: 1,
  async run() {
    const fg = layer('layer-foreground');
    const cx = rand(300, 980);
    const cy = rand(180, 280);
    const flock = [];
    for (let i = 0; i < 6; i++) {
      const g = el('g', {
        class: 'theatre-frenzy-gull seagull flapping',
        transform: `translate(${cx + rand(-200, 200)},${cy + rand(-80, 80)}) scale(0.9)`,
      }, fg);
      el('path', {
        class: 'seagull-wing',
        d: 'M0,0 Q-8,-6 -16,-2 M0,0 Q8,-6 16,-2',
      }, g);
      flock.push({ g, t: rand(0, Math.PI * 2) });
    }
    // Converge: each bird swirls around (cx,cy) for ~6s, then disperses.
    const start = performance.now();
    const swirlMs = 6000;
    const disperseMs = 3500;
    while (performance.now() - start < swirlMs) {
      const t = (performance.now() - start) / 1000;
      flock.forEach((b) => {
        const r = 30 + Math.sin(t * 0.7 + b.t) * 18;
        const a = b.t + t * 1.6;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.6;
        b.g.setAttribute('transform', `translate(${x},${y}) scale(0.9)`);
      });
      await sleep(40);
    }
    const dStart = performance.now();
    const targets = flock.map(() => ({
      x: rand(-60, 1340), y: rand(60, 400),
    }));
    while (performance.now() - dStart < disperseMs) {
      const t = (performance.now() - dStart) / disperseMs;
      flock.forEach((b, i) => {
        const lastA = b.t + (swirlMs / 1000) * 1.6;
        const sx = cx + Math.cos(lastA) * 40;
        const sy = cy + Math.sin(lastA) * 24;
        const x = sx + (targets[i].x - sx) * t;
        const y = sy + (targets[i].y - sy) * t;
        b.g.setAttribute('transform', `translate(${x},${y}) scale(0.9)`);
      });
      await sleep(40);
    }
    flock.forEach((b) => b.g.remove());
  },
});

// --- 9. Crane swing on dock ----------------------------------------------

register({
  name: 'crane-swing',
  category: 'ambient',
  weight: 0.9,
  async run() {
    const fg = layer('layer-foreground');
    const fromLeft = Math.random() < 0.5;
    const baseX = fromLeft ? 80 : 1200;
    const g = el('g', { class: 'theatre-crane', transform: `translate(${baseX},700)` }, fg);
    // Vertical post
    el('rect', { x: -6, y: -260, width: 12, height: 260, fill: '#3a3a3a' }, g);
    // Cross-brace pattern
    for (let yy = -30; yy > -240; yy -= 35) {
      el('line', { x1: -6, y1: yy, x2: 6, y2: yy - 14, stroke: '#222', 'stroke-width': 1 }, g);
      el('line', { x1: 6, y1: yy, x2: -6, y2: yy - 14, stroke: '#222', 'stroke-width': 1 }, g);
    }
    // Pivoting arm + hook
    const arm = el('g', { class: 'theatre-crane-arm', transform: 'rotate(0)' }, g);
    arm.setAttribute('transform-origin', '0 -250');
    const armDir = fromLeft ? 1 : -1;
    el('rect', { x: 0, y: -254, width: 180 * armDir, height: 8, fill: '#3a3a3a' }, arm);
    el('line', { x1: 160 * armDir, y1: -250, x2: 160 * armDir, y2: -190, stroke: '#222', 'stroke-width': 1.2 }, arm);
    el('rect', { x: 160 * armDir - 8, y: -190, width: 16, height: 10, fill: '#222' }, arm);

    await tween({
      from: 0, to: 30 * armDir, duration: 2200, easing: 'easeInOutSine',
      onUpdate: (a) => arm.setAttribute('transform', `rotate(${a})`),
    });
    await tween({
      from: 30 * armDir, to: -10 * armDir, duration: 2400, easing: 'easeInOutSine',
      onUpdate: (a) => arm.setAttribute('transform', `rotate(${a})`),
    });
    await tween({
      from: -10 * armDir, to: 0, duration: 1400, easing: 'easeInOutSine',
      onUpdate: (a) => arm.setAttribute('transform', `rotate(${a})`),
    });
    g.remove();
  },
});

// --- 10. Cloud shadow ----------------------------------------------------

register({
  name: 'cloud-shadow',
  category: 'ambient',
  weight: 0.7,
  dayOnly: true,
  async run() {
    const fg = layer('layer-foreground');
    const g = el('g', { class: 'theatre-cloud-shadow' }, fg);
    el('ellipse', {
      cx: 0, cy: 0, rx: 220, ry: 30,
      fill: '#0a1218', opacity: 0.16,
    }, g);
    g.setAttribute('transform', 'translate(-260,640)');
    await tween({
      from: -260, to: 1540, duration: 14000, easing: 'linear',
      onUpdate: (x) => g.setAttribute('transform', `translate(${x},640)`),
    });
    g.remove();
  },
});
