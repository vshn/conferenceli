// Cameo theatre events. The pop-culture rule-breakers. Two have teeth
// (kraken, UFO) and kill a pod; the rest are pure spectacle.

import { register } from '../eventBus.js';
import {
  el, layer, rand, pick, sleep, animate, tween,
  pickRunningPodIndex, getContainerScenePos,
} from '../util.js';
import {
  emitFlash, emitDebris, emitEmbers, emitSplash, emitSmokeBurst, emitSmokeWisp,
} from '../../effects.js';
import * as state from '../../state.js';

// --- 1. Kraken attack (pod kill) -----------------------------------------

register({
  name: 'kraken',
  category: 'cameo',
  weight: 1,
  async run({ killPod }) {
    const idx = pickRunningPodIndex(state);
    if (idx === null) return;
    const pos = getContainerScenePos(idx);
    if (!pos) return;

    const w = layer('layer-water');
    // Anchor the tentacle base at the water line directly below the target.
    const baseX = pos.x + rand(-20, 20);
    const baseY = 730;

    // Water churns first
    for (let i = 0; i < 6; i++) {
      emitSplash(baseX + rand(-50, 50), baseY, 8);
      await sleep(90);
    }

    const g = el('g', {
      class: 'theatre-kraken',
      transform: `translate(${baseX},${baseY + 200})`,
    }, w);
    // Tapered tentacle — wider at base, curling tip
    el('path', {
      d: 'M-18,0 Q-22,-80 -10,-160 Q-2,-200 8,-220 Q22,-240 28,-220 Q34,-200 26,-160 Q14,-80 18,0 Z',
      fill: '#3a1a4a', stroke: '#1a0820', 'stroke-width': 1.5,
    }, g);
    // Suckers (dotted line down the inside)
    for (let yy = -20; yy > -200; yy -= 18) {
      el('circle', { cx: -4 - (yy / 200) * 8, cy: yy, r: 3, fill: '#7a3a8a' }, g);
    }
    // Tip curl detail
    el('circle', { cx: 16, cy: -218, r: 4, fill: '#2a0a3a' }, g);

    // Rise from beneath water to over the container
    const riseToY = pos.y + 30;  // tip ends just above container
    await tween({
      from: baseY + 200, to: riseToY, duration: 1400, easing: 'easeOutQuad',
      onUpdate: (y) => g.setAttribute('transform', `translate(${baseX},${y})`),
    });
    // Sway
    await tween({
      from: 0, to: 18, duration: 350, easing: 'easeInOutSine',
      onUpdate: (a) => g.setAttribute('transform', `translate(${baseX},${riseToY}) rotate(${a})`),
    });
    await tween({
      from: 18, to: -22, duration: 500, easing: 'easeInOutSine',
      onUpdate: (a) => g.setAttribute('transform', `translate(${baseX},${riseToY}) rotate(${a})`),
    });
    // SLAP — snap toward target
    await tween({
      from: -22, to: 5, duration: 220, easing: 'easeInQuad',
      onUpdate: (a) => g.setAttribute('transform', `translate(${baseX},${riseToY}) rotate(${a})`),
    });
    // Impact: kill + huge splash
    emitFlash(pos.x, pos.y, 60);
    emitSplash(pos.x, pos.y, 28);
    emitDebris(pos.x, pos.y, '120,80,180', 18);
    killPod(idx);
    // Drag it back down
    await sleep(400);
    await tween({
      from: riseToY, to: baseY + 240, duration: 1100, easing: 'easeInQuad',
      onUpdate: (y) => g.setAttribute('transform', `translate(${baseX},${y})`),
    });
    emitSplash(baseX, baseY, 24);
    g.remove();
  },
});

// --- 2. UFO abduction (pod kill) -----------------------------------------

