// Phase-locked theatre events. These are the payoff of the day arc: things a
// visitor can only see at one time of day, so the harbour at 10:00 and the
// harbour at 17:00 are genuinely different places rather than the same scene
// with a filter on it.
//
// Every event here declares `phaseWeights`. A phase missing from the map means
// the event is benched for that phase entirely (see phaseWeight() in
// eventBus.js), which is what makes "you had to be there at dusk" real.

import { register } from '../eventBus.js';
import { el, layer, rand, pick, sleep, tween } from '../util.js';
import { emitSplash } from '../../effects.js';
import { world } from '../seed.js';

const WATERLINE = 724;

// --- Dawn: the fishing fleet puts out --------------------------------------

register({
  name: 'fishing-fleet',
  category: 'ambient',
  weight: 2,
  phaseWeights: { dawn: 4, morning: 1 },
  cooldownMs: 600000,
  async run() {
    const bg = layer('layer-background');
    const boats = [];
    const n = 3 + Math.floor(Math.random() * 2);

    for (let i = 0; i < n; i++) {
      const y = rand(596, 616);
      const g = el('g', { class: 'theatre-fishing-boat', transform: `translate(-90, ${y})` }, bg);
      el('polygon', { points: '0,0 34,0 30,7 4,7', fill: '#4a3520', stroke: '#000', 'stroke-width': 0.4 }, g);
      el('rect', { x: 11, y: -9, width: 12, height: 9, fill: pick(['#d6b070', '#e8e8e8', '#9fc4d6']) }, g);
      // Net derrick — the detail that reads "fishing boat" and not "tugboat".
      el('line', { x1: 24, y1: -9, x2: 30, y2: -26, stroke: '#2a2a2a', 'stroke-width': 0.8 }, g);
      el('line', { x1: 30, y1: -26, x2: 16, y2: -14, stroke: '#2a2a2a', 'stroke-width': 0.5 }, g);
      boats.push({ g, y, delay: i * rand(1400, 2600), speed: rand(15000, 19000) });
    }

    await Promise.all(boats.map(async (b) => {
      await sleep(b.delay);
      await tween({
        from: -90, to: 1370, duration: b.speed, easing: 'linear',
        onUpdate: (v) => b.g.setAttribute('transform', `translate(${v},${b.y})`),
      });
      b.g.remove();
    }));
  },
});

// --- Midday: harbour pilot boat --------------------------------------------

register({
  name: 'pilot-boat',
  category: 'ambient',
  weight: 1.4,
  phaseWeights: { morning: 1, midday: 2.5, afternoon: 2 },
  async run() {
    const w = layer('layer-water');
    const fromLeft = Math.random() < 0.5;
    const dir = fromLeft ? 1 : -1;
    const x0 = fromLeft ? -70 : 1350;
    const x1 = fromLeft ? 1350 : -70;
    const y = rand(716, 730);

    const g = el('g', { class: 'theatre-pilot-boat', transform: `translate(${x0},${y}) scale(${dir},1)` }, w);
    el('polygon', { points: '0,0 40,0 35,8 5,8', fill: '#e8e8e8', stroke: '#1a2b3a', 'stroke-width': 0.5 }, g);
    el('rect', { x: 12, y: -10, width: 16, height: 10, fill: '#1f4f7a' }, g);
    el('rect', { x: 0, y: 1, width: 40, height: 2.5, fill: '#c8462e' }, g);

    // A fast boat is sold by its wake, not its hull.
    let alive = true;
    (async () => {
      while (alive) {
        await sleep(160);
        const m = g.getAttribute('transform').match(/translate\(([-\d.]+),([\d.]+)\)/);
        if (m) emitSplash(parseFloat(m[1]) - 6 * dir, parseFloat(m[2]) + 6, 3);
      }
    })();

    await tween({
      from: x0, to: x1, duration: 9000, easing: 'linear',
      onUpdate: (v) => g.setAttribute('transform', `translate(${v},${y}) scale(${dir},1)`),
    });
    alive = false;
    g.remove();
  },
});

