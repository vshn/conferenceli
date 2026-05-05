// Signature theatre events. Dramatic, mostly on-theme, and they ACTUALLY
// delete a pod at the climax frame. Each event:
//   1. picks a running container index (skips if none)
//   2. plays a lead-in animation visually targeted at that container
//   3. calls killPod(index) when the climax lands
//   4. lets the existing death/scorch animation in animations.js take over

import { register } from '../eventBus.js';
import {
  el, layer, rand, pick, sleep, animate, tween,
  pickRunningPodIndex, getContainerScenePos,
} from '../util.js';
import {
  emitFlash, emitDebris, emitEmbers, emitSmokeBurst, emitSmokeWisp, emitSplash,
} from '../../effects.js';
import * as state from '../../state.js';

// Helper: a temporary scene-wide darkening overlay (storm mood).
function buildStormDim() {
  const fg = layer('layer-foreground');
  return el('rect', {
    class: 'theatre-storm-dim',
    x: 0, y: 0, width: 1280, height: 720,
    fill: '#0a1626', opacity: 0,
  }, fg);
}

// Helper: jagged forked-lightning path between two points.
function lightningPath(x0, y0, x1, y1) {
  const segments = 8;
  let d = `M${x0},${y0}`;
  let cx = x0, cy = y0;
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const tx = x0 + (x1 - x0) * t;
    const ty = y0 + (y1 - y0) * t;
    cx = tx + rand(-22, 22);
    cy = ty + rand(-6, 6);
    d += ` L${cx},${cy}`;
  }
  d += ` L${x1},${y1}`;
  return d;
}

// --- 1. Lightning strike --------------------------------------------------

register({
  name: 'lightning-strike',
  category: 'signature',
  weight: 1,
  async run({ killPod }) {
    const idx = pickRunningPodIndex(state);
    if (idx === null) return;
    const pos = getContainerScenePos(idx);
    if (!pos) return;

    const dim = buildStormDim();
    await animate({
      targets: dim, opacity: 0.55, duration: 1200, easing: 'easeInQuad',
      update: () => dim.setAttribute('opacity', dim.style.opacity || dim.getAttribute('opacity')),
    });
    // Pre-flicker: two faint flashes
    emitFlash(rand(200, 1080), rand(80, 180), 50);
    await sleep(180);
    emitFlash(rand(200, 1080), rand(80, 180), 60);
    await sleep(280);

    // The bolt itself — drawn in the bright layer above night overlay.
    const fg = layer('layer-foreground');
    const boltX = pos.x + rand(-8, 8);
    const path = el('path', {
      class: 'theatre-lightning-bolt',
      d: lightningPath(boltX, 40, pos.x, pos.y - 8),
      fill: 'none',
      stroke: '#ffffff',
      'stroke-width': 4,
      'stroke-linecap': 'round',
      filter: 'drop-shadow(0 0 8px #fff8c0) drop-shadow(0 0 18px #ffe44a)',
      opacity: 1,
    }, fg);
    // Big climax flash + kill at impact frame
    emitFlash(pos.x, pos.y, 110);
    emitFlash(pos.x, pos.y, 70);
    killPod(idx);
    await sleep(90);
    path.setAttribute('opacity', '0.4');
    await sleep(60);
    path.setAttribute('opacity', '1');
    await sleep(50);
    path.remove();

    // Hold the storm dim a moment longer, then lift.
    await sleep(900);
    await animate({
      targets: dim, opacity: 0, duration: 1400, easing: 'easeOutQuad',
      update: () => dim.setAttribute('opacity', dim.style.opacity || dim.getAttribute('opacity')),
    });
    dim.remove();
  },
});

// --- 2. Rogue wave --------------------------------------------------------