register({
  name: 'ufo-abduction',
  category: 'cameo',
  weight: 1,
  async run({ killPod }) {
    const idx = pickRunningPodIndex(state);
    if (idx === null) return;
    const pos = getContainerScenePos(idx);
    if (!pos) return;

    const fg = layer('layer-foreground');
    const targetX = pos.x;
    const hoverY = Math.max(180, pos.y - 220);
    const g = el('g', {
      class: 'theatre-ufo',
      transform: `translate(${targetX},-80)`,
    }, fg);
    // Saucer body
    el('ellipse', { cx: 0, cy: 0, rx: 60, ry: 12, fill: '#3a3a48', stroke: '#1a1a22', 'stroke-width': 1.2 }, g);
    el('ellipse', { cx: 0, cy: -2, rx: 64, ry: 6, fill: '#5a5a6a' }, g);
    // Dome
    el('path', { d: 'M-22,-4 Q0,-26 22,-4 Z', fill: '#9fc8da', opacity: 0.85 }, g);
    el('path', { d: 'M-22,-4 Q0,-26 22,-4 Z', fill: 'none', stroke: '#1a1a22', 'stroke-width': 1.2 }, g);
    // Lights ring (animated blink via setInterval)
    const lights = [];
    for (let i = -45; i <= 45; i += 18) {
      const c = el('circle', { cx: i, cy: 8, r: 3, fill: '#ffe066' }, g);
      lights.push(c);
    }
    let lightT = 0;
    const lightTimer = setInterval(() => {
      lightT++;
      lights.forEach((c, i) => {
        c.setAttribute('fill', (i + lightT) % 2 ? '#ffe066' : '#ff5a5a');
      });
    }, 180);

    // Descend
    await tween({
      from: -80, to: hoverY, duration: 1600, easing: 'easeOutCubic',
      onUpdate: (y) => g.setAttribute('transform', `translate(${targetX},${y})`),
    });
    // Beam
    const beam = el('path', {
      class: 'theatre-ufo-beam',
      d: `M-14,8 L${pos.x - targetX - 35},${pos.y - hoverY + 10} L${pos.x - targetX + 35},${pos.y - hoverY + 10} L14,8 Z`,
      fill: '#9fe0ff', opacity: 0,
      filter: 'drop-shadow(0 0 14px #9fe0ff)',
    }, g);
    await animate({
      targets: beam, opacity: 0.7, duration: 600, easing: 'easeInQuad',
      update: () => beam.setAttribute('opacity', beam.style.opacity || beam.getAttribute('opacity')),
    });
    // Pulse the beam, then climax
    for (let i = 0; i < 3; i++) {
      beam.setAttribute('opacity', '0.95');
      await sleep(120);
      beam.setAttribute('opacity', '0.5');
      await sleep(120);
    }
    // Climax flash + kill
    emitFlash(pos.x, pos.y, 70);
    emitFlash(pos.x, pos.y - 10, 40);
    killPod(idx);
    // Beam closes
    await animate({
      targets: beam, opacity: 0, duration: 400, easing: 'easeOutQuad',
      update: () => beam.setAttribute('opacity', beam.style.opacity || beam.getAttribute('opacity')),
    });
    beam.remove();
    // Saucer hovers a beat then streaks away (off the top corner)
    await sleep(300);
    const exitDir = Math.random() < 0.5 ? -1 : 1;
    await tween({
      from: 0, to: 1, duration: 900, easing: 'easeInCubic',
      onUpdate: (t) => {
        const x = targetX + exitDir * 1200 * t;
        const y = hoverY - 700 * t;
        g.setAttribute('transform', `translate(${x},${y})`);
      },
    });
    clearInterval(lightTimer);
    g.remove();
  },
});

// --- 3. Jaws fin (pure tease, no kill) ------------------------------------

register({
  name: 'jaws-fin',
  category: 'cameo',
  weight: 1,
  async run() {
    const w = layer('layer-water');
    const cx = rand(280, 1000);
    const cy = rand(740, 758);
    const g = el('g', {
      class: 'theatre-jaws',
      transform: `translate(${cx - 200},${cy})`,
    }, w);
    el('path', {
      d: 'M-14,0 Q-6,-22 0,-26 Q6,-22 14,0 Z',
      fill: '#1f2a32', stroke: '#0a0e12', 'stroke-width': 0.8,
    }, g);
    // Tiny wake under it
    el('ellipse', { cx: 0, cy: 4, rx: 22, ry: 2, fill: '#fff', opacity: 0.55 }, g);

    // Approach in a slow circle, then exit. ~8s total.
    const t0 = performance.now();
    const totalMs = 8500;
    while (performance.now() - t0 < totalMs) {
      const t = (performance.now() - t0) / totalMs;
      // Big slow loop around (cx, cy)
      const r = 80 + Math.sin(t * Math.PI) * 60;
      const a = t * Math.PI * 1.8 - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * 18;
      // Fin tilts based on direction of motion
      const tilt = Math.cos(a) * 12;
      g.setAttribute('transform', `translate(${x},${y}) rotate(${tilt})`);
      // Occasional dip
      const dip = Math.sin(t * Math.PI * 6) > 0.85 ? 8 : 0;
      g.setAttribute('opacity', String(1 - dip * 0.1));
      await sleep(50);
    }
    // Slow fade & sink
    await tween({
      from: 1, to: 0, duration: 700, easing: 'easeOutQuad',
      onUpdate: (o) => g.setAttribute('opacity', String(o)),
    });
    g.remove();
  },
});

