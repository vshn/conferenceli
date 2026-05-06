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
    // Body geometry has nose on the LEFT (cockpit window at x=-18) and tail
    // boom on the RIGHT. So when flying right (dir=1) we mirror horizontally
    // to put the nose forward; when flying left (dir=-1) we keep the default.
    const flip = -dir;
    const g = el('g', {
      class: 'theatre-helicopter',
      transform: `translate(${x0},${y0}) scale(${flip * 0.9},0.9)`,
    }, fg);
    el('ellipse', { cx: 0, cy: 0, rx: 22, ry: 8, fill: '#2a3540' }, g);
    el('rect', { x: 18, y: -2, width: 18, height: 3, fill: '#2a3540' }, g);
    el('ellipse', { cx: 38, cy: -1, rx: 5, ry: 4, fill: '#2a3540' }, g);
    // Tail rotor blades
    el('rect', { x: 36, y: -5, width: 1.5, height: 8, fill: '#1a1a1a', opacity: 0.6 }, g);
    el('rect', { x: -22, y: 7, width: 44, height: 1.5, fill: '#1a1a1a' }, g);
    // Rotor — wide thin ellipse, opacity flickers to suggest motion blur.
    const rotor = el('ellipse', { cx: 0, cy: -8, rx: 30, ry: 1.5, fill: '#1a1a1a', opacity: 0.55 }, g);
    el('circle', { cx: 0, cy: -8, r: 2, fill: '#444' }, g);
    // Cockpit window (front of nose)
    el('path', { d: 'M-22,-2 Q-18,-6 -10,-5 L-10,2 L-22,2 Z', fill: '#7ec0e8', opacity: 0.85 }, g);
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
        g.setAttribute('transform', `translate(${x},${y}) scale(${flip * 0.9},0.9)`);
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
    // The base CSS uses `opacity: 0 !important` so an inline style won't win.
    // A class with !important does, and gives us the bright halo + transition.
    // Pulse three times so it reads clearly as a sweeping lighthouse.
    for (let i = 0; i < 3; i++) {
      beam.classList.add('theatre-pulsing');
      await sleep(2400);
      beam.classList.remove('theatre-pulsing');
      await sleep(1200);
    }
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
    // Render in foreground so the periscope is above ships and dock.
    const w = layer('layer-foreground');
    const x = rand(280, 1000);
    const baseY = 745;
    const g = el('g', { class: 'theatre-periscope', transform: `translate(${x},${baseY})` }, w);
    // Pole — wider so it reads against the ship hull behind it.
    el('rect', { x: -4, y: 0, width: 8, height: 0, fill: '#1a2a30', stroke: '#0a1418', 'stroke-width': 0.6 }, g).id = 'pscope-pole';
    const head = el('g', { transform: 'translate(0,0)' }, g);
    // L-shaped scope head — vertical bend + horizontal eyepiece. ~2x larger.
    el('rect', { x: -7, y: -22, width: 14, height: 22, fill: '#1a2a30', stroke: '#0a1418', 'stroke-width': 0.8 }, head);
    el('rect', { x: -7, y: -22, width: 28, height: 10, fill: '#1a2a30', stroke: '#0a1418', 'stroke-width': 0.8 }, head);
    // Lens
    el('rect', { x: 17, y: -20, width: 6, height: 6, fill: '#7ec0e8' }, head);
    el('rect', { x: 18, y: -19, width: 4, height: 1.5, fill: '#cfe6f2' }, head);
    // Antenna nub on top
    el('line', { x1: 0, y1: -22, x2: 0, y2: -28, stroke: '#1a2a30', 'stroke-width': 1.2 }, head);
    // Water ring around the pole
    el('ellipse', { cx: 0, cy: 0, rx: 24, ry: 3, fill: '#fff', opacity: 0.6 }, g);

    const pole = g.querySelector('#pscope-pole');
    const RISE = 56;  // total rise distance (was 22)
    // Rise
    await tween({
      from: 0, to: RISE, duration: 800, easing: 'easeOutQuad',
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
        update: () => head.setAttribute('transform', `translate(0,${-RISE}) rotate(${head._a ?? angle})`),
      });
      head._a = angle;
      head.setAttribute('transform', `translate(0,${-RISE}) rotate(${angle})`);
      await sleep(150);
    }
    // Submerge
    await tween({
      from: RISE, to: 0, duration: 700, easing: 'easeInQuad',
      onUpdate: (v) => {
        pole.setAttribute('y', String(-v));
        pole.setAttribute('height', String(v));
        head.setAttribute('transform', `translate(0,${-v}) rotate(0)`);
      },
    });
    // Tiny splash on submerge
    emitSplash(x, baseY, 12);
    g.remove();
  },
});