// --- Golden hour: the sun goes into the sea --------------------------------

register({
  name: 'sun-dip',
  category: 'ambient',
  weight: 2,
  phaseWeights: { golden: 5, dusk: 1.5 },
  cooldownMs: 900000,
  async run() {
    const nightLayer = layer('layer-night-additive');
    const sun = document.querySelector('#layer-sky .sun');
    const sx = sun ? parseFloat(sun.getAttribute('cx')) : 900;

    const g = el('g', { class: 'theatre-sun-dip' }, nightLayer);
    const glow = el('ellipse', {
      cx: sx, cy: 545, rx: 90, ry: 26,
      fill: '#ffb75e', opacity: 0,
    }, g);

    await tween({
      from: 0, to: 0.7, duration: 2600, easing: 'easeInOutQuad',
      onUpdate: (v) => {
        glow.setAttribute('opacity', v.toFixed(3));
        glow.setAttribute('rx', (90 + v * 70).toFixed(1));
      },
    });

    // The green flash: a real (and genuinely rare) atmospheric effect at the
    // moment the last of the sun goes under. Kept rare enough that catching
    // one is a story rather than a feature.
    if (Math.random() < 0.15) {
      const flash = el('ellipse', {
        cx: sx, cy: 538, rx: 26, ry: 9,
        fill: '#6bff9e', opacity: 0,
      }, g);
      await tween({
        from: 0, to: 1, duration: 260, easing: 'easeOutQuad',
        onUpdate: (v) => flash.setAttribute('opacity', (v * 0.9).toFixed(3)),
      });
      await tween({
        from: 1, to: 0, duration: 520, easing: 'easeInQuad',
        onUpdate: (v) => flash.setAttribute('opacity', (v * 0.9).toFixed(3)),
      });
      console.log('[theatre] green flash');
    }

    await tween({
      from: 0.7, to: 0, duration: 3200, easing: 'easeInQuad',
      onUpdate: (v) => glow.setAttribute('opacity', v.toFixed(3)),
    });
    g.remove();
  },
});

// --- Dusk: starling murmuration --------------------------------------------

register({
  name: 'starling-murmuration',
  category: 'ambient',
  weight: 2,
  phaseWeights: { dusk: 5, golden: 1.5 },
  cooldownMs: 720000,
  async run() {
    const fg = layer('layer-foreground');
    const g = el('g', { class: 'theatre-murmuration' }, fg);

    const N = 46;
    const birds = [];
    for (let i = 0; i < N; i++) {
      birds.push({
        el: el('circle', { cx: 0, cy: 0, r: rand(1.1, 2.1), fill: '#1c2026', opacity: 0.85 }, g),
        // Each bird keeps a fixed offset within the flock, so the shape holds
        // together while the whole thing moves — that's what makes a flock
        // read as a flock rather than as scattered dots.
        phase: rand(0, Math.PI * 2),
        radius: rand(18, 74),
        speed: rand(0.9, 1.7),
        wobble: rand(0.4, 1.3),
      });
    }

    const cx0 = rand(320, 900);
    const cy0 = rand(250, 350);

    await tween({
      from: 0, to: 1, duration: 16000, easing: 'linear',
      onUpdate: (t) => {
        // Flock centre traces a slow lissajous across the sky.
        const cx = cx0 + Math.sin(t * Math.PI * 2) * 210;
        const cy = cy0 + Math.sin(t * Math.PI * 4) * 55;
        // Swell and contract — the signature of a real murmuration.
        const swell = 0.6 + Math.sin(t * Math.PI * 6) * 0.4;
        for (const b of birds) {
          const a = b.phase + t * Math.PI * 2 * b.speed;
          const r = b.radius * swell;
          b.el.setAttribute('cx', (cx + Math.cos(a) * r).toFixed(1));
          b.el.setAttribute('cy', (cy + Math.sin(a) * r * 0.45 +
            Math.sin(t * 20 + b.phase) * b.wobble * 3).toFixed(1));
        }
      },
    });

    await tween({
      from: 0.85, to: 0, duration: 2200, easing: 'easeInQuad',
      onUpdate: (v) => g.setAttribute('opacity', v.toFixed(3)),
    });
    g.remove();
  },
});