// --- 4. Loch Ness sighting -----------------------------------------------

register({
  name: 'nessie',
  category: 'cameo',
  weight: 0.9,
  async run() {
    const w = layer('layer-water');
    const cx = rand(280, 1000);
    const cy = 738;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const humps = [];
    const positions = [-70, -30, 14].map((dx) => cx + dx * dir);
    for (const x of positions) {
      const h = el('path', {
        d: 'M-16,8 Q-10,-6 0,-8 Q10,-6 16,8 Z',
        fill: '#2a4a3a', stroke: '#0e1a14', 'stroke-width': 0.8,
        transform: `translate(${x},${cy + 14})`, opacity: 0,
      }, w);
      humps.push(h);
    }
    // Head: longer neck shape
    const head = el('g', {
      transform: `translate(${cx + 50 * dir},${cy + 14}) scale(${dir},1)`,
      opacity: 0,
    }, w);
    el('path', {
      d: 'M0,0 Q4,-26 14,-30 Q20,-30 22,-22 Q14,-18 12,-12 Q14,-6 8,0 Z',
      fill: '#2a4a3a', stroke: '#0e1a14', 'stroke-width': 0.8,
    }, head);
    el('circle', { cx: 18, cy: -22, r: 1.4, fill: '#fff' }, head);

    // Surface humps in sequence
    for (const h of humps) {
      await tween({
        from: 0, to: 1, duration: 280, easing: 'easeOutQuad',
        onUpdate: (t) => {
          h.setAttribute('opacity', String(t));
          const dy = (1 - t) * 10;
          const x = h.getAttribute('transform').match(/translate\(([-\d.]+)/)[1];
          h.setAttribute('transform', `translate(${x},${cy + 14 + dy})`);
        },
      });
      emitSplash(parseFloat(h.getAttribute('transform').match(/translate\(([-\d.]+)/)[1]), cy + 6, 4);
      await sleep(120);
    }
    // Head pops up
    await tween({
      from: 0, to: 1, duration: 350, easing: 'easeOutQuad',
      onUpdate: (t) => {
        head.setAttribute('opacity', String(t));
        const dy = (1 - t) * 12;
        head.setAttribute('transform', `translate(${cx + 50 * dir},${cy + 14 + dy}) scale(${dir},1)`);
      },
    });
    await sleep(700);
    // Everyone ducks under
    const all = [...humps, head];
    await Promise.all(all.map((node) => tween({
      from: 1, to: 0, duration: 500, easing: 'easeInQuad',
      onUpdate: (t) => node.setAttribute('opacity', String(t)),
    })));
    emitSplash(cx, cy, 18);
    all.forEach((n) => n.remove());
  },
});

// --- 5. Meteor streak (night-only) ---------------------------------------

register({
  name: 'meteor',
  category: 'cameo',
  weight: 1,
  nightOnly: true,
  async run() {
    const fromLeft = Math.random() < 0.5;
    const x0 = fromLeft ? rand(-40, 200) : rand(1080, 1320);
    const y0 = rand(40, 120);
    const x1 = fromLeft ? rand(900, 1300) : rand(-20, 380);
    const y1 = rand(420, 560);  // disappears past horizon
    const dur = 1100;
    const t0 = performance.now();
    emitFlash(x0, y0, 30);
    while (performance.now() - t0 < dur) {
      const t = (performance.now() - t0) / dur;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      emitEmbers(x, y, 4);
      await sleep(28);
    }
  },
});

// --- 6. Godzilla silhouette ----------------------------------------------

register({
  name: 'godzilla',
  category: 'cameo',
  weight: 0.9,
  async run() {
    const bg = layer('layer-background');
    const fromLeft = Math.random() < 0.5;
    const dir = fromLeft ? 1 : -1;
    const x0 = fromLeft ? -120 : 1400;
    const x1 = fromLeft ? 1400 : -120;
    const baseY = 540;  // head pokes above the distant hills
    const g = el('g', {
      class: 'theatre-godzilla',
      transform: `translate(${x0},${baseY}) scale(${dir * 0.7},0.7)`,
    }, bg);
    // Body silhouette: head, neck, back spines, faint torso
    el('path', {
      d: 'M0,0 L-6,-18 L-2,-26 Q4,-32 10,-26 L18,-22 L22,-12 L18,-6 L10,-2 L8,4 L14,8 L18,16 L22,28 L18,40 L0,40 Z',
      fill: '#0a0a14', opacity: 0.92,
    }, g);
    // Spine ridges
    el('path', { d: 'M14,-8 L18,-14 L22,-8 Z M16,2 L20,-4 L24,2 Z M18,12 L22,6 L26,12 Z',
      fill: '#0a0a14' }, g);
    // Eye glow (small red dot)
    el('circle', { cx: 6, cy: -22, r: 1.2, fill: '#ff2020' }, g);

    // Walk: translate + slight bob
    const totalMs = 14000;
    const t0 = performance.now();
    while (performance.now() - t0 < totalMs) {
      const t = (performance.now() - t0) / totalMs;
      const x = x0 + (x1 - x0) * t;
      const bob = Math.sin(t * Math.PI * 24) * 2;
      g.setAttribute('transform', `translate(${x},${baseY + bob}) scale(${dir * 0.7},0.7)`);
      await sleep(40);
    }
    g.remove();
  },
});

// --- 7. Giant rubber duck ------------------------------------------------

register({
  name: 'rubber-duck',
  category: 'cameo',
  weight: 0.7,
  async run() {
    const w = layer('layer-water');
    const fromLeft = Math.random() < 0.5;
    const dir = fromLeft ? 1 : -1;
    const x0 = fromLeft ? -160 : 1440;
    const x1 = fromLeft ? 1440 : -160;
    const baseY = 700;
    const g = el('g', {
      class: 'theatre-duck',
      transform: `translate(${x0},${baseY}) scale(${dir},1)`,
    }, w);
    // Body
    el('ellipse', { cx: 0, cy: 0, rx: 70, ry: 32, fill: '#ffd84d', stroke: '#a07a00', 'stroke-width': 1.5 }, g);
    el('ellipse', { cx: 0, cy: -8, rx: 50, ry: 18, fill: '#ffe680' }, g);
    // Head
    el('circle', { cx: 48, cy: -28, r: 26, fill: '#ffd84d', stroke: '#a07a00', 'stroke-width': 1.5 }, g);
    // Beak
    el('path', { d: 'M70,-30 L94,-26 L94,-18 L70,-22 Z', fill: '#ff8a1a', stroke: '#7a3a00', 'stroke-width': 1.2 }, g);
    el('line', { x1: 70, y1: -24, x2: 94, y2: -22, stroke: '#7a3a00', 'stroke-width': 0.8 }, g);
    // Eye
    el('circle', { cx: 54, cy: -38, r: 4, fill: '#fff' }, g);
    el('circle', { cx: 56, cy: -38, r: 2, fill: '#1a1a1a' }, g);
    // Tail
    el('path', { d: 'M-60,-12 L-78,-20 L-72,-2 Z', fill: '#ffd84d', stroke: '#a07a00', 'stroke-width': 1.2 }, g);

    const totalMs = 16000;
    const t0 = performance.now();
    while (performance.now() - t0 < totalMs) {
      const t = (performance.now() - t0) / totalMs;
      const x = x0 + (x1 - x0) * t;
      const bob = Math.sin(t * Math.PI * 12) * 4;
      const tilt = Math.sin(t * Math.PI * 12 + 1) * 3;
      g.setAttribute('transform', `translate(${x},${baseY + bob}) scale(${dir},1) rotate(${tilt})`);
      await sleep(40);
    }
    g.remove();
  },
});
