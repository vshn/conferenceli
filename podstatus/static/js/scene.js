// Builds and mutates the SVG scene in response to state events.
import { events as stateEvents, pods, nodes, mode } from './state.js';
import { addRecurringEmitter, emitSmokeWisp } from './effects.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

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
  el('circle', { class: 'sun', cx: 220, cy: 180, r: 180, fill: 'url(#sunGlow)' }, sky);

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
  const moon = el('g', { class: 'moon', transform: 'translate(220, 180)' }, nightLayer);
  el('circle', { cx: 0, cy: 0, r: 90, fill: 'url(#moonGlow)' }, moon);
  el('circle', { cx: 0, cy: 0, r: 36, fill: '#f1eedb' }, moon);
  // Moon craters
  el('circle', { cx: -10, cy:  -6, r: 5, fill: '#cfcab0', opacity: 0.7 }, moon);
  el('circle', { cx:  12, cy:   4, r: 3, fill: '#cfcab0', opacity: 0.6 }, moon);
  el('circle', { cx:  -4, cy:  12, r: 3, fill: '#cfcab0', opacity: 0.6 }, moon);

  // Stars — small twinkling dots scattered across the upper sky (night-only)
  const starPositions = [
    [120,  60], [410,  40], [560,  90], [720,  50], [860, 30], [1040, 70],
    [1170, 130], [330, 130], [480, 150], [640, 120], [970, 150], [1140, 30],
  ];
  starPositions.forEach(([cx, cy], i) => {
    el('circle', {
      class: `star star-${i % 4}`,
      cx, cy, r: 1 + (i % 3) * 0.4,
      fill: '#fdfdf2',
      opacity: 0,
    }, nightLayer);
  });

  // Clouds — 4 puffy ellipsoid clusters at different scales/Y
  const clouds = [
    { x: 180,  y: 110, scale: 1.0, opacity: 0.85 },
    { x: 520,  y: 80,  scale: 0.7, opacity: 0.75 },
    { x: 880,  y: 160, scale: 1.2, opacity: 0.90 },
    { x: 1180, y: 60,  scale: 0.6, opacity: 0.70 },
  ];
  clouds.forEach((c, i) => {
    const g = el('g', {
      class: 'cloud', id: `cloud-${i}`,
      transform: `translate(${c.x},${c.y}) scale(${c.scale})`,
      opacity: c.opacity,
    }, sky);
    // 3 overlapping ellipses make a fluffy cloud
    el('ellipse', { cx: 0,   cy: 0,  rx: 50, ry: 22, fill: '#ffffff' }, g);
    el('ellipse', { cx: 35,  cy: -8, rx: 40, ry: 26, fill: '#ffffff' }, g);
    el('ellipse', { cx: -30, cy: 4,  rx: 38, ry: 20, fill: '#f5fafe' }, g);
  });
}

function buildBackground() {
  const bg = document.getElementById('layer-background');
  // Distant hills/harbor silhouette — desaturated darker shape
  el('path', {
    d: 'M0,520 Q150,470 320,500 T640,490 T960,500 T1280,485 L1280,560 L0,560 Z',
    fill: '#7d99a6', opacity: 0.55
  }, bg);
  el('path', {
    d: 'M0,560 Q200,540 400,555 T800,545 T1280,560 L1280,600 L0,600 Z',
    fill: '#5a7b8a', opacity: 0.7
  }, bg);
}

function buildLighthouse() {
  const bg = document.getElementById('layer-background');
  const nightLayer = document.getElementById('layer-night-additive');
  const g = el('g', { id: 'lighthouse', transform: 'translate(1180, 360)' }, bg);

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

  // Beam + gradient go into the night-additive layer so the rotating beam
  // shines through the dusk overlay. Wrapped in the same translate as the
  // lighthouse so coords stay relative to the lamp room.
  const beamGroup = el('g', { transform: 'translate(1180, 360)' }, nightLayer);
  const ndefs = el('defs', {}, beamGroup);
  ndefs.innerHTML = `
    <linearGradient id="beamGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"  stop-color="#fff8c0" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#fff8c0" stop-opacity="0"/>
    </linearGradient>
  `;
  el('polygon', {
    id: 'lighthouse-beam',
    points: '0,25 -1200,-200 -1200,250',
    fill: 'url(#beamGradient)',
    opacity: 0.0,  // animated via CSS
  }, beamGroup);
}

function buildWater() {
  const w = document.getElementById('layer-water');

  // Base water rectangle
  el('rect', { x: 0, y: 720, width: 1280, height: 80, fill: '#2b6e8f' }, w);

  // 3 wave layers (paths) for parallax — animation added later
  const waveColors = ['#4a8caa', '#3a7d9a', '#2b6e8f'];
  [725, 745, 765].forEach((y, i) => {
    el('path', {
      class: `wave wave-${i}`,
      d: `M-200,${y} Q-100,${y-4} 0,${y} T200,${y} T400,${y} T600,${y} T800,${y} T1000,${y} T1200,${y} T1400,${y} T1600,${y} L1600,800 L-200,800 Z`,
      fill: waveColors[i],
      opacity: 0.7,
    }, w);
  });

  // Water glints — small white highlights fading in/out at random positions
  const glintXs = [120, 360, 580, 760, 980, 1180];
  glintXs.forEach((cx, i) => {
    el('ellipse', {
      class: `water-glint glint-${i}`,
      cx, cy: 740 + (i % 2 === 0 ? 0 : 14),
      rx: 4, ry: 1,
      fill: '#ffffff',
      opacity: 0,
    }, w);
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
  // Inner group for bob animation (so the outer translate stays stable)
  const inner = el('g', { class: 'ship-bob' }, g);

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

function buildChrome() {
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

function applyMode(m) {
  const scene = document.getElementById('scene');
  if (!scene) return;
  if (m === 'night') scene.classList.add('night-mode');
  else scene.classList.remove('night-mode');
}

export function init() {
  buildChrome();
  buildSky();
  buildBackground();
  buildLighthouse();
  buildWater();
  buildDock();
  startSeagulls();

  applyMode(mode.value);
  stateEvents.addEventListener('mode:change', e => applyMode(e.detail.mode));

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
