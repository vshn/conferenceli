// Builds and mutates the SVG scene in response to state events.
import { events as stateEvents, pods, nodes } from './state.js';
import { addRecurringEmitter, emitSmokeWisp } from './effects.js';
import { world } from './theatre/seed.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Monotonic counter used to stagger the ship bob animations.
let shipSeq = 0;

function el(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

function buildSky() {
  const sky = document.getElementById('layer-sky');
  const nightLayer = document.getElementById('layer-night-additive');

  // Sun gradient (lives in sky for the daytime sun)
  const defs = el('defs', {}, sky);
  defs.innerHTML = `
    <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%"  stop-color="#fffbe6" stop-opacity="0.95"/>
      <stop offset="60%" stop-color="#fff2a8" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="#fff2a8" stop-opacity="0"/>
    </radialGradient>
  `;
  // Sun (visible in day mode, in the sky layer underneath the overlay)
  // Sun/moon sit at the same spot, low enough that the moon's glow clears the
  // bottom of the VSHN logo card (y 146).
  el('circle', { class: 'sun', cx: 220, cy: 205, r: 180, fill: 'url(#sunGlow)' }, sky);

  // Moon, stars, and night-additive defs live ABOVE the night-overlay so they
  // shine through the dimming.
  const ndefs = el('defs', {}, nightLayer);
  ndefs.innerHTML = `
    <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%"  stop-color="#f5f3e0" stop-opacity="0.95"/>
      <stop offset="55%" stop-color="#dfdcc6" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#bcb89d" stop-opacity="0"/>
    </radialGradient>
  `;
  const moon = el('g', { class: 'moon', transform: 'translate(220, 205)' }, nightLayer);
  el('circle', { cx: 0, cy: 0, r: 90, fill: 'url(#moonGlow)' }, moon);
  el('circle', { cx: 0, cy: 0, r: 36, fill: '#f1eedb' }, moon);
  // Moon craters
  el('circle', { cx: -10, cy:  -6, r: 5, fill: '#cfcab0', opacity: 0.7 }, moon);
  el('circle', { cx:  12, cy:   4, r: 3, fill: '#cfcab0', opacity: 0.6 }, moon);
  el('circle', { cx:  -4, cy:  12, r: 3, fill: '#cfcab0', opacity: 0.6 }, moon);

  // Stars — small twinkling dots scattered across the upper sky. Positions are
  // seeded (seed.js keeps them clear of the chrome boxes and stops them
  // clumping), so each conference gets its own sky.
  world.stars.forEach((s, i) => {
    el('circle', {
      class: `star star-${s.cls}`,
      cx: s.x.toFixed(1), cy: s.y.toFixed(1), r: s.r.toFixed(2),
      fill: '#fdfdf2',
    }, nightLayer);
  });

  // Clouds — seeded count, positions, scales and drift speeds. Because the
  // positions vary per seed, the drift keyframes can't live in styles.css as
  // static rules; they're generated here into one injected stylesheet.
  let css = '';
  world.clouds.forEach((c, i) => {
    const g = el('g', {
      class: 'cloud', id: `cloud-${i}`,
      transform: `translate(${c.x.toFixed(1)},${c.y.toFixed(1)}) scale(${c.scale.toFixed(2)})`,
      opacity: c.opacity.toFixed(2),
    }, sky);
    el('ellipse', { cx: 0,   cy: 0,  rx: 50, ry: 22, fill: '#ffffff' }, g);
    el('ellipse', { cx: 35,  cy: -8, rx: 40, ry: 26, fill: '#ffffff' }, g);
    el('ellipse', { cx: -30, cy: 4,  rx: 38, ry: 20, fill: '#f5fafe' }, g);
    if (c.puffs > 3) {
      el('ellipse', { cx: 8, cy: 10, rx: 30, ry: 15, fill: '#eef6fc' }, g);
    }

    // Travel far enough off both edges that the wrap is never visible.
    const from = c.dir > 0 ? -220 : 1400;
    const to = c.dir > 0 ? 1400 : -220;
    css += `@keyframes cloudDrift${i} {\n` +
      `  from { transform: translate(${from}px, ${c.y.toFixed(1)}px) scale(${c.scale.toFixed(2)}); }\n` +
      `  to   { transform: translate(${to}px, ${c.y.toFixed(1)}px) scale(${c.scale.toFixed(2)}); }\n` +
      `}\n` +
      `#cloud-${i} { animation: cloudDrift${i} ${c.durationS.toFixed(0)}s linear infinite; ` +
      `animation-delay: -${(c.durationS * Math.abs(c.x + 220) / 1620).toFixed(1)}s; }\n`;
  });
  const styleEl = document.createElement('style');
  styleEl.id = 'seeded-cloud-drift';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}

function buildBackground() {
  const bg = document.getElementById('layer-background');

  // Far ridge — seeded coastline. Drawn first so the city stands on it.
  el('path', { class: 'hill-far', d: world.farRidge.d, fill: '#7d99a6' }, bg);

  buildSkyline(bg);

  // Near ridge covers the base of the city, which is what gives the harbour
  // its sense of depth rather than reading as one flat cut-out.
  el('path', { class: 'hill-near', d: world.nearRidge.d, fill: '#5a7b8a' }, bg);
}

// Seeded city silhouette plus individually-addressable windows. The buildings
// live in the background layer so they dim with dusk; the windows go into the
// night-additive layer so they shine *through* the dimming — the same trick the
// lampposts and the lighthouse beam already use.
function buildSkyline(bg) {
  const nightLayer = document.getElementById('layer-night-additive');
  const windowGroup = el('g', { id: 'skyline-windows' }, nightLayer);

  for (const b of world.skyline) {
    const g = el('g', { class: 'skyline-building' }, bg);
    el('rect', {
      x: b.x.toFixed(1), y: b.y.toFixed(1),
      width: b.w.toFixed(1), height: (b.groundY - b.y + 6).toFixed(1),
    }, g);

    switch (b.roof) {
      case 'step':
        el('rect', {
          x: (b.x + b.w * 0.25).toFixed(1), y: (b.y - 10).toFixed(1),
          width: (b.w * 0.5).toFixed(1), height: 10,
        }, g);
        break;
      case 'pitch':
        el('polygon', {
          points: `${b.x.toFixed(1)},${b.y.toFixed(1)} ` +
                  `${(b.x + b.w / 2).toFixed(1)},${(b.y - 14).toFixed(1)} ` +
                  `${(b.x + b.w).toFixed(1)},${b.y.toFixed(1)}`,
        }, g);
        break;
      case 'antenna':
        el('rect', {
          x: (b.x + b.w / 2 - 0.8).toFixed(1), y: (b.y - 22).toFixed(1),
          width: 1.6, height: 22,
        }, g);
        break;
    }

    for (const w of b.windows) {
      el('rect', {
        class: 'skyline-window',
        'data-thresh': w.thresh.toFixed(3),
        x: w.x.toFixed(1), y: w.y.toFixed(1),
        width: 4, height: 6,
      }, windowGroup);
    }
  }
}

function buildLighthouse() {
  const bg = document.getElementById('layer-background');
  const nightLayer = document.getElementById('layer-night-additive');
  const lx = world.lighthouseX.toFixed(1);
  const g = el('g', { id: 'lighthouse', transform: `translate(${lx}, 360)` }, bg);

  // Rocky base
  el('path', { d: 'M-30,200 Q-20,180 0,178 Q20,180 30,200 Z', fill: '#4a4a4a' }, g);
  // Tower body — striped white/red
  el('rect', { x: -16, y: 30, width: 32, height: 170, fill: '#ffffff' }, g);
  el('rect', { x: -16, y: 60,  width: 32, height: 24, fill: '#cc2a2a' }, g);
  el('rect', { x: -16, y: 110, width: 32, height: 24, fill: '#cc2a2a' }, g);
  el('rect', { x: -16, y: 160, width: 32, height: 24, fill: '#cc2a2a' }, g);
  // Lamp room
  el('rect', { x: -22, y: 16, width: 44, height: 18, fill: '#f7d96b' }, g);
  el('rect', { x: -24, y: 12, width: 48, height: 4, fill: '#222' }, g);
  // Roof
  el('polygon', { points: '-20,12 20,12 0,-8', fill: '#222' }, g);
  // Tiny red blinker dot at peak
  el('circle', { id: 'lighthouse-blink', cx: 0, cy: -10, r: 3, fill: '#ff3030' }, g);

  // Kubernetes flag flying above the lighthouse — the K8s logo is a ship's
  // helm, so it fits the nautical theme: this lighthouse guides the pod-ships
  // home under the Kubernetes flag.
  // Pole height is bounded by the QR card above it: the card hangs down to
  // y~236 in scene coords, so the flag has to start below that (pivot -100 =>
  // y 260). The pole's foot stays at -13, on the lamp room roof.
  el('rect', { x: -1, y: -103, width: 2, height: 90, fill: '#7a7a7a' }, g);
  el('circle', { cx: 0, cy: -106, r: 3.2, fill: '#bdbdbd' }, g);
  const flagPivot = el('g', { transform: 'translate(1, -100)' }, g);
  const flag = el('g', { id: 'lighthouse-flag' }, flagPivot);

  // Sinusoidal traveling-wave path. Amplitude grows linearly from the pole
  // (anchored, t=0) to the free edge (t=1) so the fabric "snaps" away from
  // the staff. Twelve evenly-spaced phase samples loop seamlessly because
  // phase[0]=0 and phase[12]=2π yield identical paths.
  const FLAG_W = 72, FLAG_H = 36, FLAG_TILT = 2;
  const WAVE_AMP = 4.5, WAVELENGTH = 50, WAVE_FRAMES = 12, WAVE_DUR = '2.2s';
  const segs = 10;
  const phases = Array.from({ length: WAVE_FRAMES + 1 }, (_, i) => (i / WAVE_FRAMES) * 2 * Math.PI);
  const flagPathFor = (phase) => {
    let d = '';
    for (let i = 0; i <= segs; i++) {
      const x = (i / segs) * FLAG_W;
      const t = x / FLAG_W;
      const y = FLAG_TILT * t + (WAVE_AMP * t) * Math.sin((2 * Math.PI * x) / WAVELENGTH + phase);
      d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
    }
    for (let i = segs; i >= 0; i--) {
      const x = (i / segs) * FLAG_W;
      const t = x / FLAG_W;
      const y = FLAG_H + FLAG_TILT * t + (WAVE_AMP * t) * Math.sin((2 * Math.PI * x) / WAVELENGTH + phase);
      d += 'L' + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
    }
    return d + 'Z';
  };
  const flagDValues = phases.map(flagPathFor);
  const flagPath = el('path', {
    d: flagDValues[0],
    fill: '#326ce5', stroke: '#1f4ea3', 'stroke-width': 1,
  }, flag);
  el('animate', {
    attributeName: 'd',
    values: flagDValues.join(';'),
    dur: WAVE_DUR,
    repeatCount: 'indefinite',
  }, flagPath);

  // K8s logo "rides" the wave at its own x so it doesn't visually detach
  // from the fabric. We translate the logo group by the wave's y at x=fcx.
  const fcx = 36, fcy = 19, fr = 13;
  const logoT = fcx / FLAG_W;
  const logoAmp = WAVE_AMP * logoT;
  const logoTransformValues = phases.map((p) =>
    `0 ${(logoAmp * Math.sin((2 * Math.PI * fcx) / WAVELENGTH + p)).toFixed(2)}`
  ).join(';');
  const logoGroup = el('g', { id: 'lighthouse-flag-logo' }, flag);
  el('animateTransform', {
    attributeName: 'transform',
    type: 'translate',
    values: logoTransformValues,
    dur: WAVE_DUR,
    repeatCount: 'indefinite',
  }, logoGroup);

  const heptaPts = [];
  for (let i = 0; i < 7; i++) {
    const a = i * (2 * Math.PI / 7) - Math.PI / 2;
    heptaPts.push(`${(fcx + fr * Math.cos(a)).toFixed(2)},${(fcy + fr * Math.sin(a)).toFixed(2)}`);
  }
  el('polygon', {
    points: heptaPts.join(' '),
    fill: 'none', stroke: '#fff', 'stroke-width': 1.8,
  }, logoGroup);
  for (let i = 0; i < 7; i++) {
    const a = i * (2 * Math.PI / 7) - Math.PI / 2;
    el('line', {
      x1: fcx, y1: fcy,
      x2: (fcx + fr * Math.cos(a)).toFixed(2),
      y2: (fcy + fr * Math.sin(a)).toFixed(2),
      stroke: '#fff', 'stroke-width': 1.2,
    }, logoGroup);
  }
  el('circle', { cx: fcx, cy: fcy, r: 3, fill: 'none', stroke: '#fff', 'stroke-width': 1.5 }, logoGroup);

  // Beam + gradient go into the night-additive layer so the rotating beam
  // shines through the dusk overlay. Wrapped in the same translate as the
  // lighthouse so coords stay relative to the lamp room.
  // The polygon's bbox spans x=[-1200, 0]: 0% offset = far tip, 100% = lamp.
  // Stops are arranged so the beam is brightest at the source and fades to
  // zero well before reaching the scene edge, eliminating the hard cutoff.
  const beamGroup = el('g', { transform: `translate(${lx}, 360)` }, nightLayer);
  const ndefs = el('defs', {}, beamGroup);
  ndefs.innerHTML = `
    <linearGradient id="beamGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#fff8c0" stop-opacity="0"/>
      <stop offset="35%"  stop-color="#fff8c0" stop-opacity="0.12"/>
      <stop offset="70%"  stop-color="#fffae0" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#fffbe6" stop-opacity="0.85"/>
    </linearGradient>
    <filter id="beamSoft" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
  `;
  el('polygon', {
    id: 'lighthouse-beam',
    points: '0,25 -1200,-200 -1200,250',
    fill: 'url(#beamGradient)',
    filter: 'url(#beamSoft)',
    opacity: 0.0,  // animated via CSS (off in day, on in night)
  }, beamGroup);
}

function buildWater() {
  const w = document.getElementById('layer-water');

  const defs = el('defs', {}, w);
  defs.innerHTML = `
    <linearGradient id="glitterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#fff6cf" stop-opacity="0.85"/>
      <stop offset="45%"  stop-color="#ffe9a0" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="#ffe9a0" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="lightReflectGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#fff8c0" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#fff8c0" stop-opacity="0"/>
    </linearGradient>
  `;

  // Base water rectangle. Colour comes from the Director's phase palette.
  el('rect', { class: 'water-base', x: 0, y: 720, width: 1280, height: 80 }, w);

  // 3 wave layers (paths) for parallax. Crests are kept above y=752 so all
  // three stay visible once the bottom bleed is cropped.
  [724, 738, 752].forEach((y, i) => {
    el('path', {
      class: `wave wave-${i}`,
      d: `M-200,${y} Q-100,${y-4} 0,${y} T200,${y} T400,${y} T600,${y} T800,${y} T1000,${y} T1200,${y} T1400,${y} T1600,${y} L1600,800 L-200,800 Z`,
      opacity: 0.7,
    }, w);
  });

  // Sun/moon glitter column. The Director slides it horizontally so it always
  // sits directly below whichever body is in the sky — the single cheapest cue
  // that the light source has moved.
  el('path', {
    id: 'sun-glitter',
    d: 'M-34,722 L34,722 L104,800 L-104,800 Z',
    fill: 'url(#glitterGrad)',
    transform: 'translate(640, 0)',
  }, w);

  // Lighthouse reflection — an authored stripe rather than a mirrored copy.
  // The lighthouse lives in the background layer, which the opaque water rect
  // covers, so a <use> clone would have to cross SVG roots to be visible.
  el('rect', {
    id: 'lighthouse-reflection',
    x: (world.lighthouseX - 7).toFixed(1), y: 722, width: 14, height: 70,
    fill: 'url(#lightReflectGrad)',
  }, w);

  // Water glints — small white highlights fading in/out. Wrapped in a group so
  // the phase palette can scale them all at once without fighting the
  // per-glint opacity keyframes.
  const glints = el('g', { class: 'water-glints' }, w);
  const glintXs = [120, 360, 580, 760, 980, 1180];
  glintXs.forEach((cx, i) => {
    el('ellipse', {
      class: `water-glint glint-${i}`,
      cx, cy: 736 + (i % 2 === 0 ? 0 : 12),
      rx: 4, ry: 1,
      fill: '#ffffff',
      opacity: 0,
    }, glints);
  });

  // Seeded buoys — permanent scenery rather than events, so the harbour has
  // something bobbing in it even when nothing is happening.
  world.buoys.forEach((b, i) => {
    const g = el('g', {
      class: `buoy buoy-${i % 3}`,
      transform: `translate(${b.x.toFixed(1)}, ${b.y.toFixed(1)})`,
    }, w);
    el('ellipse', { cx: 0, cy: 4, rx: 9, ry: 2.5, fill: '#0d2a3a', opacity: 0.35 }, g);
    el('path', { d: 'M-6,2 L6,2 L4,-8 L-4,-8 Z', fill: b.color, stroke: '#1a1a1a', 'stroke-width': 0.6 }, g);
    el('rect', { x: -0.8, y: -16, width: 1.6, height: 8, fill: '#33333a' }, g);
    el('circle', { class: 'buoy-lamp', cx: 0, cy: -17, r: 1.8, fill: '#ffd36a' }, g);
  });
}

function buildDock() {
  const d = document.getElementById('layer-dock');

  // Pier surface
  el('rect', { x: 0, y: 700, width: 1280, height: 24, fill: '#6e4f2c' }, d);
  // Wood planks (vertical lines)
  for (let x = 0; x < 1280; x += 60) {
    el('line', { x1: x, y1: 700, x2: x, y2: 724, stroke: '#4a3318', 'stroke-width': 2, opacity: 0.5 }, d);
  }
  // Bollards (mooring posts)
  [120, 460, 820, 1160].forEach(x => {
    el('rect', { x: x-8, y: 686, width: 16, height: 18, fill: '#3d3d3d', rx: 2 }, d);
    el('ellipse', { cx: x, cy: 686, rx: 10, ry: 4, fill: '#555' }, d);
  });
  // Lampposts: posts stay in dock layer (dim with dusk), bulbs go to the
  // night-additive layer so they glow through the overlay.
  const nightLayer = document.getElementById('layer-night-additive');
  [60, 1220].forEach(x => {
    el('line', { x1: x, y1: 700, x2: x, y2: 580, stroke: '#222', 'stroke-width': 4 }, d);
    el('circle', { class: 'lamppost-bulb', cx: x, cy: 575, r: 8, fill: '#ffe9a8' }, nightLayer);
  });
}

function buildShip({ id, x, y, name }) {
  const ships = document.getElementById('layer-ships');
  const g = el('g', { class: 'ship', id, 'data-name': name, transform: `translate(${x},${y})` }, ships);
  // Inner group for bob animation (so the outer translate stays stable).
  // The bob stagger used to come from :nth-child rules in styles.css, but the
  // reflections host and its <defs> now sit ahead of the ships in this layer,
  // which shifted every index. A per-ship counter is immune to that.
  const inner = el('g', { class: 'ship-bob' }, g);
  const seq = shipSeq++ % 4;
  inner.style.animationDuration = `${(3 + seq * 0.2).toFixed(1)}s`;
  inner.style.animationDelay = `-${(seq * 0.7).toFixed(1)}s`;

  // Hull — trapezoid (compact: 240 wide so 4 ships fit without overlap)
  el('polygon', {
    class: 'ship-hull',
    points: '-120,0 120,0 100,42 -100,42',
    fill: '#3a4a55', stroke: '#1f2a32', 'stroke-width': 2
  }, inner);
  // Deck (top of hull)
  el('rect', { x: -120, y: -8, width: 240, height: 8, fill: '#5a6a72' }, inner);
  // Bridge (cabin at the back-right; containers may overlap this — looks like stacked cargo)
  el('rect', { x: 78, y: -46, width: 40, height: 38, fill: '#dcdcdc' }, inner);
  el('rect', { x: 83, y: -39, width: 10, height: 9, fill: '#7ec0e8' }, inner);
  el('rect', { x: 100, y: -39, width: 10, height: 9, fill: '#7ec0e8' }, inner);
  // Smokestack
  el('rect', { class: 'ship-stack', x: 100, y: -76, width: 14, height: 30, fill: '#2a2a2a' }, inner);
  el('rect', { x: 98, y: -79, width: 18, height: 4, fill: '#444' }, inner);
  // Bow lantern
  el('circle', { class: 'ship-lantern', cx: -110, cy: -16, r: 6, fill: '#ffe07a' }, inner);

  // Name placard on hull
  el('rect', { x: -50, y: 14, width: 100, height: 18, fill: '#222', opacity: 0.7, rx: 2 }, inner);
  el('text', {
    x: 0, y: 27,
    'text-anchor': 'middle',
    'font-family': 'monospace', 'font-size': 12,
    fill: '#e0e0e0',
  }, inner).textContent = name;

  // 3 slot anchors — spaced for 70-wide containers
  [-72, 0, 72].forEach((sx, i) => {
    el('circle', {
      class: 'slot-anchor', 'data-slot': i,
      cx: sx, cy: -8, r: 0,  // invisible
    }, inner);
  });

  return g;
}

const CONTAINER_PALETTE = [
  '#b3411f', // 0: rust-red
  '#1e3a5f', // 1: navy
  '#3a8c5b', // 2: sea-green
  '#d68a2b', // 3: orange
  '#e4ddc5', // 4: off-white
];

function buildContainer({ index, parentShipG, slot }) {
  const inner = parentShipG.querySelector('.ship-bob') || parentShipG;
  const slotEl = inner.querySelector(`[data-slot="${slot}"]`);
  if (!slotEl) return null;
  const sx = +slotEl.getAttribute('cx');

  const g = el('g', {
    class: 'pod-container',
    id: `pod-${index}`,
    'data-index': index,
    'data-state': 'Running',
    transform: `translate(${sx}, -8)`,
  }, inner);
  // Inner group for state-driven CSS transforms (shake/scale on Terminating)
  // so we don't conflict with the outer slot-position translate.
  const cinner = el('g', { class: 'container-inner' }, g);

  // Container body — 70×46
  el('rect', {
    class: 'container-body',
    x: -35, y: -46, width: 70, height: 46,
    fill: CONTAINER_PALETTE[index],
    stroke: '#000', 'stroke-width': 1.5, rx: 1,
  }, cinner);
  // Vertical ribbing
  for (let i = -28; i <= 28; i += 7) {
    el('line', { x1: i, y1: -44, x2: i, y2: -2, stroke: '#000', 'stroke-width': 0.6, opacity: 0.3 }, cinner);
  }
  // Top edge highlight
  el('line', { x1: -35, y1: -46, x2: 35, y2: -46, stroke: '#fff', 'stroke-width': 1.2, opacity: 0.45 }, cinner);

  // Stenciled index — big white number (the only label we want)
  el('text', {
    class: 'container-stencil',
    x: 0, y: -23,
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    'font-family': '"Courier New", monospace',
    'font-size': 30, 'font-weight': 'bold',
    fill: '#ffffff', opacity: 0.92,
  }, cinner).textContent = String(index);

  return g;
}

function buildSeagull(id) {
  const fg = document.getElementById('layer-foreground');
  const g = el('g', { class: 'seagull', id }, fg);
  el('path', {
    class: 'seagull-wing',
    d: 'M0,0 Q-8,-6 -16,-2 M0,0 Q8,-6 16,-2',
  }, g);
  return g;
}

function flySeagull(g) {
  const anime = window.anime;
  if (!anime) {
    // Fallback: simple CSS-less translation via attribute
    setTimeout(() => flySeagull(g), 8000);
    return;
  }
  const fromLeft = Math.random() < 0.5;
  const x0 = fromLeft ? -40 : 1320;
  const x1 = fromLeft ? 1320 : -40;
  const y0 = 80 + Math.random() * 240;
  const y1 = y0 + (Math.random() - 0.5) * 80;
  const dir = fromLeft ? 1 : -1;
  const dur = 10000 + Math.random() * 6000;

  anime({
    targets: { x: x0, y: y0 },
    x: x1, y: y1,
    duration: dur,
    easing: 'linear',
    update: anim => {
      const v = anim.animatables[0].target;
      g.setAttribute('transform', `translate(${v.x}, ${v.y}) scale(${dir},1)`);
    },
    complete: () => {
      g.classList.remove('flapping');
      setTimeout(() => flySeagull(g), 5000 + Math.random() * 30000);
    },
  });
  g.classList.add('flapping');
}

function startSeagulls() {
  for (let i = 0; i < 3; i++) {
    const g = buildSeagull(`seagull-${i}`);
    setTimeout(() => flySeagull(g), 2000 + i * 7000);
  }
}

// The conference line is operator-editable at runtime, so it's exported for
// the Director to refresh when a `booth` update arrives — no reload needed for
// a rename, only for a change that regenerates the world.
export function setConferenceLabel(text) {
  const el = document.querySelector('#harbour-name .hn-conference');
  if (!el) return;
  el.textContent = text || '';
  // An empty conference name would otherwise leave a gap above the port name.
  el.style.display = text ? '' : 'none';
}

// Waterline the reflections mirror about, and how much they're squashed to
// suggest a viewing angle rather than a perfect mirror.
const WATERLINE_Y = 724;
const REFLECT_SQUASH = 0.6;

// Host group for ship reflections. It has to live inside the *same* SVG root as
// the ships: <use> across the separate layer SVGs is inconsistently supported,
// so everything mirrored this way is deliberately kept in layer-ships. Being in
// the ships layer also puts the reflections above the opaque water rect, which
// is exactly where a reflection belongs.
function buildReflectionHost() {
  const ships = document.getElementById('layer-ships');

  const defs = el('defs', {}, ships);
  const clip = el('clipPath', { id: 'waterClip' }, defs);
  el('rect', { x: 0, y: WATERLINE_Y + 2, width: 1280, height: 76 }, clip);

  // Outer group carries the CSS wobble, inner carries the mirror transform —
  // a CSS animation on `transform` would otherwise overwrite the mirror.
  const outer = el('g', { id: 'ship-reflections', 'clip-path': 'url(#waterClip)' }, ships);
  el('g', {
    id: 'ship-reflections-mirror',
    transform: `translate(0, ${(WATERLINE_Y * (1 + REFLECT_SQUASH)).toFixed(1)}) ` +
               `scale(1, -${REFLECT_SQUASH})`,
  }, outer);
}

function addShipReflection(name) {
  const mirror = document.getElementById('ship-reflections-mirror');
  if (!mirror) return;
  const u = document.createElementNS(SVG_NS, 'use');
  u.setAttribute('href', `#ship-${cssId(name)}`);
  u.setAttribute('id', `reflect-${cssId(name)}`);
  mirror.appendChild(u);
}

function removeShipReflection(name) {
  const u = document.getElementById(`reflect-${cssId(name)}`);
  if (u && u.parentNode) u.remove();
}

function buildChrome() {
  setConferenceLabel(document.body?.dataset?.conference || '');

  const portEl = document.querySelector('#harbour-name .hn-port');
  if (portEl) portEl.textContent = world.name;

  const card = document.getElementById('qr-card');
  card.innerHTML = `
    <div class="qr-image" role="img" aria-label="QR code to vs.hn/boothraffle"></div>
    <div class="qr-caption">🎁 Scan to win a prize!<br><span style="font-weight:400;font-size:9px;color:#666">vs.hn/boothraffle</span></div>
  `;
}

// === Dynamic state binding ===

const SHIP_BASE_Y = 700;
const SHIP_OFF_X = 1500;  // off-screen right for sail-in
const shipEls = new Map();           // hostname -> SVGElement
const containerEls = new Map();      // pod-index -> SVGElement
const shipSlotMap = new Map();       // hostname -> { slot0: idx, slot1: idx, slot2: idx }
export const stackPositions = new Map();  // hostname -> {x, y, _t, dark}
let targetShipX = new Map();         // name -> targetX

function cssId(s) { return s.replace(/[^a-zA-Z0-9_-]/g, '_'); }

function shipPositions(count) {
  const left = 220, right = 1080;
  const span = right - left;
  const gap = count > 1 ? span / (count - 1) : 0;
  return Array.from({ length: count }, (_, i) =>
    count === 1 ? (left + right) / 2 : left + gap * i
  );
}

function computeTargets() {
  const names = Array.from(nodes.keys()).sort();
  const positions = shipPositions(names.length);
  targetShipX.clear();
  names.forEach((n, i) => targetShipX.set(n, positions[i]));
  return targetShipX;
}

function reflowShips() {
  computeTargets();
  for (const [name, x] of targetShipX) {
    const g = shipEls.get(name);
    if (g) {
      g.setAttribute('transform', `translate(${x}, ${SHIP_BASE_Y})`);
    }
    const stack = stackPositions.get(name);
    if (stack) stack.x = x + 107;
  }
}

function addShip(name) {
  if (shipEls.has(name)) return;
  // Spawn off-screen first; reflow will move it (animations.js handles sail-in)
  const g = buildShip({ id: `ship-${cssId(name)}`, x: SHIP_OFF_X, y: SHIP_BASE_Y, name });
  shipEls.set(name, g);
  addShipReflection(name);
  // Smokestack tip in scene-local coords (ship at y=700, stack rect y=-78, x offset ~113)
  stackPositions.set(name, { x: SHIP_OFF_X + 107, y: SHIP_BASE_Y - 76, _t: 0, dark: false });
  reflowShips();
}

function removeShip(name) {
  const g = shipEls.get(name);
  if (!g) return;
  shipEls.delete(name);
  stackPositions.delete(name);
  shipSlotMap.delete(name);
  removeShipReflection(name);
  // Drop any container entries that lived on this ship; their DOM nodes will
  // be removed when the ship's group is removed below.
  for (const [idx, gC] of containerEls) {
    if (gC.getAttribute('data-node') === name) containerEls.delete(idx);
  }
  // Final DOM removal deferred for sink animation in animations.js
  setTimeout(() => { if (g.parentNode) g.remove(); }, 3000);
  setTimeout(reflowShips, 200);
}

function placePod(index, name, state, nodeName) {
  const shipG = shipEls.get(nodeName);
  if (!shipG) {
    // Pod's node hasn't joined yet — defer
    setTimeout(() => placePod(index, name, state, nodeName), 250);
    return;
  }

  let g = containerEls.get(index);
  if (!g) {
    if (!shipSlotMap.has(nodeName)) shipSlotMap.set(nodeName, {});
    const slots = shipSlotMap.get(nodeName);
    let slot = -1;
    for (let i = 0; i < 3; i++) {
      if (slots[i] === undefined) { slot = i; break; }
    }
    if (slot === -1) {
      console.warn('[scene] no free slot on', nodeName, 'for pod', index);
      slot = index % 3;
    }
    slots[slot] = index;
    g = buildContainer({ index, parentShipG: shipG, slot });
    if (g) {
      g.setAttribute('data-slot', slot);
      g.setAttribute('data-node', nodeName);
      containerEls.set(index, g);
    }
  } else {
    const currentNode = g.getAttribute('data-node');
    if (currentNode !== nodeName) {
      // Free the old slot whether the old ship still exists or not — its
      // shipSlotMap entry can outlive the ship for the few seconds the sink
      // animation is in flight.
      const oldSlot = +g.getAttribute('data-slot');
      const oldSlots = shipSlotMap.get(currentNode);
      if (oldSlots) delete oldSlots[oldSlot];
      g.remove();
      containerEls.delete(index);
      placePod(index, name, state, nodeName);
      return;
    }
  }

  if (g) {
    g.setAttribute('data-state', state);
  }
}

export function getShipEl(name) { return shipEls.get(name); }
export function getShipTargetX(name) { return targetShipX.get(name); }

export function showScorch(shipName, slot) {
  const ship = shipEls.get(shipName);
  if (!ship) return;
  const inner = ship.querySelector('.ship-bob') || ship;
  const anchor = inner.querySelector(`[data-slot="${slot}"]`);
  if (!anchor) return;
  const sx = +anchor.getAttribute('cx');

  let scorch = inner.querySelector(`.scorch-${slot}`);
  if (!scorch) {
    scorch = el('ellipse', {
      class: `scorch scorch-${slot}`,
      cx: sx, cy: -7, rx: 26, ry: 5,
      fill: '#1a0e08', opacity: 0.65,
    }, inner);
  }
  scorch.style.opacity = '0.65';

  // Flickering flame on the scorched slot — fades on its own ~3s in (aftermath).
  let flame = inner.querySelector(`.flame-${slot}`);
  if (!flame) {
    flame = el('g', {
      class: `flame flame-${slot}`,
      transform: `translate(${sx}, -8)`,
    }, inner);
    // Soft glow disc casting light onto the deck around the base.
    el('ellipse', {
      class: 'flame-glow',
      cx: 0, cy: -2, rx: 26, ry: 9,
      fill: '#ff8c1a', opacity: 0.35,
    }, flame);
    // Outer flame body — ~2.4x larger than before, reaches ~52px tall.
    el('path', {
      class: 'flame-outer',
      d: 'M0,0 Q-17,-22 -7,-44 Q0,-56 7,-44 Q17,-22 0,0 Z',
      fill: '#ff8c1a', opacity: 0.92,
    }, flame);
    // Mid orange layer for depth.
    el('path', {
      class: 'flame-mid',
      d: 'M0,-2 Q-11,-18 -4,-34 Q0,-44 4,-34 Q11,-18 0,-2 Z',
      fill: '#ffb347', opacity: 0.95,
    }, flame);
    // Bright inner core.
    el('path', {
      class: 'flame-inner',
      d: 'M0,-4 Q-6,-14 -2,-28 Q0,-36 2,-28 Q6,-14 0,-4 Z',
      fill: '#ffe066', opacity: 0.98,
    }, flame);
    // Auto-fade after smoke phase ends (per design Phase 4 aftermath)
    setTimeout(() => {
      if (flame.isConnected) {
        flame.style.transition = 'opacity 0.8s';
        flame.style.opacity = '0';
        setTimeout(() => { if (flame.parentNode) flame.remove(); }, 900);
      }
    }, 3000);
  }
  flame.style.opacity = '1';
}
export function hideScorch(shipName, slot) {
  const ship = shipEls.get(shipName);
  if (!ship) return;
  const inner = ship.querySelector('.ship-bob') || ship;
  const scorch = inner.querySelector(`.scorch-${slot}`);
  if (scorch) {
    scorch.style.transition = 'opacity 0.6s';
    scorch.style.opacity = '0';
    setTimeout(() => scorch.remove(), 700);
  }
  const flame = inner.querySelector(`.flame-${slot}`);
  if (flame) {
    flame.style.transition = 'opacity 0.4s';
    flame.style.opacity = '0';
    setTimeout(() => flame.remove(), 500);
  }
}

export function init() {
  buildChrome();
  buildSky();
  buildBackground();
  buildLighthouse();
  buildWater();
  buildDock();
  buildReflectionHost();
  startSeagulls();

  // The `night-mode` class is owned by the Director, which resolves the manual
  // override and the wall-clock arc into one effective phase. Toggling it here
  // too would mean two writers fighting over the same class.

  // Recurring smokestack emitters — one global registration walks all ships
  addRecurringEmitter((dt) => {
    for (const [_name, pos] of stackPositions) {
      pos._t = (pos._t || 0) + dt;
      const interval = pos.dark ? 0.18 : 0.4;
      if (pos._t >= interval) {
        pos._t = 0;
        emitSmokeWisp(pos.x, pos.y, pos.dark ? 9 : 6, pos.dark);
      }
    }
  });

  // Wire up state events
  stateEvents.addEventListener('node:joined', e => addShip(e.detail.name));
  stateEvents.addEventListener('node:notready', e => {
    const g = shipEls.get(e.detail.name);
    if (g) g.classList.add('node-stricken');
    const cfg = stackPositions.get(e.detail.name);
    if (cfg) cfg.dark = true;
  });
  stateEvents.addEventListener('node:ready', e => {
    const g = shipEls.get(e.detail.name);
    if (g) g.classList.remove('node-stricken');
    const cfg = stackPositions.get(e.detail.name);
    if (cfg) cfg.dark = false;
  });
  stateEvents.addEventListener('node:gone', e => {
    removeShip(e.detail.name);
  });

  const podHandler = e =>
    placePod(e.detail.index, e.detail.name, e.detail.state, e.detail.node);
  stateEvents.addEventListener('pod:appeared', podHandler);
  stateEvents.addEventListener('pod:running', podHandler);
  stateEvents.addEventListener('pod:pending', podHandler);
  stateEvents.addEventListener('pod:terminating', podHandler);
  stateEvents.addEventListener('pod:failed', podHandler);
  stateEvents.addEventListener('pod:moved', podHandler);
}
