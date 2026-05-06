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

    // Render in foreground so the wave wraps OVER the ship's container at impact.
    const fg = layer('layer-foreground');
    const fromLeft = pos.x > 640;  // wave rolls in from the side AWAY from target
    const startX = fromLeft ? -260 : 1540;
    const dir = fromLeft ? 1 : -1;
    const peakX = pos.x;

    // The wave is built so it FACES the target. The local +X axis points in
    // the direction of travel; we apply scale(dir,1) so the curl always
    // breaks toward the container.
    const g = el('g', {
      class: 'theatre-rogue-wave',
      transform: `translate(${startX},720) scale(${dir},1)`,
    }, fg);

    // Wave body — large breaking-wave silhouette with a curling lip.
    // The shape goes:
    //   - low base at the back (left side, behind the curl)
    //   - rising swell in the middle
    //   - tall curl at the front (right side) that hooks down
    //   - returns along the underside of the curl back to the base
    el('path', {
      d: 'M-220,4 L-220,-10 Q-160,-30 -90,-46 Q-30,-58 30,-78 Q90,-94 130,-72 Q160,-50 158,-22 Q150,8 110,18 Q80,12 70,-12 Q60,-36 30,-44 Q-20,-32 -50,-12 Q-80,4 -120,8 L-220,8 Z',
      fill: '#1f4f6c', stroke: '#0c2c3e', 'stroke-width': 1.2,
    }, g);
    // Translucent face (lighter teal) showing the inside of the curl
    el('path', {
      d: 'M-140,-22 Q-60,-58 30,-72 Q86,-78 122,-58 Q138,-40 132,-20 Q102,-6 84,-22 Q66,-44 30,-46 Q-30,-30 -80,-12 Q-110,-8 -140,-12 Z',
      fill: '#3a7d9a', opacity: 0.85,
    }, g);
    // Highlight stripe just under the lip
    el('path', {
      d: 'M-50,-44 Q20,-72 100,-66',
      fill: 'none', stroke: '#9fc8da', 'stroke-width': 4, opacity: 0.85,
      'stroke-linecap': 'round',
    }, g);
    // Foam crest along the very top of the lip
    el('path', {
      d: 'M-30,-72 Q40,-92 110,-78 Q120,-66 100,-60 Q60,-72 20,-66 Q-10,-58 -30,-58 Z',
      fill: '#ffffff', opacity: 0.95,
    }, g);
    // Spray flecks above the crest
    for (let i = 0; i < 6; i++) {
      el('circle', {
        cx: -10 + i * 20 + rand(-4, 4),
        cy: -90 + rand(-8, 4),
        r: rand(1.2, 3),
        fill: '#ffffff', opacity: 0.85,
      }, g);
    }
    // Foam at the base where the wave meets the water
    el('path', {
      d: 'M-220,8 Q-100,2 30,8 Q120,12 158,8 L158,18 L-220,18 Z',
      fill: '#dceaf2', opacity: 0.7,
    }, g);

    // ---- Roll in: translate + grow ----
    await tween({
      from: 0, to: 1, duration: 2000, easing: 'easeInQuad',
      onUpdate: (t) => {
        const x = startX + (peakX - 80 * dir - startX) * t;
        const sy = 720 + (1 - t) * 8;
        const sc = 0.55 + t * 0.6;
        g.setAttribute('transform', `translate(${x},${sy}) scale(${dir * sc},${sc})`);
      },
    });

    // ---- Crash on the ship ----
    emitSplash(pos.x - 40 * dir, pos.y + 4, 24);
    emitSplash(pos.x, pos.y - 4, 32);
    emitSplash(pos.x + 40 * dir, pos.y + 4, 24);
    emitSplash(pos.x, pos.y - 30, 18);  // spray up over the container
    killPod(idx);

    // ---- Break + recede: continue past the target, fade ----
    await tween({
      from: 0, to: 1, duration: 900, easing: 'easeOutQuad',
      onUpdate: (t) => {
        const x = peakX - 80 * dir + dir * t * 240;
        const sc = 1.15 - t * 0.4;
        g.setAttribute('transform', `translate(${x},${720 + t * 6}) scale(${dir * sc},${sc})`);
        g.setAttribute('opacity', String(Math.max(0, 1 - t * 1.4)));
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

    // ---- Hull ----
    // Single closed path: gunwale across the top, curved sides down to a
    // narrower keel. No self-intersections — the previous version zig-zagged
    // backward through itself which left holes after fill.
    el('path', {
      d: 'M-110,-6 L110,-6 Q124,8 96,30 L-96,30 Q-124,8 -110,-6 Z',
      fill: '#3a2415', stroke: '#1a0e08', 'stroke-width': 1.5,
    }, g);
    // Plank line along the hull
    el('line', { x1: -100, y1: 14, x2: 100, y2: 14, stroke: '#1a0e08', 'stroke-width': 0.7, opacity: 0.8 }, g);
    // Gunwale rim (top edge of the hull)
    el('rect', { x: -110, y: -10, width: 220, height: 5, fill: '#5a3a22', stroke: '#2a1810', 'stroke-width': 0.6 }, g);
    // Stern castle (raised quarterdeck at the back-right)
    el('rect', { x: 60, y: -24, width: 44, height: 14, fill: '#5a3a22', stroke: '#2a1810', 'stroke-width': 0.6 }, g);
    el('rect', { x: 68, y: -20, width: 6, height: 6, fill: '#7ec0e8' }, g);
    el('rect', { x: 84, y: -20, width: 6, height: 6, fill: '#7ec0e8' }, g);
    el('polygon', { points: '60,-24 56,-10 60,-10', fill: '#3a2415', stroke: '#2a1810', 'stroke-width': 0.4 }, g);
    // Bowsprit (pointed beam at the front)
    el('line', { x1: -110, y1: -4, x2: -140, y2: -18, stroke: '#2a1810', 'stroke-width': 3, 'stroke-linecap': 'round' }, g);

    // ---- Cannon ports along hull ----
    for (const px of [-72, -36, 0, 36]) {
      el('rect', { x: px - 5, y: 4, width: 10, height: 8, fill: '#0a0a0a' }, g);
      el('rect', { x: px - 4, y: 5, width: 8, height: 6, fill: '#3a1a08' }, g);
    }

    // ---- Masts + sails ----
    // Main mast
    el('rect', { x: -3, y: -130, width: 5, height: 122, fill: '#2a1810' }, g);
    // Foremast (forward of main)
    el('rect', { x: -52, y: -110, width: 4, height: 102, fill: '#2a1810' }, g);
    // Yards (horizontal cross-spars)
    el('rect', { x: -54, y: -114, width: 90, height: 3, fill: '#2a1810' }, g);
    el('rect', { x: -90, y: -94, width: 80, height: 2.5, fill: '#2a1810' }, g);
    // Main sail — billowed, off-white canvas with curved bottom
    el('path', {
      d: 'M-44,-110 Q0,-104 40,-110 Q44,-72 32,-50 Q0,-44 -36,-50 Q-44,-72 -44,-110 Z',
      fill: '#e6dcc0', stroke: '#7a6a40', 'stroke-width': 1, opacity: 0.95,
    }, g);
    // Sail seam highlight
    el('path', {
      d: 'M-40,-100 Q0,-96 38,-100',
      fill: 'none', stroke: '#7a6a40', 'stroke-width': 0.6, opacity: 0.7,
    }, g);
    // Skull on the main sail
    el('circle', { cx: -2, cy: -80, r: 7, fill: '#1a1a1a' }, g);
    el('circle', { cx: -4.5, cy: -82, r: 1.4, fill: '#e6dcc0' }, g);
    el('circle', { cx: 0.5, cy: -82, r: 1.4, fill: '#e6dcc0' }, g);
    el('rect', { x: -3, y: -76, width: 2, height: 2, fill: '#e6dcc0' }, g);
    // Crossed bones
    el('line', { x1: -10, y1: -68, x2: 6, y2: -76, stroke: '#1a1a1a', 'stroke-width': 1.6 }, g);
    el('line', { x1: -10, y1: -76, x2: 6, y2: -68, stroke: '#1a1a1a', 'stroke-width': 1.6 }, g);
    // Foresail (smaller, in front of main)
    el('path', {
      d: 'M-90,-92 Q-72,-86 -52,-92 Q-50,-72 -56,-58 Q-72,-54 -88,-58 Q-90,-72 -90,-92 Z',
      fill: '#d8cfb0', stroke: '#7a6a40', 'stroke-width': 1, opacity: 0.95,
    }, g);
    // Crow's nest
    el('path', { d: 'M-12,-130 L12,-130 L8,-122 L-8,-122 Z', fill: '#3a2415', stroke: '#1a0e08', 'stroke-width': 0.6 }, g);
    // Pirate flag
    el('line', { x1: -0.5, y1: -148, x2: -0.5, y2: -130, stroke: '#2a1810', 'stroke-width': 0.8 }, g);
    const flag = el('path', {
      d: 'M0,-148 L26,-145 L26,-132 L0,-134 Z',
      fill: '#0a0a0a', stroke: '#2a1810', 'stroke-width': 0.5,
    }, g);
    el('circle', { cx: 12, cy: -140, r: 2.5, fill: '#f0f0f0' }, g);

    // Subtle flag flap
    let flapPhase = 0;
    const flapTimer = setInterval(() => {
      flapPhase += 0.4;
      const k = Math.sin(flapPhase) * 1.5;
      flag.setAttribute('d', `M0,-148 L26,${-145 + k} L26,${-132 + k} L0,-134 Z`);
    }, 80);

    // Cannon port that fires (lined up with the broadside)
    const cannonX = 60 * dir;

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
    clearInterval(flapTimer);
    g.remove();
  },
});