// --- 7. Whale spout ------------------------------------------------------

register({
  name: 'whale-spout',
  category: 'ambient',
  weight: 0.9,
  async run() {
    const x = rand(200, 1080);
    const yWater = 728;
    // In foreground so the whale's back arches above the wave layers.
    const fg = layer('layer-foreground');
    const dir = Math.random() < 0.5 ? 1 : -1;

    // Whale group — a humpback-style arched back with a fluke at the tail.
    const g = el('g', {
      class: 'theatre-whale',
      transform: `translate(${x},${yWater}) scale(${dir},1)`,
      opacity: 0,
    }, fg);
    // Arched back (rises about 26px above water, ~120px long)
    el('path', {
      d: 'M-60,4 Q-50,-20 -10,-26 Q40,-30 70,-12 Q56,4 30,8 Q0,10 -30,8 Z',
      fill: '#1a2a36', stroke: '#070d12', 'stroke-width': 1,
    }, g);
    // Highlight along the top of the back
    el('path', {
      d: 'M-50,-2 Q-40,-22 -10,-26 Q30,-28 60,-14',
      fill: 'none', stroke: '#3a5060', 'stroke-width': 1.2, opacity: 0.7,
    }, g);
    // Tail stock + fluke (upturned)
    const tail = el('g', { transform: 'translate(-58,4)' }, g);
    el('path', {
      d: 'M0,0 Q-14,-4 -22,-14 Q-30,-22 -34,-12 Q-18,-4 -10,4 Z',
      fill: '#1a2a36', stroke: '#070d12', 'stroke-width': 0.8,
    }, tail);
    // Tiny eye
    el('circle', { cx: 50, cy: -8, r: 1.2, fill: '#f0e8c0' }, g);
    // Blowhole at the highest point of the back
    el('ellipse', { cx: 16, cy: -24, rx: 2, ry: 1.2, fill: '#070d12' }, g);

    // Spout from the blowhole — particles offset by translate (dir flip)
    const spoutX = x + 16 * dir;
    const spoutY = yWater - 24;

    // Surface: rise + fade in
    await tween({
      from: 0, to: 1, duration: 700, easing: 'easeOutQuad',
      onUpdate: (t) => {
        g.setAttribute('opacity', String(t));
        const dy = (1 - t) * 14;
        g.setAttribute('transform', `translate(${x},${yWater + dy}) scale(${dir},1)`);
      },
    });
    // Spout column
    emitSplash(spoutX, yWater, 14);
    for (let i = 0; i < 10; i++) {
      emitSmokeWisp(spoutX + rand(-3, 3), spoutY - i * 3, 6, false);
      await sleep(60);
    }
    // Hold a beat
    await sleep(500);
    // Fluke flick before diving
    await tween({
      from: 0, to: 1, duration: 800, easing: 'easeInOutQuad',
      onUpdate: (t) => {
        const flickPhase = Math.sin(t * Math.PI * 2) * 30;
        tail.setAttribute('transform', `translate(-58,4) rotate(${flickPhase})`);
      },
    });
    // Submerge: sink + fade
    await tween({
      from: 1, to: 0, duration: 900, easing: 'easeInQuad',
      onUpdate: (t) => {
        g.setAttribute('opacity', String(t));
        const dy = (1 - t) * 16;
        g.setAttribute('transform', `translate(${x},${yWater + dy}) scale(${dir},1)`);
      },
    });
    emitSplash(x, yWater + 4, 18);
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
    // Keep the crane clear of the lighthouse on the right side.
    const fromLeft = Math.random() < 0.5;
    const baseX = fromLeft ? 140 : 1020;
    const g = el('g', { class: 'theatre-crane', transform: `translate(${baseX},700)` }, fg);
    // Vertical post
    el('rect', { x: -6, y: -260, width: 12, height: 260, fill: '#3a3a3a' }, g);
    // Cross-brace pattern
    for (let yy = -30; yy > -240; yy -= 35) {
      el('line', { x1: -6, y1: yy, x2: 6, y2: yy - 14, stroke: '#222', 'stroke-width': 1 }, g);
      el('line', { x1: 6, y1: yy, x2: -6, y2: yy - 14, stroke: '#222', 'stroke-width': 1 }, g);
    }
    // Concrete base / cab
    el('rect', { x: -18, y: -22, width: 36, height: 22, fill: '#5a5a5a', stroke: '#222', 'stroke-width': 1 }, g);
    el('rect', { x: -10, y: -18, width: 7, height: 7, fill: '#7ec0e8' }, g);
    // Pivoting arm + hook. SVG transform-origin works as a presentation
    // attribute in modern engines; set both attribute and inline style for
    // safety. Origin is the post top so the arm pivots up there.
    const arm = el('g', { class: 'theatre-crane-arm' }, g);
    arm.setAttribute('transform-origin', '0 -250');
    arm.style.transformOrigin = '0px -250px';
    arm.setAttribute('transform', 'rotate(0)');
    const armDir = fromLeft ? 1 : -1;
    // Main horizontal jib. Use unsigned width and shift x by -180 when
    // pointing left so the rect actually renders (negative widths are
    // implementation-defined in SVG and often disappear).
    const armLen = 180;
    el('rect', {
      x: armDir > 0 ? 0 : -armLen,
      y: -254, width: armLen, height: 8, fill: '#3a3a3a',
    }, arm);
    // Counterweight on the opposite side of the pivot for visual balance.
    el('rect', {
      x: armDir > 0 ? -40 : 16,
      y: -258, width: 24, height: 14, fill: '#2a2a2a', stroke: '#111', 'stroke-width': 0.6,
    }, arm);
    // Cable + load box at the jib tip
    el('line', { x1: 160 * armDir, y1: -246, x2: 160 * armDir, y2: -190, stroke: '#222', 'stroke-width': 1.2 }, arm);
    el('rect', { x: 160 * armDir - 10, y: -190, width: 20, height: 12, fill: '#7a4a1a', stroke: '#3a1a08', 'stroke-width': 0.8 }, arm);

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
    const sky = layer('layer-sky');
    const fg = layer('layer-foreground');

    // The cloud rides high in the sky.
    const cloudY = rand(110, 170);
    const cloudGroup = el('g', { class: 'theatre-cloud', opacity: 0.92 }, sky);
    el('ellipse', { cx: 0,   cy: 0,  rx: 70, ry: 26, fill: '#ffffff' }, cloudGroup);
    el('ellipse', { cx: 50,  cy: -10, rx: 56, ry: 32, fill: '#ffffff' }, cloudGroup);
    el('ellipse', { cx: -45, cy: 6,  rx: 50, ry: 22, fill: '#f5fafe' }, cloudGroup);
    el('ellipse', { cx: 22,  cy: 16, rx: 60, ry: 16, fill: '#e6eef4' }, cloudGroup);

    // Shadow on the ground — wider/flatter, follows the cloud horizontally
    // but offset to mimic an oblique sun angle.
    const shadowGroup = el('g', { class: 'theatre-cloud-shadow' }, fg);
    el('ellipse', {
      cx: 0, cy: 0, rx: 220, ry: 30,
      fill: '#0a1218', opacity: 0.18,
    }, shadowGroup);

    const SHADOW_OFFSET_X = 60;
    const SHADOW_Y = 660;
    await tween({
      from: -300, to: 1580, duration: 14000, easing: 'linear',
      onUpdate: (x) => {
        cloudGroup.setAttribute('transform', `translate(${x},${cloudY})`);
        shadowGroup.setAttribute('transform', `translate(${x + SHADOW_OFFSET_X},${SHADOW_Y})`);
      },
    });
    cloudGroup.remove();
    shadowGroup.remove();
  },
});