// --- Night: bioluminescent plankton ----------------------------------------

register({
  name: 'plankton-bloom',
  category: 'ambient',
  weight: 2,
  nightOnly: true,
  phaseWeights: { dusk: 1, night: 4 },
  cooldownMs: 540000,
  async run() {
    const nightLayer = layer('layer-night-additive');
    const g = el('g', { class: 'theatre-plankton' }, nightLayer);

    const patches = [];
    const n = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      patches.push({
        el: el('ellipse', {
          cx: rand(80, 1200), cy: rand(WATERLINE + 4, 764),
          rx: rand(26, 70), ry: rand(4, 9),
          fill: '#54f5d0', opacity: 0,
        }, g),
        phase: rand(0, Math.PI * 2),
        peak: rand(0.25, 0.55),
      });
    }

    await tween({
      from: 0, to: 1, duration: 17000, easing: 'linear',
      onUpdate: (t) => {
        // Envelope in and out so the bloom arrives and fades rather than
        // blinking; the per-patch sine is the shimmer on top of that.
        const env = Math.sin(t * Math.PI);
        for (const p of patches) {
          const pulse = 0.55 + 0.45 * Math.sin(p.phase + t * Math.PI * 7);
          p.el.setAttribute('opacity', (env * pulse * p.peak).toFixed(3));
        }
      },
    });
    g.remove();
  },
});

// --- Night: dock searchlight -----------------------------------------------

register({
  name: 'searchlight-sweep',
  category: 'ambient',
  weight: 1.4,
  nightOnly: true,
  phaseWeights: { dusk: 1.5, night: 3 },
  cooldownMs: 600000,
  async run() {
    const nightLayer = layer('layer-night-additive');
    // Comes off the dock rather than the lighthouse, and sweeps the sky rather
    // than the horizon, so it never reads as a duplicate of the beam.
    const originX = Math.random() < 0.5 ? 90 : 1190;
    const g = el('g', { class: 'theatre-searchlight', transform: `translate(${originX}, 690)` }, nightLayer);

    const defs = el('defs', {}, g);
    defs.innerHTML = `
      <linearGradient id="searchBeamGrad" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%"   stop-color="#dff0ff" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="#dff0ff" stop-opacity="0"/>
      </linearGradient>
    `;
    const beam = el('polygon', {
      points: '0,0 -46,-640 46,-640',
      fill: 'url(#searchBeamGrad)',
      opacity: 0,
    }, g);
    el('circle', { cx: 0, cy: 0, r: 5, fill: '#fff6d8', opacity: 0.9 }, g);

    const dir = originX < 640 ? 1 : -1;
    await tween({
      from: 0, to: 1, duration: 1200, easing: 'easeOutQuad',
      onUpdate: (v) => beam.setAttribute('opacity', v.toFixed(3)),
    });
    await tween({
      from: -38 * dir, to: 42 * dir, duration: 9000, easing: 'easeInOutSine',
      onUpdate: (a) => g.setAttribute('transform', `translate(${originX}, 690) rotate(${a})`),
    });
    await tween({
      from: 1, to: 0, duration: 1600, easing: 'easeInQuad',
      onUpdate: (v) => beam.setAttribute('opacity', v.toFixed(3)),
    });
    g.remove();
  },
});

// --- Night: shooting star ---------------------------------------------------