register({
  name: 'rogue-wave',
  category: 'signature',
  weight: 1,
  async run({ killPod }) {
    const idx = pickRunningPodIndex(state);
    if (idx === null) return;
    const pos = getContainerScenePos(idx);
    if (!pos) return;

    const w = layer('layer-water');
    const fromLeft = pos.x > 640;  // wave rolls in from the side AWAY from target
    const startX = fromLeft ? -200 : 1480;
    const dir = fromLeft ? 1 : -1;
    const peakX = pos.x;

    // The wave is a swelling crescent that translates from off-screen to peakX.
    const g = el('g', { class: 'theatre-rogue-wave', transform: `translate(${startX},720)` }, w);
    el('path', {
      d: 'M-160,0 Q-80,-70 0,-80 Q80,-70 160,0 Q80,8 0,4 Q-80,8 -160,0 Z',
      fill: '#1f4f6c', opacity: 0.95,
    }, g);
    el('path', {
      d: 'M-130,-30 Q-60,-78 0,-86 Q60,-78 130,-30 Q60,-50 0,-58 Q-60,-50 -130,-30 Z',
      fill: '#9fc8da', opacity: 0.85,
    }, g);
    // Foam crest
    el('ellipse', { cx: 0, cy: -86, rx: 90, ry: 6, fill: '#ffffff', opacity: 0.9 }, g);

    await tween({
      from: 0, to: 1, duration: 2200, easing: 'easeInQuad',
      onUpdate: (t) => {
        const x = startX + (peakX - startX) * t;
        const sy = 720 + (1 - t) * 6;
        const sc = 0.6 + t * 0.5;
        g.setAttribute('transform', `translate(${x},${sy}) scale(${sc})`);
      },
    });
    // Crash at the ship
    emitSplash(pos.x - 40 * dir, pos.y + 4, 22);
    emitSplash(pos.x, pos.y, 28);
    emitSplash(pos.x + 40 * dir, pos.y + 4, 22);
    killPod(idx);
    // Wave continues, breaks, recedes
    await tween({
      from: 1, to: 1.6, duration: 900, easing: 'easeOutQuad',
      onUpdate: (t) => {
        const x = peakX + dir * (t - 1) * 200;
        const sc = 0.6 + (1.4 - (t - 1) * 0.6) * 0.5;
        g.setAttribute('transform', `translate(${x},720) scale(${sc})`);
        g.setAttribute('opacity', String(Math.max(0, 1 - (t - 1) * 1.6)));
      },
    });
    g.remove();
  },
});

// --- 3. Crane mishap ------------------------------------------------------