register({
  name: 'shooting-star',
  category: 'ambient',
  weight: 2,
  nightOnly: true,
  phaseWeights: { dusk: 1, night: 4 },
  cooldownMs: 240000,
  async run() {
    const nightLayer = layer('layer-night-additive');
    const g = el('g', { class: 'theatre-shooting-star' }, nightLayer);

    const x0 = rand(200, 1000);
    const y0 = rand(70, 180);
    const len = rand(120, 240);
    const angle = rand(0.25, 0.55);   // radians below horizontal
    const dx = Math.cos(angle) * len;
    const dy = Math.sin(angle) * len;

    const trail = el('line', {
      x1: x0, y1: y0, x2: x0, y2: y0,
      stroke: '#ffffff', 'stroke-width': 1.8, 'stroke-linecap': 'round', opacity: 0,
    }, g);

    await tween({
      from: 0, to: 1, duration: 620, easing: 'linear',
      onUpdate: (t) => {
        // Head runs ahead; tail follows a beat behind, which is what draws the
        // streak instead of a growing line.
        const head = t;
        const tail = Math.max(0, t - 0.28);
        trail.setAttribute('x1', (x0 + dx * tail).toFixed(1));
        trail.setAttribute('y1', (y0 + dy * tail).toFixed(1));
        trail.setAttribute('x2', (x0 + dx * head).toFixed(1));
        trail.setAttribute('y2', (y0 + dy * head).toFixed(1));
        trail.setAttribute('opacity', (Math.sin(t * Math.PI) * 0.95).toFixed(3));
      },
    });
    g.remove();
  },
});

// --- Night: aurora (seeded rare) --------------------------------------------

// Only in the deck for roughly one conference in four. When the harbour has an
// aurora, it's that harbour's thing — which is exactly the kind of detail a
// returning visitor notices is missing (or new).
const HAS_AURORA = world.rng ? world.rng() < 0.25 : false;

if (HAS_AURORA) {
  register({
    name: 'aurora',
    category: 'signature',
    weight: 2,
    nightOnly: true,
    phaseWeights: { dusk: 1, night: 4 },
    cooldownMs: 1200000,
    async run() {
      const nightLayer = layer('layer-night-additive');
      const g = el('g', { class: 'theatre-aurora', opacity: 0 }, nightLayer);

      const defs = el('defs', {}, g);
      defs.innerHTML = `
        <linearGradient id="auroraGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stop-color="#7cf5c0" stop-opacity="0"/>
          <stop offset="35%"  stop-color="#57e8a8" stop-opacity="0.55"/>
          <stop offset="75%"  stop-color="#7a6fe0" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#7a6fe0" stop-opacity="0"/>
        </linearGradient>
      `;

      // Curtains are independent vertical bands whose x offsets ripple out of
      // phase; that shear is what makes it look like a curtain rather than a
      // rectangle of green.
      const curtains = [];
      for (let i = 0; i < 5; i++) {
        curtains.push({
          el: el('path', { d: '', fill: 'url(#auroraGrad)', opacity: rand(0.5, 1) }, g),
          x: 140 + i * 230 + rand(-40, 40),
          w: rand(90, 170),
          phase: rand(0, Math.PI * 2),
          speed: rand(0.6, 1.2),
        });
      }

      await tween({
        from: 0, to: 1, duration: 3000, easing: 'easeOutQuad',
        onUpdate: (v) => g.setAttribute('opacity', v.toFixed(3)),
      });

      await tween({
        from: 0, to: 1, duration: 26000, easing: 'linear',
        onUpdate: (t) => {
          for (const c of curtains) {
            const a = c.phase + t * Math.PI * 2 * c.speed;
            const top = 56;
            const bottom = 330 + Math.sin(a * 1.7) * 30;
            const shear = Math.sin(a) * 34;
            const w = c.w * (0.75 + 0.25 * Math.sin(a * 2.3));
            c.el.setAttribute('d',
              `M${(c.x - w / 2).toFixed(1)},${top} ` +
              `L${(c.x + w / 2).toFixed(1)},${top} ` +
              `L${(c.x + w / 2 + shear).toFixed(1)},${bottom.toFixed(1)} ` +
              `L${(c.x - w / 2 + shear).toFixed(1)},${bottom.toFixed(1)} Z`);
          }
        },
      });

      await tween({
        from: 1, to: 0, duration: 4000, easing: 'easeInQuad',
        onUpdate: (v) => g.setAttribute('opacity', v.toFixed(3)),
      });
      g.remove();
    },
  });
}

// --- Micro-life -------------------------------------------------------------
//
// Between events, something should always be moving somewhere. The seed picks
// which two or three of these are in town for a given conference, so the
// harbour has a slightly different cast each time without anyone noticing why.

const DOCK_Y = 700;

function hasMicro(name) {
  return Array.isArray(world.micro) && world.micro.includes(name);
}

if (hasMicro('dock-worker')) {
  register({
    name: 'dock-worker',
    category: 'ambient',
    weight: 1.6,
    dayOnly: true,
    phaseWeights: { dawn: 1, morning: 3, midday: 3, afternoon: 3, golden: 1.5 },
    cooldownMs: 150000,
    async run() {
      const d = layer('layer-dock');
      const fromLeft = Math.random() < 0.5;
      const x0 = fromLeft ? -30 : 1310;
      const x1 = fromLeft ? 1310 : -30;
      const dir = fromLeft ? 1 : -1;

      const g = el('g', { class: 'theatre-worker', transform: `translate(${x0},${DOCK_Y}) scale(${dir},1)` }, d);
      el('circle', { cx: 0, cy: -20, r: 3.4, fill: '#e8b98a' }, g);
      el('path', { d: 'M-4,-22 Q0,-27 4,-22 Z', fill: '#f2c53d' }, g);   // hi-vis helmet
      el('rect', { x: -3, y: -17, width: 6, height: 9, fill: '#f2843d' }, g);
      const legs = el('g', { class: 'worker-legs' }, g);
      el('line', { x1: -1.5, y1: -8, x2: -2.5, y2: 0, stroke: '#2a3a4a', 'stroke-width': 1.8 }, legs);
      el('line', { x1: 1.5, y1: -8, x2: 2.5, y2: 0, stroke: '#2a3a4a', 'stroke-width': 1.8 }, legs);

      await tween({
        from: x0, to: x1, duration: rand(22000, 30000), easing: 'linear',
        onUpdate: (v) => g.setAttribute('transform', `translate(${v},${DOCK_Y}) scale(${dir},1)`),
      });
      g.remove();
    },
  });
}

if (hasMicro('forklift')) {
  register({
    name: 'forklift',
    category: 'ambient',
    weight: 1.5,
    dayOnly: true,
    phaseWeights: { dawn: 0.5, morning: 3, midday: 3, afternoon: 2.5, golden: 1 },
    cooldownMs: 200000,
    async run() {
      const d = layer('layer-dock');
      const fromLeft = Math.random() < 0.5;
      const x0 = fromLeft ? -50 : 1330;
      const x1 = fromLeft ? 1330 : -50;
      const dir = fromLeft ? 1 : -1;

      const g = el('g', { class: 'theatre-forklift', transform: `translate(${x0},${DOCK_Y}) scale(${dir},1)` }, d);
      el('rect', { x: -12, y: -16, width: 20, height: 12, fill: '#e0a11e', stroke: '#6b4c08', 'stroke-width': 0.6 }, g);
      el('rect', { x: -9, y: -24, width: 11, height: 8, fill: '#2f3b45' }, g);
      el('line', { x1: 9, y1: -28, x2: 9, y2: -4, stroke: '#5a5a5a', 'stroke-width': 1.6 }, g);
      el('path', { d: 'M9,-6 L18,-6 M9,-9 L18,-9', stroke: '#5a5a5a', 'stroke-width': 1.4, fill: 'none' }, g);
      // A pallet on the forks about half the time — a forklift carrying
      // nothing in particular is somehow funnier than one that always is.
      if (Math.random() < 0.5) {
        el('rect', { x: 10, y: -20, width: 12, height: 11, fill: pick(['#b3411f', '#3a8c5b', '#1e3a5f']) }, g);
      }
      el('circle', { cx: -7, cy: -3, r: 3.4, fill: '#1b1b1b' }, g);
      el('circle', { cx: 5, cy: -3, r: 3.4, fill: '#1b1b1b' }, g);

      await tween({
        from: x0, to: x1, duration: rand(14000, 19000), easing: 'linear',
        onUpdate: (v) => g.setAttribute('transform', `translate(${v},${DOCK_Y}) scale(${dir},1)`),
      });
      g.remove();
    },
  });
}