register({
  name: 'crane-mishap',
  category: 'signature',
  weight: 1,
  async run({ killPod }) {
    const idx = pickRunningPodIndex(state);
    if (idx === null) return;
    const pos = getContainerScenePos(idx);
    if (!pos) return;

    const fg = layer('layer-foreground');
    const baseX = pos.x;
    const towerTop = 80;
    const g = el('g', { class: 'theatre-crane-mishap' }, fg);
    // Tower (off to one side so it doesn't cover the container directly)
    const towerX = baseX + (baseX < 640 ? 220 : -220);
    el('rect', { x: towerX - 6, y: towerTop, width: 12, height: 720 - towerTop, fill: '#3a3a3a' }, g);
    for (let yy = towerTop + 30; yy < 700; yy += 35) {
      el('line', { x1: towerX - 6, y1: yy, x2: towerX + 6, y2: yy - 14, stroke: '#222', 'stroke-width': 1 }, g);
      el('line', { x1: towerX + 6, y1: yy, x2: towerX - 6, y2: yy - 14, stroke: '#222', 'stroke-width': 1 }, g);
    }
    // Horizontal arm from tower over the container
    el('rect', {
      x: Math.min(baseX, towerX) - 6,
      y: towerTop,
      width: Math.abs(baseX - towerX) + 12,
      height: 8,
      fill: '#3a3a3a',
    }, g);
    // Cable + hook (animated y descent)
    const cable = el('line', {
      x1: baseX, y1: towerTop + 8, x2: baseX, y2: towerTop + 8,
      stroke: '#222', 'stroke-width': 1.5,
    }, g);
    const hook = el('g', { transform: `translate(${baseX},${towerTop + 8})` }, g);
    el('rect', { x: -12, y: 0, width: 24, height: 6, fill: '#222' }, hook);
    el('path', { d: 'M-4,6 Q-8,16 0,18 Q8,16 4,6 Z', fill: '#444', stroke: '#222', 'stroke-width': 0.6 }, hook);

    const targetY = pos.y - 30;
    await tween({
      from: towerTop + 8, to: targetY, duration: 1800, easing: 'easeInOutQuad',
      onUpdate: (y) => {
        cable.setAttribute('y2', String(y));
        hook.setAttribute('transform', `translate(${baseX},${y})`);
      },
    });
    // "Grab"
    await sleep(300);
    emitSmokeWisp(baseX, pos.y, 4, false);
    // Lift a tiny bit
    await tween({
      from: targetY, to: targetY - 18, duration: 700, easing: 'easeOutQuad',
      onUpdate: (y) => {
        cable.setAttribute('y2', String(y));
        hook.setAttribute('transform', `translate(${baseX},${y})`);
      },
    });
    // CABLE SNAPS — hook drops fast, debris flies
    cable.setAttribute('stroke', '#aa3030');
    emitDebris(baseX, targetY - 18, '90,90,90', 12);
    killPod(idx);
    await tween({
      from: targetY - 18, to: pos.y + 6, duration: 280, easing: 'easeInQuad',
      onUpdate: (y) => {
        const len = y - (towerTop + 8);
        cable.setAttribute('y2', String(towerTop + 8 + Math.min(len, 20)));
        hook.setAttribute('transform', `translate(${baseX},${y})`);
      },
    });
    emitFlash(pos.x, pos.y, 40);
    emitDebris(pos.x, pos.y, '90,90,90', 18);
    // Crane retracts
    await sleep(900);
    await animate({
      targets: g, opacity: 0, duration: 700, easing: 'easeOutQuad',
      update: () => g.setAttribute('opacity', g.style.opacity),
    });
    g.remove();
  },
});

// --- 4. Cargo fire --------------------------------------------------------

register({
  name: 'cargo-fire',
  category: 'signature',
  weight: 1,
  async run({ killPod }) {
    const idx = pickRunningPodIndex(state);
    if (idx === null) return;
    const pos = getContainerScenePos(idx);
    if (!pos) return;

    // Slow build: smoke + embers from the container for ~5s, intensifying.
    const buildMs = 5000;
    const startT = performance.now();
    while (performance.now() - startT < buildMs) {
      const t = (performance.now() - startT) / buildMs;
      // Refresh pos in case the container moves (it shouldn't, but safe).
      const p = getContainerScenePos(idx) || pos;
      emitSmokeWisp(p.x + rand(-12, 12), p.y - 18, 4 + t * 6, t > 0.5);
      if (Math.random() < 0.3 + t * 0.5) emitEmbers(p.x, p.y - 12, 3 + Math.floor(t * 6));
      await sleep(120 - t * 60);
    }
    // Climax: fireball + kill
    const p = getContainerScenePos(idx) || pos;
    emitFlash(p.x, p.y, 100);
    emitFlash(p.x, p.y, 60);
    emitSmokeBurst(p.x, p.y, 18);
    emitDebris(p.x, p.y, '255,160,40', 26);
    killPod(idx);
  },
});

// --- 5. Pirate broadside --------------------------------------------------