if (hasMicro('harbour-cat')) {
  register({
    name: 'harbour-cat',
    category: 'ambient',
    weight: 1.3,
    phaseWeights: { dawn: 2, morning: 2, midday: 1.5, afternoon: 2, golden: 2.5, dusk: 2, night: 1 },
    cooldownMs: 260000,
    async run() {
      const d = layer('layer-dock');
      const fromLeft = Math.random() < 0.5;
      const x0 = fromLeft ? -24 : 1304;
      const dir = fromLeft ? 1 : -1;
      const sitX = rand(300, 980);

      const g = el('g', { class: 'theatre-cat', transform: `translate(${x0},${DOCK_Y}) scale(${dir},1)` }, d);
      const body = el('g', {}, g);
      el('ellipse', { cx: 0, cy: -6, rx: 8, ry: 4, fill: '#33302e' }, body);
      el('circle', { cx: 7, cy: -11, r: 3.4, fill: '#33302e' }, body);
      el('polygon', { points: '5,-14 6,-18 8,-14', fill: '#33302e' }, body);
      el('polygon', { points: '8,-14 10,-18 11,-13', fill: '#33302e' }, body);
      const tail = el('path', { d: 'M-8,-7 Q-15,-10 -13,-17', stroke: '#33302e', 'stroke-width': 2, fill: 'none' }, body);
      el('line', { x1: -4, y1: -3, x2: -4, y2: 0, stroke: '#33302e', 'stroke-width': 1.6 }, body);
      el('line', { x1: 4, y1: -3, x2: 4, y2: 0, stroke: '#33302e', 'stroke-width': 1.6 }, body);

      // Trot in, sit and look at the harbour for a while, then leave. The pause
      // is the whole event; a cat that just walks past is scenery.
      await tween({
        from: x0, to: sitX, duration: Math.abs(sitX - x0) * 9, easing: 'linear',
        onUpdate: (v) => g.setAttribute('transform', `translate(${v},${DOCK_Y}) scale(${dir},1)`),
      });

      await tween({
        from: 0, to: 1, duration: rand(6000, 11000), easing: 'linear',
        onUpdate: (t) => {
          tail.setAttribute('d',
            `M-8,-7 Q${(-15 + Math.sin(t * 22) * 3).toFixed(1)},-10 ` +
            `${(-13 + Math.sin(t * 22) * 4).toFixed(1)},-17`);
        },
      });

      const outX = dir > 0 ? 1304 : -24;
      await tween({
        from: sitX, to: outX, duration: Math.abs(outX - sitX) * 9, easing: 'linear',
        onUpdate: (v) => g.setAttribute('transform', `translate(${v},${DOCK_Y}) scale(${dir},1)`),
      });
      g.remove();
    },
  });
}

console.log('[theatre] phase events registered',
  HAS_AURORA ? '(aurora in deck)' : '(no aurora this run)',
  `micro=[${(world.micro || []).join(', ')}]`);