register({
  name: 'pirate-broadside',
  category: 'signature',
  weight: 1,
  async run({ killPod }) {
    const idx = pickRunningPodIndex(state);
    if (idx === null) return;
    const pos = getContainerScenePos(idx);
    if (!pos) return;

    const fg = layer('layer-foreground');
    const fromLeft = pos.x > 640;
    const dir = fromLeft ? 1 : -1;
    const startX = fromLeft ? -160 : 1440;
    const cruiseX = fromLeft ? Math.max(120, pos.x - 380) : Math.min(1160, pos.x + 380);
    const shipY = 660;

    const g = el('g', {
      class: 'theatre-pirate-ship',
      transform: `translate(${startX},${shipY}) scale(${dir},1)`,
    }, fg);
    // Hull
    el('polygon', { points: '-90,0 90,0 70,28 -70,28', fill: '#3a2415', stroke: '#1a0e08', 'stroke-width': 1.5 }, g);
    // Deck
    el('rect', { x: -90, y: -6, width: 180, height: 6, fill: '#5a3a22' }, g);
    // Main mast
    el('rect', { x: -2, y: -110, width: 4, height: 110, fill: '#2a1810' }, g);
    // Sails — black with skull
    el('path', { d: 'M-44,-100 Q-22,-94 0,-100 L0,-50 Q-22,-44 -44,-50 Z', fill: '#1a1a1a' }, g);
    el('path', { d: 'M0,-100 Q22,-94 44,-100 L44,-50 Q22,-44 0,-50 Z', fill: '#1a1a1a' }, g);
    // Tiny skull-and-crossbones (just a white circle as proxy)
    el('circle', { cx: 0, cy: -78, r: 5, fill: '#f0f0f0' }, g);
    el('rect', { x: -2, y: -75, width: 4, height: 2, fill: '#1a1a1a' }, g);
    // Crow's nest
    el('rect', { x: -8, y: -118, width: 16, height: 6, fill: '#3a2415' }, g);
    // Pirate flag
    el('rect', { x: 2, y: -132, width: 22, height: 14, fill: '#0a0a0a' }, g);
    el('circle', { cx: 13, cy: -125, r: 3, fill: '#f0f0f0' }, g);
    // Cannon port
    const cannonX = 60 * dir;
    el('rect', { x: cannonX - 10, y: 4, width: 20, height: 10, fill: '#0a0a0a' }, g);
    el('rect', { x: cannonX - 4, y: 8, width: 12 * dir, height: 4, fill: '#1a1a1a' }, g);

    // Sail in
    await tween({
      from: startX, to: cruiseX, duration: 4000, easing: 'easeOutCubic',
      onUpdate: (x) => g.setAttribute('transform', `translate(${x},${shipY}) scale(${dir},1)`),
    });
    // Pause + aim
    await sleep(700);
    // Cannon flash + smoke puff at the cannon
    const sceneCannonX = cruiseX + cannonX * dir;
    emitFlash(sceneCannonX + 12 * dir, shipY + 9, 30);
    emitSmokeBurst(sceneCannonX + 12 * dir, shipY + 9, 10);
    // Cannonball arc
    const ball = el('circle', {
      cx: sceneCannonX + 12 * dir, cy: shipY + 9, r: 5, fill: '#1a1a1a',
    }, fg);
    const bx0 = sceneCannonX + 12 * dir;
    const by0 = shipY + 9;
    const bx1 = pos.x;
    const by1 = pos.y - 6;
    const arcDur = 700;
    await tween({
      from: 0, to: 1, duration: arcDur, easing: 'linear',
      onUpdate: (t) => {
        const x = bx0 + (bx1 - bx0) * t;
        // parabola peak above straight line
        const arc = -Math.sin(t * Math.PI) * 80;
        const y = by0 + (by1 - by0) * t + arc;
        ball.setAttribute('cx', String(x));
        ball.setAttribute('cy', String(y));
      },
    });
    ball.remove();
    // Impact
    emitFlash(pos.x, pos.y, 80);
    emitDebris(pos.x, pos.y, '180,180,180', 22);
    killPod(idx);
    // Pirate sails away
    await sleep(1200);
    await tween({
      from: cruiseX, to: fromLeft ? 1440 : -160, duration: 4500, easing: 'easeInCubic',
      onUpdate: (x) => g.setAttribute('transform', `translate(${x},${shipY}) scale(${dir},1)`),
    });
    g.remove();
  },
});
