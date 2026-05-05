# Podstatus Visual Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the boring podstatus web UI with a 2D shipping-yard scene where pods are containers stacked on ships, with cinematic explosion+smoke+respawn animations on chaos events.

**Architecture:** Pure-frontend overhaul. Inline SVG scene + CSS keyframes for ambient motion + a single Canvas particle layer for FX. Vanilla ES modules, no build step. Backend (`podstatus/app.py`) is **not modified** — existing `/stream_pods`, `/stream_nodes`, `/chaos` endpoints already provide everything needed.

**Tech Stack:** HTML5, CSS3 (keyframes, transforms), inline SVG, Canvas 2D, vanilla ES modules, anime.js (~7kb, vendored). Server-Sent Events (existing).

**Reference:** [Design doc](./2026-05-04-podstatus-visual-overhaul-design.md)

**Workflow notes:**
- Per project rule: **the human commits and pushes**. Do not run `git add` / `git commit`. After each task, stop and report what changed so the human can review and commit.
- Visual verification is **the human's job**. Each task lists what to look for; the human runs the dev server (see CLAUDE.md) and confirms.
- Work in the order listed. Each phase ends in a verifiable visual milestone.

---

## Phase 1: Scaffolding

### Task 1: Vendor `anime.js` and create empty JS module stubs

**Files:**
- Create: `podstatus/static/js/vendor/anime.min.js`
- Create: `podstatus/static/js/state.js`
- Create: `podstatus/static/js/scene.js`
- Create: `podstatus/static/js/effects.js`
- Create: `podstatus/static/js/animations.js`
- Create: `podstatus/static/js/main.js`

**Step 1:** Download `anime.js` v3.2.2 minified to `podstatus/static/js/vendor/anime.min.js`.

```bash
curl -L https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.min.js \
  -o podstatus/static/js/vendor/anime.min.js
```

**Step 2:** Create stubbed ES modules. Each just exports a placeholder so imports won't fail.

`podstatus/static/js/state.js`:
```javascript
// Source of truth for pods and nodes. Subscribes to SSE, emits typed events.
const bus = new EventTarget();
export const events = bus;
export const pods = new Map();   // pod-index -> {name, state, node}
export const nodes = new Map();  // hostname -> {state, ...info}

export function init() {
  console.log('[state] init (stub)');
}
```

`podstatus/static/js/scene.js`:
```javascript
// Builds and mutates the SVG scene in response to state events.
export function init() {
  console.log('[scene] init (stub)');
}
```

`podstatus/static/js/effects.js`:
```javascript
// Canvas particle pool + RAF loop for explosions, smoke, splashes.
export function init() {
  console.log('[effects] init (stub)');
}
export function emit(_opts) { /* TODO */ }
```

`podstatus/static/js/animations.js`:
```javascript
// High-level timeline orchestration (death, respawn, sail-in, etc.).
export function init() {
  console.log('[animations] init (stub)');
}
```

`podstatus/static/js/main.js`:
```javascript
import * as state from './state.js';
import * as scene from './scene.js';
import * as effects from './effects.js';
import * as animations from './animations.js';

document.addEventListener('DOMContentLoaded', () => {
  effects.init();
  scene.init();
  animations.init();
  state.init();
});
```

**Step 3:** Verify by opening browser dev tools — should see four `init (stub)` log lines once Task 2 wires it up.

**Step 4:** Stop. Report files created. Human reviews.

---

### Task 2: Replace `base.html` and `index.html` with new shell

**Files:**
- Modify: `podstatus/templates/base.html`
- Modify: `podstatus/templates/index.html`

**Step 1:** Rewrite `base.html` — drop the bg-image CSS variable hack, drop bootstrap (we no longer need it for the scene), keep htmx for compatibility but it isn't strictly needed anymore.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=1280, initial-scale=1">
    <title>VSHN Pod Status</title>
    <link rel="icon" href="{{ url_for('static', filename='favicon.png') }}">
    <link rel="stylesheet" href="{{ url_for('static', filename='css/styles.css') }}">
</head>
<body>
    {% block content %}{% endblock %}
    <script type="module" src="{{ url_for('static', filename='js/main.js') }}"></script>
</body>
</html>
```

**Step 2:** Rewrite `index.html` with the scene-shell skeleton — empty zones we'll fill in subsequent tasks.

```html
{% extends 'base.html' %}

{% block content %}
<div id="stage">
  <div id="scene">
    <!-- Layers (back-to-front), populated by scene.js -->
    <svg id="layer-sky" class="layer" viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice"></svg>
    <svg id="layer-background" class="layer" viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice"></svg>
    <svg id="layer-water" class="layer" viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice"></svg>
    <svg id="layer-dock" class="layer" viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice"></svg>
    <svg id="layer-ships" class="layer" viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice"></svg>
    <svg id="layer-foreground" class="layer" viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice"></svg>
    <canvas id="layer-fx" width="1280" height="800"></canvas>
    <div id="layer-chrome">
      <div id="vshn-logo"></div>
      <div id="qr-card"></div>
    </div>
  </div>
</div>
{% endblock %}
```

**Step 3:** Replace `podstatus/static/css/styles.css` entirely with scene foundation styles.

```css
:root {
  --stage-w: 1280px;
  --stage-h: 800px;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  width: 100%; height: 100%;
  background: #000;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  overflow: hidden;
}
#stage {
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
}
#scene {
  position: relative;
  width: var(--stage-w);
  height: var(--stage-h);
  background: linear-gradient(to bottom, #87ceeb 0%, #cfe9f5 60%, #b8d8e8 100%);
  overflow: hidden;
}
#scene .layer,
#scene #layer-fx,
#scene #layer-chrome {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  pointer-events: none;
}
#layer-fx { z-index: 50; }
#layer-chrome { z-index: 60; }

/* Auto-fit non-1280x800 displays */
@media (max-aspect-ratio: 1280/800), (min-aspect-ratio: 1280/800) {
  #scene {
    transform: scale(min(100vw / 1280, 100vh / 800));
    transform-origin: center;
  }
}
```

**Step 4:** Run dev server (human does this):
```bash
FLASK_APP="podstatus/app.py" PYTHONPATH="podstatus" uv run flask run --reload
```

Open `http://localhost:5000`. **Verify:** sky-blue gradient fills viewport, dev console shows the four `init (stub)` lines, no JS errors. SSE streams not yet wired — backend logs may show clients but UI is empty.

**Step 5:** Stop. Human reviews/commits.

---

## Phase 2: Static scene

Each task in this phase populates one SVG layer with hand-authored shapes. **All animation comes later** — at this phase we just want a beautiful still life.

### Task 3: Sky layer — clouds + sun

**Files:**
- Modify: `podstatus/static/js/scene.js`

**Step 1:** Add cloud + sun rendering helpers.

```javascript
const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

function buildSky() {
  const sky = document.getElementById('layer-sky');

  // Sun: soft radial-gradient blob upper-left
  const defs = el('defs', {}, sky);
  defs.innerHTML = `
    <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%"  stop-color="#fffbe6" stop-opacity="0.95"/>
      <stop offset="60%" stop-color="#fff2a8" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="#fff2a8" stop-opacity="0"/>
    </radialGradient>
  `;
  el('circle', { cx: 220, cy: 180, r: 180, fill: 'url(#sunGlow)' }, sky);

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

export function init() {
  buildSky();
}
```

**Step 2:** Reload page. **Verify:** soft sun glow upper-left, 4 fluffy white clouds at different positions/sizes against the blue gradient. No animation yet — clouds are stationary.

**Step 3:** Stop. Human reviews.

---

### Task 4: Background silhouette + water + dock

**Files:**
- Modify: `podstatus/static/js/scene.js`

**Step 1:** Extend `scene.js` with three more builder functions and call them from `init()`.

```javascript
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
  // Lampposts (2)
  [60, 1220].forEach(x => {
    el('line', { x1: x, y1: 700, x2: x, y2: 580, stroke: '#222', 'stroke-width': 4 }, d);
    el('circle', { cx: x, cy: 575, r: 8, fill: '#ffe9a8' }, d);
  });
}

export function init() {
  buildSky();
  buildBackground();
  buildWater();
  buildDock();
}
```

**Step 2:** Reload. **Verify:** distant hills behind, water with layered wave shapes at the bottom, brown wooden pier with bollards and lampposts. Sun + clouds still visible. Composition reads as a harbor.

**Step 3:** Stop. Human reviews.

---

### Task 5: Lighthouse silhouette

**Files:**
- Modify: `podstatus/static/js/scene.js`

**Step 1:** Add lighthouse to background layer (so ships render in front of it). Position far-right.

```javascript
function buildLighthouse() {
  const bg = document.getElementById('layer-background');
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

  // Beam — long thin triangle, low opacity, hidden until animation phase
  el('polygon', {
    id: 'lighthouse-beam',
    points: '0,25 -1200,-200 -1200,250',
    fill: 'url(#beamGradient)',
    opacity: 0.0,  // animated later
  }, g);

  // Beam gradient
  const defs = el('defs', {}, g);
  defs.innerHTML = `
    <linearGradient id="beamGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"  stop-color="#fff8c0" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#fff8c0" stop-opacity="0"/>
    </linearGradient>
  `;
}

export function init() {
  buildSky();
  buildBackground();
  buildLighthouse();
  buildWater();
  buildDock();
}
```

**Step 2:** Reload. **Verify:** white/red striped lighthouse on right side, sitting on the dock-line, rocky base at the bottom, yellow lamp room, dark roof with a small red dot. Beam invisible (opacity 0).

**Step 3:** Stop. Human reviews.

---

### Task 6: Ship SVG component (one hardcoded ship)

**Files:**
- Modify: `podstatus/static/js/scene.js`

**Step 1:** Add a `buildShip(opts)` function that takes `{x, y, name}` and creates a ship SVG group at that position. For now, hardcode-place two ships to validate the look.

```javascript
function buildShip({ id, x, y, name }) {
  const ships = document.getElementById('layer-ships');
  const g = el('g', { class: 'ship', id, 'data-name': name, transform: `translate(${x},${y})` }, ships);

  // Hull — trapezoid
  el('polygon', {
    class: 'ship-hull',
    points: '-130,0 130,0 110,40 -110,40',
    fill: '#3a4a55', stroke: '#1f2a32', 'stroke-width': 2
  }, g);
  // Deck (top of hull)
  el('rect', { x: -130, y: -8, width: 260, height: 8, fill: '#5a6a72' }, g);
  // Bridge (small cabin at the back)
  el('rect', { x: 70, y: -45, width: 50, height: 38, fill: '#dcdcdc' }, g);
  el('rect', { x: 75, y: -38, width: 12, height: 10, fill: '#7ec0e8' }, g);
  el('rect', { x: 95, y: -38, width: 12, height: 10, fill: '#7ec0e8' }, g);
  // Smokestack
  el('rect', { class: 'ship-stack', x: 105, y: -75, width: 16, height: 32, fill: '#2a2a2a' }, g);
  el('rect', { x: 103, y: -78, width: 20, height: 4, fill: '#444' }, g);
  // Bow lantern
  el('circle', { class: 'ship-lantern', cx: -118, cy: -14, r: 5, fill: '#ffe07a' }, g);

  // Name placard on hull
  el('rect', { x: -50, y: 14, width: 100, height: 16, fill: '#222', opacity: 0.7, rx: 2 }, g);
  el('text', {
    x: 0, y: 26,
    'text-anchor': 'middle',
    'font-family': 'monospace', 'font-size': 11,
    fill: '#e0e0e0',
  }, g).textContent = name;

  // Slot anchor positions (3 slots per ship deck) — used later for containers
  // We'll pin invisible markers at these coords for scene.js to query
  [-70, 0, 70].forEach((sx, i) => {
    el('circle', {
      class: 'slot-anchor', 'data-slot': i,
      cx: sx, cy: -8, r: 0,  // invisible
    }, g);
  });

  return g;
}

// Replace export init to include hardcoded test ships
export function init() {
  buildSky();
  buildBackground();
  buildLighthouse();
  buildWater();
  buildDock();
  // Test ships at fixed positions
  buildShip({ id: 'ship-test-1', x: 280, y: 700, name: 'pi-main' });
  buildShip({ id: 'ship-test-2', x: 640, y: 700, name: 'picocluster-1' });
  buildShip({ id: 'ship-test-3', x: 980, y: 700, name: 'picocluster-2' });
}
```

**Step 2:** Reload. **Verify:** three cargo ships docked across the pier, each with hull/deck/bridge/smokestack/lantern/name-placard. Ships should look distinct from the lighthouse (different color, sit on the water/dock line at y=700).

**Step 3:** Adjust positioning if ships overlap or sit wrong relative to dock. Iterate ship dimensions until satisfied.

**Step 4:** Stop. Human reviews and decides if hull color and proportions feel right (will affect later tasks).

---

### Task 7: Container SVG component

**Files:**
- Modify: `podstatus/static/js/scene.js`

**Step 1:** Add `buildContainer({index, parentShipG, slot})` that places a colored container at one of the ship's deck slot positions.

```javascript
const CONTAINER_PALETTE = [
  '#b3411f', // 0: rust-red
  '#1e3a5f', // 1: navy
  '#3a8c5b', // 2: sea-green
  '#d68a2b', // 3: orange
  '#e4ddc5', // 4: off-white
];

function buildContainer({ index, parentShipG, slot }) {
  const slotEl = parentShipG.querySelector(`[data-slot="${slot}"]`);
  if (!slotEl) return null;
  const sx = +slotEl.getAttribute('cx');

  const g = el('g', {
    class: 'pod-container',
    id: `pod-${index}`,
    'data-index': index,
    'data-state': 'Running',
    transform: `translate(${sx}, -8)`,
  }, parentShipG);

  // Container body — rectangle
  el('rect', {
    class: 'container-body',
    x: -28, y: -28, width: 56, height: 28,
    fill: CONTAINER_PALETTE[index],
    stroke: '#000', 'stroke-width': 1.5, rx: 1,
  }, g);
  // Vertical ribbing
  for (let i = -22; i <= 22; i += 6) {
    el('line', { x1: i, y1: -27, x2: i, y2: -1, stroke: '#000', 'stroke-width': 0.5, opacity: 0.3 }, g);
  }
  // Top edge highlight
  el('line', { x1: -28, y1: -28, x2: 28, y2: -28, stroke: '#fff', 'stroke-width': 1, opacity: 0.4 }, g);

  // Stenciled index — big white number
  el('text', {
    class: 'container-stencil',
    x: 0, y: -8,
    'text-anchor': 'middle',
    'font-family': '"Courier New", monospace',
    'font-size': 22, 'font-weight': 'bold',
    fill: '#ffffff', opacity: 0.85,
  }, g).textContent = String(index);

  // Pod name placard
  el('rect', { x: -32, y: 1, width: 64, height: 10, fill: '#000', opacity: 0.55, rx: 1 }, g);
  el('text', {
    class: 'pod-placard',
    x: 0, y: 9,
    'text-anchor': 'middle',
    'font-family': 'monospace', 'font-size': 7,
    fill: '#e0e0e0',
  }, g).textContent = `pod-${index}`;

  return g;
}

// Update test rendering to put containers on ships
export function init() {
  buildSky();
  buildBackground();
  buildLighthouse();
  buildWater();
  buildDock();
  const s1 = buildShip({ id: 'ship-test-1', x: 280, y: 700, name: 'pi-main' });
  const s2 = buildShip({ id: 'ship-test-2', x: 640, y: 700, name: 'picocluster-1' });
  const s3 = buildShip({ id: 'ship-test-3', x: 980, y: 700, name: 'picocluster-2' });
  // Hardcoded test placements — 5 containers across 3 ships
  buildContainer({ index: 0, parentShipG: s1, slot: 0 });
  buildContainer({ index: 1, parentShipG: s1, slot: 1 });
  buildContainer({ index: 2, parentShipG: s2, slot: 1 });
  buildContainer({ index: 3, parentShipG: s3, slot: 0 });
  buildContainer({ index: 4, parentShipG: s3, slot: 1 });
}
```

**Step 2:** Reload. **Verify:** colored containers on the ship decks with big "0"–"4" stenciled on them and small "pod-N" placards underneath. Five distinct colors.

**Step 3:** Stop. Human reviews.

---

### Task 8: VSHN logo + QR card chrome

**Files:**
- Copy: `tmp/2021_LOGO_VSHN_color.svg` → `podstatus/static/images/vshn-logo.svg`
- Generate: `podstatus/static/images/qr-boothraffle.svg` (one-shot script)
- Modify: `podstatus/static/css/styles.css`
- Modify: `podstatus/static/js/scene.js`

**Step 1:** Copy logo:
```bash
cp tmp/2021_LOGO_VSHN_color.svg podstatus/static/images/vshn-logo.svg
```

**Step 2:** Generate QR code as SVG. Run this once and commit the result:
```bash
uv run python -c "
import qrcode
import qrcode.image.svg
qr = qrcode.QRCode(border=1, box_size=8)
qr.add_data('https://vs.hn/boothraffle')
qr.make(fit=True)
img = qr.make_image(image_factory=qrcode.image.svg.SvgPathImage)
img.save('podstatus/static/images/qr-boothraffle.svg')
"
```

If `qrcode` isn't installed: `uv add --dev qrcode`. (Dev dep only — not needed at runtime.)

**Step 3:** Add chrome styles to `styles.css`:
```css
#layer-chrome { z-index: 60; }

#vshn-logo {
  position: absolute;
  top: 22px; left: 24px;
  width: 160px; height: 60px;
  background: rgba(255,255,255,0.85);
  border-radius: 8px;
  padding: 8px 14px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.15);
  background-image: url('/static/images/vshn-logo.svg');
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

#qr-card {
  position: absolute;
  top: 22px; right: 24px;
  width: 160px;
  background: rgba(255,255,255,0.92);
  border-radius: 8px;
  padding: 10px 10px 8px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.15);
  text-align: center;
}
#qr-card .qr-image {
  width: 130px; height: 130px;
  background-image: url('/static/images/qr-boothraffle.svg');
  background-size: contain;
  background-repeat: no-repeat;
  margin: 0 auto;
}
#qr-card .qr-caption {
  margin-top: 6px;
  font-size: 11px; font-weight: 600;
  color: #222;
}
```

**Step 4:** Populate chrome content in `scene.js`. Add this at the start of `init()`:
```javascript
function buildChrome() {
  const card = document.getElementById('qr-card');
  card.innerHTML = `
    <div class="qr-image" role="img" aria-label="QR code to vs.hn/boothraffle"></div>
    <div class="qr-caption">🎁 Scan to win a prize!<br><span style="font-weight:400;font-size:9px;color:#666">vs.hn/boothraffle</span></div>
  `;
}
// Call at the top of init():
buildChrome();
```

**Step 5:** Reload. **Verify:** VSHN logo top-left on a white rounded card, QR code top-right with "Scan to win a prize!" caption. Both readable against the sky.

**Step 6:** Stop. Human scans the QR with their phone to confirm it points to `https://vs.hn/boothraffle`.

---

## Phase 3: State binding

### Task 9: Wire SSE to `state.js` and emit typed events

**Files:**
- Modify: `podstatus/static/js/state.js`

**Step 1:** Implement SSE subscription and state diffing.

```javascript
const bus = new EventTarget();
export const events = bus;
export const pods = new Map();   // index -> {name, state, node}
export const nodes = new Map();  // name -> {state, kubeletVersion, ...}

function fire(type, detail) {
  bus.dispatchEvent(new CustomEvent(type, { detail }));
}

function handlePodEvent(data) {
  const index = data.index;
  if (index === 'unknown') return;  // skip pods without statefulset index
  const prev = pods.get(index);
  const next = { name: data.name, state: data.status, node: data.node };
  pods.set(index, next);

  if (!prev) {
    fire('pod:appeared', { index, ...next });
  } else if (prev.state !== next.state) {
    fire(`pod:${next.state.toLowerCase()}`, { index, prev: prev.state, ...next });
  } else if (prev.node !== next.node) {
    fire('pod:moved', { index, prevNode: prev.node, ...next });
  }
}

function handleNodeEvent(data) {
  const name = data.name;
  const prev = nodes.get(name);
  const next = {
    state: data.status,
    kubeletVersion: data.kubeletVersion,
    architecture: data.architecture,
    osImage: data.osImage,
  };
  nodes.set(name, next);

  if (!prev) {
    fire('node:joined', { name, ...next });
  } else if (prev.state !== next.state) {
    if (next.state === 'KubeletReady') fire('node:ready', { name, prev: prev.state, ...next });
    else fire('node:notready', { name, prev: prev.state, ...next });
  }
}

export function init() {
  const podsES = new EventSource('/stream_pods');
  podsES.onmessage = e => {
    try {
      const data = JSON.parse(e.data.replaceAll("'", '"'));
      handlePodEvent(data);
    } catch (err) { console.error('[state] pod parse', err, e.data); }
  };
  podsES.onerror = err => console.warn('[state] pods SSE error', err);

  const nodesES = new EventSource('/stream_nodes');
  nodesES.onmessage = e => {
    try {
      const data = JSON.parse(e.data.replaceAll("'", '"'));
      handleNodeEvent(data);
    } catch (err) { console.error('[state] node parse', err, e.data); }
  };
  nodesES.onerror = err => console.warn('[state] nodes SSE error', err);

  console.log('[state] SSE subscribed');
}
```

**Step 2:** Reload page (with backend running and pointed at a real cluster, or any cluster with the demopod statefulset). **Verify:** dev console shows no parse errors. In console: `state.pods` (after `import * as state from './state.js'`) is populated. Or simpler: add temporary debug logging:
```javascript
['pod:appeared','pod:running','pod:terminating','pod:pending','pod:failed','pod:moved','node:joined','node:ready','node:notready']
  .forEach(t => bus.addEventListener(t, e => console.log('[event]', t, e.detail)));
```

**Step 3:** Confirm events fire on real pod/node changes. Trigger `/chaos` (with auth) and watch terminating/running events stream by.

**Step 4:** Remove the temporary debug listener (or leave guarded by `?debug`). Stop. Human reviews.

---

### Task 10: `scene.js` — render dynamic ships from node events

**Files:**
- Modify: `podstatus/static/js/scene.js`

**Step 1:** Remove all hardcoded `buildShip(...)` and `buildContainer(...)` calls from `init()`. Replace with state-driven rendering.

```javascript
import { events as stateEvents, pods, nodes } from './state.js';

const SHIP_BASE_Y = 700;
const SHIP_OFF_X = 1500;  // off-screen right for sail-in
const shipEls = new Map();    // hostname -> SVGElement

function shipPositions(count) {
  // Even spacing across pier, with margins for lighthouse
  const left = 220, right = 1080;
  const span = right - left;
  const gap = count > 1 ? span / (count - 1) : 0;
  return Array.from({ length: count }, (_, i) =>
    count === 1 ? (left + right) / 2 : left + gap * i
  );
}

function reflowShips() {
  const names = Array.from(nodes.keys()).sort();  // stable order
  const positions = shipPositions(names.length);
  names.forEach((name, i) => {
    const g = shipEls.get(name);
    if (g) {
      g.setAttribute('transform', `translate(${positions[i]}, ${SHIP_BASE_Y})`);
    }
  });
}

function addShip(name) {
  if (shipEls.has(name)) return;
  // Spawn off-screen first; reflow will move it into place
  const g = buildShip({ id: `ship-${cssId(name)}`, x: SHIP_OFF_X, y: SHIP_BASE_Y, name });
  shipEls.set(name, g);
  reflowShips();
  // Animation: sail-in handled by animations.js via 'node:joined'
}

function removeShip(name) {
  const g = shipEls.get(name);
  if (!g) return;
  shipEls.delete(name);
  // Removal animation handled by animations.js; here just queue final DOM removal
  setTimeout(() => g.remove(), 3000);
  setTimeout(reflowShips, 200);  // start reflow as ship begins to leave
}

function cssId(s) { return s.replace(/[^a-zA-Z0-9_-]/g, '_'); }

export function init() {
  buildChrome();
  buildSky();
  buildBackground();
  buildLighthouse();
  buildWater();
  buildDock();

  stateEvents.addEventListener('node:joined', e => addShip(e.detail.name));
  stateEvents.addEventListener('node:notready', e => {
    const g = shipEls.get(e.detail.name);
    if (g) g.classList.add('node-stricken');
  });
  stateEvents.addEventListener('node:ready', e => {
    const g = shipEls.get(e.detail.name);
    if (g) g.classList.remove('node-stricken');
  });
  // Watch for nodes that vanish from the stream — handled in Phase 6
}
```

**Step 2:** Reload. **Verify:** with the live cluster, the correct ships appear. Each is named after the actual node (e.g., `picocluster-1`). Ships are spaced across the pier. No containers yet (next task) — decks are empty.

**Step 3:** Stop. Human reviews and confirms node hostnames render correctly.

---

### Task 11: `scene.js` — render containers from pod events

**Files:**
- Modify: `podstatus/static/js/scene.js`

**Step 1:** Add container rendering and slot allocation based on the pods' assigned ships.

```javascript
const containerEls = new Map();  // pod-index -> SVGElement
const shipSlotMap = new Map();   // hostname -> { slot0: idx, slot1: idx, slot2: idx }

function placePod(index, name, state, nodeName) {
  const shipG = shipEls.get(nodeName);
  if (!shipG) {
    // Pod's node hasn't joined yet — defer
    setTimeout(() => placePod(index, name, state, nodeName), 250);
    return;
  }

  let g = containerEls.get(index);
  if (!g) {
    // Find a free slot on this ship
    if (!shipSlotMap.has(nodeName)) shipSlotMap.set(nodeName, {});
    const slots = shipSlotMap.get(nodeName);
    let slot = -1;
    for (let i = 0; i < 3; i++) {
      if (slots[i] === undefined) { slot = i; break; }
    }
    if (slot === -1) {
      console.warn('[scene] no free slot on', nodeName, 'for pod', index);
      slot = index % 3;  // fallback overlap
    }
    slots[slot] = index;
    g = buildContainer({ index, parentShipG: shipG, slot });
    g.setAttribute('data-slot', slot);
    g.setAttribute('data-node', nodeName);
    containerEls.set(index, g);
  } else {
    // Move to new ship if node changed
    const currentNode = g.getAttribute('data-node');
    if (currentNode !== nodeName) {
      const oldShip = shipEls.get(currentNode);
      if (oldShip) {
        const oldSlot = +g.getAttribute('data-slot');
        const oldSlots = shipSlotMap.get(currentNode);
        if (oldSlots) delete oldSlots[oldSlot];
      }
      // Re-place on new ship
      g.remove();
      containerEls.delete(index);
      placePod(index, name, state, nodeName);
      return;
    }
  }

  // Apply state class
  g.setAttribute('data-state', state);
  // Update placard text in case pod name changed (statefulset shouldn't, but safe)
  const placard = g.querySelector('.pod-placard');
  if (placard) placard.textContent = name;
}

// In init(), add:
stateEvents.addEventListener('pod:appeared', e => placePod(e.detail.index, e.detail.name, e.detail.state, e.detail.node));
stateEvents.addEventListener('pod:running', e => placePod(e.detail.index, e.detail.name, e.detail.state, e.detail.node));
stateEvents.addEventListener('pod:pending', e => placePod(e.detail.index, e.detail.name, e.detail.state, e.detail.node));
stateEvents.addEventListener('pod:terminating', e => placePod(e.detail.index, e.detail.name, e.detail.state, e.detail.node));
stateEvents.addEventListener('pod:failed', e => placePod(e.detail.index, e.detail.name, e.detail.state, e.detail.node));
stateEvents.addEventListener('pod:moved', e => placePod(e.detail.index, e.detail.name, e.detail.state, e.detail.node));
```

**Step 2:** Add state CSS to `styles.css`:
```css
.pod-container { transition: opacity 0.4s; }
.pod-container[data-state="Running"]   .container-body { /* default */ }
.pod-container[data-state="Pending"]   { opacity: 0.6; }
.pod-container[data-state="Pending"]   .container-body {
  stroke: #f4c430; stroke-width: 2; stroke-dasharray: 4 3;
  animation: pendingPulse 1s ease-in-out infinite;
}
.pod-container[data-state="Terminating"] .container-body {
  stroke: #ff3030; stroke-width: 2;
  animation: terminatingFlash 0.25s linear infinite;
}
.pod-container[data-state="Failed"] .container-body {
  filter: grayscale(0.85) brightness(0.45);
}
@keyframes pendingPulse {
  0%,100% { stroke-opacity: 1; }
  50%     { stroke-opacity: 0.3; }
}
@keyframes terminatingFlash {
  0%,100% { stroke: #ff3030; }
  50%     { stroke: #ffaa00; }
}
```

**Step 3:** Reload. **Verify:** all 5 containers appear on their assigned ships, correct colors and indices, state classes apply correctly. Trigger `/chaos` and watch a container turn into Terminating (red flashing outline) → eventually a new Running container appears.

**Step 4:** Stop. Human reviews end-to-end pod lifecycle.

---

## Phase 4: Idle ambiance

Each task adds one layer of life. Stand-alone, individually verifiable.

### Task 12: Cloud drift animation

**Files:**
- Modify: `podstatus/static/css/styles.css`

**Step 1:** Add per-cloud CSS animations.
```css
.cloud { will-change: transform; }
#cloud-0 { animation: drift0 80s linear infinite; }
#cloud-1 { animation: drift1 110s linear infinite; }
#cloud-2 { animation: drift2 95s linear infinite; }
#cloud-3 { animation: drift3 130s linear infinite; }

@keyframes drift0 { from { transform: translate(180px, 110px) scale(1.0); } to { transform: translate(1380px, 110px) scale(1.0); } }
@keyframes drift1 { from { transform: translate(520px,  80px) scale(0.7); } to { transform: translate(1380px,  80px) scale(0.7); } }
@keyframes drift2 { from { transform: translate(880px, 160px) scale(1.2); } to { transform: translate(1380px, 160px) scale(1.2); } }
@keyframes drift3 { from { transform: translate(1180px, 60px) scale(0.6); } to { transform: translate(-200px,  60px) scale(0.6); } }
```

Note: SVG transforms via CSS only animate the `transform` matrix; original `transform` SVG attribute set in JS becomes the start state. The keyframes here override using the same translate/scale to keep continuity.

**Step 2:** Reload. **Verify:** clouds drift slowly across the sky at varying speeds, one moves right-to-left, others left-to-right. No visual jumps.

**Step 3:** Stop. Human reviews.

---

### Task 13: Water wave animation

**Files:**
- Modify: `podstatus/static/css/styles.css`

**Step 1:** Add wave translation.
```css
.wave { will-change: transform; }
.wave-0 { animation: waveDrift0 8s linear infinite; }
.wave-1 { animation: waveDrift1 14s linear infinite; }
.wave-2 { animation: waveDrift2 22s linear infinite; }
@keyframes waveDrift0 { from { transform: translateX(0);    } to { transform: translateX(-200px); } }
@keyframes waveDrift1 { from { transform: translateX(-50px);} to { transform: translateX(150px);  } }
@keyframes waveDrift2 { from { transform: translateX(0);    } to { transform: translateX(-100px); } }
```

**Step 2:** Reload. **Verify:** water has gentle layered horizontal motion, layers move at different speeds, no visible discontinuities at edges (the wave paths are extra-wide for this reason).

**Step 3:** Stop. Human reviews.

---

### Task 14: Ship bob

**Files:**
- Modify: `podstatus/static/css/styles.css`

**Step 1:** Add bob keyframes per ship using nth-child. Use four variants with phase-shifted offsets.
```css
.ship { will-change: transform; }
@keyframes shipBob {
  0%,100% { transform: translateY(0); }
  50%     { transform: translateY(-3px); }
}

/* Per-ship phase offset via animation-delay */
.ship:nth-child(1) { animation: shipBob 3s ease-in-out infinite; }
.ship:nth-child(2) { animation: shipBob 3.4s ease-in-out infinite -0.7s; }
.ship:nth-child(3) { animation: shipBob 3.1s ease-in-out infinite -1.3s; }
.ship:nth-child(4) { animation: shipBob 3.6s ease-in-out infinite -2.1s; }
```

**Caveat:** SVG `<g transform="translate(...)">` and a CSS `transform: translateY` on the same element may conflict on some browsers. To stay safe, wrap the ship contents in a nested `<g>` for transform composition:

In `buildShip`, change to:
```javascript
const g = el('g', { class: 'ship', id, 'data-name': name, transform: `translate(${x},${y})` }, ships);
const inner = el('g', { class: 'ship-bob' }, g);
// All ship children (hull, deck, etc.) parented to `inner` instead of `g`
```

And change the CSS selector:
```css
.ship-bob { animation: shipBob 3s ease-in-out infinite; }
.ship:nth-child(1) .ship-bob { animation-duration: 3s;   animation-delay: 0s; }
.ship:nth-child(2) .ship-bob { animation-duration: 3.4s; animation-delay: -0.7s; }
.ship:nth-child(3) .ship-bob { animation-duration: 3.1s; animation-delay: -1.3s; }
.ship:nth-child(4) .ship-bob { animation-duration: 3.6s; animation-delay: -2.1s; }
```

Then update `buildShip` to add children to the `inner` group. Adjust `buildContainer` to find `inner` (the `slot-anchor` markers should also be inside `inner` so containers inherit the bob automatically).

**Step 2:** Reload. **Verify:** ships gently bob up and down at different rates. Containers ride the bob (move with their ship). No jitter or layout shifts.

**Step 3:** Stop. Human reviews.

---

### Task 15: Lighthouse beam + blink

**Files:**
- Modify: `podstatus/static/css/styles.css`

**Step 1:**
```css
#lighthouse-beam {
  transform-origin: 0 25px;  /* relative to the lamp room */
  animation: beamSpin 8s linear infinite;
  opacity: 0.18 !important;
}
@keyframes beamSpin {
  from { transform: rotate(0deg);   }
  to   { transform: rotate(360deg); }
}
#lighthouse-blink {
  animation: blink 1s ease-in-out infinite;
}
@keyframes blink {
  0%,40%,100% { opacity: 1; }
  50%,90%     { opacity: 0.2; }
}
```

**Step 2:** Reload. **Verify:** lighthouse beam slowly rotates (full circle every 8s); red dot at top blinks at ~1Hz. Beam visible but not eye-grabbing.

**Step 3:** Stop. Human reviews.

---

### Task 16: Smokestack wisps (low-rate Canvas emitter)

**Files:**
- Modify: `podstatus/static/js/effects.js`
- Modify: `podstatus/static/js/scene.js` (to register stack positions)

**Step 1:** Implement the particle pool in `effects.js`:
```javascript
const MAX_PARTICLES = 600;
let pool = [];
let active = [];
let canvas, ctx;
let lastT = 0;
let recurringEmitters = [];

function makeParticle() {
  return {
    alive: false, type: 'smoke',
    x: 0, y: 0, vx: 0, vy: 0,
    age: 0, life: 1,
    size: 4, color: '#888',
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
  return null;  // pool exhausted
}

export function emitSmokeWisp(x, y, size = 8) {
  const p = getParticle();
  if (!p) return;
  Object.assign(p, {
    alive: true, type: 'smoke',
    x: x + (Math.random() - 0.5) * 4,
    y: y,
    vx: -8 + Math.random() * 4,        // slight leftward drift (wind)
    vy: -18 - Math.random() * 6,
    age: 0, life: 2.0 + Math.random() * 0.6,
    size: size + Math.random() * 4,
    color: '128,128,128',
    rotation: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.6,
    gravity: 0,
  });
  active.push(p);
}

export function addRecurringEmitter(fn) {
  recurringEmitters.push(fn);
}

function step(dt) {
  // Run recurring emitters
  recurringEmitters.forEach(fn => fn(dt));

  // Step particles
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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
  if (p.type === 'smoke') {
    const r = p.size * (1 + t * 3);
    const a = (1 - t) * 0.55;
    ctx.beginPath();
    ctx.fillStyle = `rgba(${p.color},${a})`;
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // (other particle types added in later tasks)
}

export function init() {
  canvas = document.getElementById('layer-fx');
  ctx = canvas.getContext('2d');

  // Match canvas internal size to scene size (1280x800)
  function loop(t) {
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
    lastT = t;
    step(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  console.log('[effects] particle loop started');
}
```

**Step 2:** Register a recurring emitter in `scene.js` once a ship is built. After `addShip(name)`:
```javascript
// In effects.js add a way to register stacks; or simpler: in scene.js
import { emitSmokeWisp, addRecurringEmitter } from './effects.js';

const stackPositions = new Map();  // hostname -> {x, y}

// In addShip(name), after the ship is created:
//   compute the smokestack tip position relative to viewBox
//   stackPositions.set(name, { ... })

// Add one global recurring emitter that walks stackPositions:
addRecurringEmitter((dt) => {
  // Each ship emits a wisp ~every 400ms; use accumulator
  for (const [name, pos] of stackPositions) {
    // Use a per-ship accumulator stored on the position object
    pos._t = (pos._t || 0) + dt;
    if (pos._t >= 0.4) {
      pos._t = 0;
      emitSmokeWisp(pos.x, pos.y, 6);
    }
  }
});
```

To get the stack's screen position, you'll need to read the SVG element's transform after layout. Easiest path: in `buildShip`, return both the group and a direct reference to the `ship-stack` rect, then compute tip-x/tip-y from the ship's `(x, y)` translation + the rect's local offset (`+105+8`, `-78`). Map that into canvas coords (canvas is 1280×800, scene viewBox is 1280×800 — they match).

```javascript
// Pseudocode in addShip:
const stackTipX = positionX + 113;   // ship local 113
const stackTipY = SHIP_BASE_Y - 80;  // ship local -80 above its origin
stackPositions.set(name, { x: stackTipX, y: stackTipY });
```

When ships reflow, update positions in `stackPositions` accordingly.

**Step 3:** Reload. **Verify:** thin gray smoke wisps rise from each ship's smokestack, drift slightly leftward (wind), fade out as they rise. ~1 wisp per ship per 400ms. No flicker.

**Step 4:** Open dev console, run `effects` is undefined (modules are private) — but check FPS via DevTools Performance tab. Should be 60fps.

**Step 5:** Stop. Human reviews.

---

### Task 17: Seagulls

**Files:**
- Modify: `podstatus/static/js/scene.js`
- Modify: `podstatus/static/css/styles.css`

**Step 1:** Add a seagull builder and 3 instances flying random arcs in the foreground layer.

```javascript
function buildSeagull(id) {
  const fg = document.getElementById('layer-foreground');
  const g = el('g', { class: 'seagull', id }, fg);
  el('path', {
    class: 'seagull-wing',
    d: 'M0,0 Q-8,-6 -16,-2 M0,0 Q8,-6 16,-2',
    stroke: '#222', 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round',
  }, g);
  return g;
}

function flySeagull(g, durationS = 14) {
  // pick random start side, random Y
  const fromLeft = Math.random() < 0.5;
  const x0 = fromLeft ? -40 : 1320;
  const x1 = fromLeft ? 1320 : -40;
  const y0 = 80 + Math.random() * 240;
  const y1 = y0 + (Math.random() - 0.5) * 80;
  const dir = fromLeft ? 1 : -1;

  g.style.transition = `transform ${durationS}s linear`;
  g.setAttribute('transform', `translate(${x0}, ${y0}) scale(${dir},1)`);
  // Force layout
  void g.getBoundingClientRect();
  g.setAttribute('transform', `translate(${x1}, ${y1}) scale(${dir},1)`);

  // Wing flap by toggling 'd' attribute via class
  g.classList.add('flapping');

  setTimeout(() => {
    g.classList.remove('flapping');
    setTimeout(() => flySeagull(g, 10 + Math.random() * 10), 5000 + Math.random() * 30000);
  }, durationS * 1000);
}

function startSeagulls() {
  for (let i = 0; i < 3; i++) {
    const g = buildSeagull(`seagull-${i}`);
    setTimeout(() => flySeagull(g), 2000 + i * 7000);
  }
}
// Call startSeagulls() at end of init()
```

Note: SVG transitions via `setAttribute('transform', ...)` don't animate via CSS `transition: transform` reliably. Easier: use CSS keyframes generated dynamically, or use anime.js (already vendored). Replace flySeagull with anime.js:

```javascript
import anime from './vendor/anime.min.js';  // anime.min.js is UMD; may need a tiny shim

// Alternative if anime.js export is awkward — script-tag include in base.html
// and use window.anime here.

function flySeagull(g) {
  const fromLeft = Math.random() < 0.5;
  const x0 = fromLeft ? -40 : 1320;
  const x1 = fromLeft ? 1320 : -40;
  const y0 = 80 + Math.random() * 240;
  const y1 = y0 + (Math.random() - 0.5) * 80;
  const dir = fromLeft ? 1 : -1;
  const dur = 10000 + Math.random() * 6000;

  let tx = x0, ty = y0;
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
      setTimeout(() => flySeagull(g), 5000 + Math.random() * 30000);
    },
  });
  g.classList.add('flapping');
  setTimeout(() => g.classList.remove('flapping'), dur);
}
```

For anime.js import: the simplest approach is a `<script src="...anime.min.js"></script>` tag in `base.html` BEFORE the module script, then reference `window.anime`:
```html
<script src="{{ url_for('static', filename='js/vendor/anime.min.js') }}"></script>
<script type="module" src="{{ url_for('static', filename='js/main.js') }}"></script>
```
And use `const anime = window.anime;` at the top of any module.

**Step 2:** Add wing-flap CSS:
```css
@keyframes wingFlap {
  0%,100% { d: path('M0,0 Q-8,-6 -16,-2 M0,0 Q8,-6 16,-2'); }
  50%     { d: path('M0,0 Q-8,2 -16,4 M0,0 Q8,2 16,4'); }
}
.seagull.flapping .seagull-wing { animation: wingFlap 0.25s ease-in-out infinite; }
```
(Note: CSS `d:` interpolation only works in newer Chromium; on Pi this should work since we're on a recent Chromium kiosk. If not, fallback: scale the wing group up/down on the Y axis.)

**Step 3:** Reload. **Verify:** every ~30-60s a seagull silhouette flies across the screen at varied heights, wings flapping. They feel rare and atmospheric, not constant.

**Step 4:** Stop. Human reviews.

---

### Task 18: Bow lantern pulse

**Files:**
- Modify: `podstatus/static/css/styles.css`

**Step 1:**
```css
.ship-lantern {
  filter: drop-shadow(0 0 4px #ffd966);
  animation: lanternPulse 4s ease-in-out infinite;
}
@keyframes lanternPulse {
  0%,100% { filter: drop-shadow(0 0 4px #ffd966); }
  50%     { filter: drop-shadow(0 0 10px #ffe89a); }
}
.ship.node-stricken .ship-lantern { animation: none; opacity: 0.3; filter: none; }
```

**Step 2:** Reload. **Verify:** each ship's bow lantern softly breathes (warm glow waxes and wanes). Visible but subtle.

**Step 3:** Stop. Human reviews.

---

## Phase 5: Pod death + respawn (the showpiece)

### Task 19: Extend particle types — debris, embers, splash, flash

**Files:**
- Modify: `podstatus/static/js/effects.js`

**Step 1:** Add emitters and corresponding draw branches.

```javascript
// Emitters
export function emitFlash(x, y) {
  const p = getParticle(); if (!p) return;
  Object.assign(p, {
    alive: true, type: 'flash',
    x, y, vx: 0, vy: 0,
    age: 0, life: 0.35,
    size: 24,
    color: '255,210,80',
    rotation: 0, vr: 0, gravity: 0,
  });
  active.push(p);
}

export function emitDebris(x, y, color = '255,255,255', count = 30) {
  for (let i = 0; i < count; i++) {
    const p = getParticle(); if (!p) return;
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 200;
    Object.assign(p, {
      alive: true, type: 'debris',
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 80,    // boost upward
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
  for (let i = 0; i < count; i++) {
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
  for (let i = 0; i < count; i++) {
    const p = getParticle(); if (!p) return;
    const angle = -Math.PI/2 + (Math.random() - 0.5) * Math.PI * 0.7;
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

// Add emitSmokeBurst for explosion smoke pillar
export function emitSmokeBurst(x, y, count = 12) {
  for (let i = 0; i < count; i++) {
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
```

**Step 2:** Extend `drawParticle`:
```javascript
function drawParticle(p) {
  const t = p.age / p.life;
  switch (p.type) {
    case 'smoke': {
      const r = p.size * (1 + t * 3);
      const a = (1 - t) * 0.65;
      ctx.beginPath();
      ctx.fillStyle = `rgba(${p.color},${a})`;
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'flash': {
      const r = p.size * (1 + t * 6);
      const a = (1 - t) * 0.85;
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grd.addColorStop(0,   `rgba(255,255,200,${a})`);
      grd.addColorStop(0.4, `rgba(255,180,40,${a*0.7})`);
      grd.addColorStop(1,   `rgba(255,80,20,0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'debris': {
      const a = 1 - t;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = `rgba(${p.color},${a})`;
      ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
      ctx.restore();
      break;
    }
    case 'ember': {
      const a = (1 - t);
      ctx.beginPath();
      ctx.fillStyle = `rgba(${p.color},${a})`;
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'splash': {
      const a = 1 - t;
      ctx.beginPath();
      ctx.fillStyle = `rgba(${p.color},${a})`;
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}
```

**Step 3:** Quick smoke test in console. After page loads, in dev console:
```javascript
// Once exposed:
import('./js/effects.js').then(fx => fx.emitDebris(640, 400, '200,80,80', 40));
```
(Easier path: temporarily call `emitDebris(640, 400, ...)` in `init()` to see one-shot.)

**Verify:** debris particles fly outward from center, fall under gravity, fade. Embers rise, fade orange. Splash droplets arc up + fall.

**Step 4:** Remove the temporary test call. Stop. Human reviews.

---

### Task 20: Death timeline in `animations.js`

**Files:**
- Modify: `podstatus/static/js/animations.js`

**Step 1:** Build the orchestrated death sequence.

```javascript
import { events as stateEvents, pods } from './state.js';
import { emitFlash, emitDebris, emitEmbers, emitSmokeBurst } from './effects.js';
const anime = window.anime;

const CONTAINER_PALETTE_RGB = [
  '179,65,31',   // 0
  '30,58,95',    // 1
  '58,140,91',   // 2
  '214,138,43',  // 3
  '228,221,197', // 4
];

const inFlight = new Map();  // pod-index -> 'dying' | 'respawning'
const queuedKill = new Set(); // pod-indexes killed during respawn

function getContainerScreenPos(index) {
  const g = document.getElementById(`pod-${index}`);
  if (!g) return null;
  const rect = g.getBoundingClientRect();
  const stage = document.getElementById('scene').getBoundingClientRect();
  // Convert from viewport to scene-local coords (scene is 1280x800)
  const scaleX = 1280 / stage.width;
  const scaleY = 800 / stage.height;
  return {
    x: (rect.left + rect.width/2 - stage.left) * scaleX,
    y: (rect.top + rect.height/2 - stage.top) * scaleY,
  };
}

function playDeath(index) {
  const g = document.getElementById(`pod-${index}`);
  if (!g) return;
  if (inFlight.get(index) === 'respawning') {
    queuedKill.add(index);
    return;
  }
  if (inFlight.get(index) === 'dying') {
    // cancel by removing g and starting fresh would be jarring; just let it run
    return;
  }
  inFlight.set(index, 'dying');

  const pos = getContainerScreenPos(index);
  const color = CONTAINER_PALETTE_RGB[index] || '200,200,200';

  // Phase 1: warning flash (300ms) — handled by Terminating CSS class which is already on
  // Phase 2: detonation
  setTimeout(() => {
    if (!pos) return;
    emitFlash(pos.x, pos.y);
    emitDebris(pos.x, pos.y, color, 38);
    emitEmbers(pos.x, pos.y, 10);
    // Container disappears
    g.style.transition = 'opacity 0.15s';
    g.style.opacity = '0';
    // Subtle screen shake
    const scene = document.getElementById('scene');
    anime({
      targets: scene,
      translateX: [
        { value: -4, duration: 30 },
        { value:  6, duration: 30 },
        { value: -3, duration: 30 },
        { value:  0, duration: 30 },
      ],
      easing: 'linear',
    });
  }, 300);

  // Phase 3: smoke pillar — 12 bursts over 1.6s
  for (let i = 0; i < 12; i++) {
    setTimeout(() => {
      if (pos) emitSmokeBurst(pos.x, pos.y, 4);
    }, 600 + i * 130);
  }

  // Phase 4: aftermath — show scorch (handled by adding class to slot in Phase 5 setup)
  // Phase 5: respawn — wait for pod:running event from K8s
  // (We don't simulate respawn ourselves; K8s does. We just wait for state events.)

  // After 4s, mark phase complete and wait for running
  setTimeout(() => {
    inFlight.set(index, 'respawning');
  }, 4000);
}

function playRespawn(index) {
  const g = document.getElementById(`pod-${index}`);
  if (!g) return;
  // Container was either removed or hidden. If hidden, show via crane lower.
  inFlight.set(index, 'respawning');

  // Crane: temporary SVG arm above the ship — animate translateY for the container
  g.style.opacity = '1';
  // Start above its target Y by 200px
  const baseTransform = g.getAttribute('transform') || '';
  const match = baseTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
  const tx = match ? parseFloat(match[1]) : 0;
  const ty = match ? parseFloat(match[2]) : 0;

  anime({
    targets: { y: ty - 220 },
    y: ty,
    duration: 1400,
    easing: 'easeOutBounce',
    update: anim => {
      const v = anim.animatables[0].target;
      g.setAttribute('transform', `translate(${tx}, ${v.y})`);
    },
    complete: () => {
      // Green flash
      const body = g.querySelector('.container-body');
      if (body) {
        body.style.filter = 'drop-shadow(0 0 12px #2ee87b)';
        setTimeout(() => { body.style.filter = ''; }, 400);
      }
      inFlight.delete(index);
      // Process queued kill
      if (queuedKill.has(index)) {
        queuedKill.delete(index);
        setTimeout(() => playDeath(index), 100);
      }
    }
  });
}

export function init() {
  stateEvents.addEventListener('pod:terminating', e => playDeath(e.detail.index));
  stateEvents.addEventListener('pod:running', e => {
    // If we just respawned (was dying), play crane animation
    if (inFlight.get(e.detail.index) === 'respawning') {
      playRespawn(e.detail.index);
    }
  });
  stateEvents.addEventListener('pod:appeared', e => {
    // First time we see pod, no crane. Already handled by scene.js placement.
  });
  console.log('[animations] init');
}
```

**Step 2:** Reload. Trigger `/chaos` (e.g., `curl -u user:pass http://localhost:5000/chaos`). **Verify:**
- Container flashes red (Terminating)
- ~300ms later: explosion flash + debris in container color + embers
- Smoke billows up over ~2s
- Subtle screen shake
- After K8s respawns the pod (typically 2-5s), the new container drops in from above with a bounce and brief green glow
- Rapid-fire chaos works on different containers in parallel

**Step 3:** Tune timings if anything feels off. Stop. Human reviews on Pi to confirm performance.

---

### Task 21: Scorch mark on the deck slot

**Files:**
- Modify: `podstatus/static/js/scene.js`
- Modify: `podstatus/static/js/animations.js`

**Step 1:** In `scene.js`, add a helper to show/hide a scorch mark at a slot position on a ship.

```javascript
function showScorch(shipName, slot) {
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
  // Auto-fade after respawn — caller toggles via hideScorch
}
function hideScorch(shipName, slot) {
  const ship = shipEls.get(shipName);
  if (!ship) return;
  const inner = ship.querySelector('.ship-bob') || ship;
  const scorch = inner.querySelector(`.scorch-${slot}`);
  if (scorch) {
    scorch.style.transition = 'opacity 0.6s';
    scorch.style.opacity = '0';
    setTimeout(() => scorch.remove(), 700);
  }
}
// Export them
export { showScorch, hideScorch };
```

**Step 2:** Call them in `animations.js`. After the explosion, show scorch; in `playRespawn` complete, hide it.

```javascript
import { showScorch, hideScorch } from './scene.js';

// In playDeath, after 600ms:
setTimeout(() => {
  const pod = pods.get(index);
  const g = document.getElementById(`pod-${index}`);
  if (pod && g) showScorch(pod.node, +g.getAttribute('data-slot'));
}, 600);

// In playRespawn complete:
const pod = pods.get(index);
if (pod && g) hideScorch(pod.node, +g.getAttribute('data-slot'));
```

**Step 3:** Reload. Trigger chaos. **Verify:** after explosion, a dark scorch ellipse remains on the deck slot. When the new container lands, scorch fades away.

**Step 4:** Stop. Human reviews.

---

## Phase 6: Node lifecycle

### Task 22: Sail-in animation on `node:joined`

**Files:**
- Modify: `podstatus/static/js/animations.js`
- Modify: `podstatus/static/js/scene.js`

**Step 1:** In `scene.js`, when adding a ship, leave it at off-screen X. Expose `setShipX(name, x)` and a list of target positions.

```javascript
// Refactor reflowShips to expose target positions
let targetShipX = new Map();   // name -> targetX
function computeTargets() {
  const names = Array.from(nodes.keys()).sort();
  const positions = shipPositions(names.length);
  targetShipX.clear();
  names.forEach((n, i) => targetShipX.set(n, positions[i]));
  return targetShipX;
}
export function getShipTargetX(name) { return targetShipX.get(name); }
export function getShipEl(name) { return shipEls.get(name); }
```

**Step 2:** In `animations.js`, listen to `node:joined`, sail the new ship in from off-screen, then move existing ships toward their new targets concurrently.

```javascript
import { getShipTargetX, getShipEl } from './scene.js';
import { emitSplash, emitSmokeBurst } from './effects.js';

stateEvents.addEventListener('node:joined', e => {
  const name = e.detail.name;
  // Reflow targets are computed by scene.js when node added; trigger animations now
  const ship = getShipEl(name);
  if (!ship) return;
  const target = getShipTargetX(name);

  // Animate this ship in from off-screen
  anime({
    targets: { x: 1500 },
    x: target,
    duration: 2000,
    easing: 'easeOutCubic',
    update: a => {
      const v = a.animatables[0].target;
      ship.setAttribute('transform', `translate(${v.x}, 700)`);
    },
    complete: () => {
      // Splash at waterline
      emitSplash(target, 720, 18);
      // Horn puff smoke ring at smokestack
      emitSmokeBurst(target + 13, 620, 6);
    }
  });

  // Reflow others
  for (const [n, t] of targetShipX) {
    if (n === name) continue;
    const other = getShipEl(n);
    if (!other) continue;
    const cur = (other.getAttribute('transform').match(/translate\(([^,]+)/) || [0,0])[1];
    anime({
      targets: { x: parseFloat(cur) },
      x: t,
      duration: 1000,
      easing: 'easeInOutCubic',
      update: a => {
        const v = a.animatables[0].target;
        other.setAttribute('transform', `translate(${v.x}, 700)`);
      },
    });
  }
});
```

**Step 3:** Reload. Simulate a node joining (e.g., add a node to the K3s cluster, or drop and re-create the demopod statefulset's pod-N to make K8s reschedule). **Verify:** ship sails in from the right edge, splash particles fly up at the waterline, smokestack puffs a single white smoke ring. Existing ships slide to make room over ~1s.

**Step 4:** Stop. Human reviews.

---

### Task 23: List + sink + recovery

**Files:**
- Modify: `podstatus/static/js/animations.js`
- Modify: `podstatus/static/css/styles.css`

**Step 1:** Add CSS for stricken state.
```css
.ship.node-stricken .ship-hull { fill: #2a3540; }
.ship.node-stricken .ship-bob {
  animation: shipList 4s ease-in-out forwards;
}
@keyframes shipList {
  from { transform: translate(0, 0) rotate(0); }
  to   { transform: translate(0, 30px) rotate(10deg); }
}
.ship .ship-bob { transform-origin: center bottom; }
.ship.node-stricken .ship-stack ~ * { /* darker smoke handled in JS */ }
```

**Step 2:** In `animations.js`, on `node:notready` switch the ship's recurring smokestack emitter to dark/dense; on `node:ready`, restore.

```javascript
// Track per-ship emitter config in scene.js stackPositions
import { stackPositions } from './scene.js';   // export it

stateEvents.addEventListener('node:notready', e => {
  const cfg = stackPositions.get(e.detail.name);
  if (cfg) cfg.dark = true;
});
stateEvents.addEventListener('node:ready', e => {
  const cfg = stackPositions.get(e.detail.name);
  if (cfg) cfg.dark = false;
});
```

In `effects.js` `emitSmokeWisp`, accept a flag:
```javascript
export function emitSmokeWisp(x, y, size = 8, dark = false) {
  // ... same as before but
  color: dark ? '20,20,20' : '128,128,128',
  // ... and increase rate via caller
}
```

In `scene.js` recurring emitter, pass `cfg.dark`:
```javascript
addRecurringEmitter((dt) => {
  for (const [name, pos] of stackPositions) {
    pos._t = (pos._t || 0) + dt;
    const interval = pos.dark ? 0.18 : 0.4;
    if (pos._t >= interval) {
      pos._t = 0;
      emitSmokeWisp(pos.x, pos.y, pos.dark ? 9 : 6, pos.dark);
    }
  }
});
```

**Step 3:** Reload. Manually `kubectl drain` or stop a node to make K8s flag it `NotReady`. **Verify:** ship lists 10° to one side, sinks ~30px, hull darkens, lantern goes dark, smokestack belches denser black smoke. When node returns: reverse all of this over ~1.5s.

**Step 4:** Stop. Human reviews.

---

### Task 24: Full sink on node disappearance

**Files:**
- Modify: `podstatus/static/js/state.js`
- Modify: `podstatus/static/js/scene.js`
- Modify: `podstatus/static/js/animations.js`

**Step 1:** Detect node disappearance. K8s SSE doesn't send DELETE-style events for removed nodes by default; the watch's DELETED event is sent though — add it to the parser.

In the existing backend `app.py`, the SSE just streams every event without filtering. Inspect what `event["type"]` is for DELETED nodes — it's `"DELETED"`. We don't currently send the type. Easiest workaround: in `state.js`, run a heartbeat that detects nodes which haven't shown up in the last N seconds and treat them as gone.

Actually cleaner: modify the backend to include event type. But the project rule for this overhaul says backend stays untouched. So: pure-frontend heuristic.

```javascript
// In state.js
const NODE_TIMEOUT_MS = 60000;
function reapDeadNodes() {
  const now = Date.now();
  for (const [name, n] of nodes) {
    if (now - (n.lastSeen || 0) > NODE_TIMEOUT_MS) {
      nodes.delete(name);
      fire('node:gone', { name });
    }
  }
}
setInterval(reapDeadNodes, 10000);

// In handleNodeEvent, set lastSeen = Date.now()
```

This is imperfect (60s lag) but keeps the spec. Alternative for later: tweak backend to include event type. Out of scope here.

**Step 2:** Handle `node:gone` in `animations.js`:
```javascript
stateEvents.addEventListener('node:gone', e => {
  const ship = getShipEl(e.detail.name);
  if (!ship) return;
  // Sink animation
  anime({
    targets: { y: 700, r: 10 },
    y: 850, r: 35,
    duration: 2500,
    easing: 'easeInQuad',
    update: a => {
      const v = a.animatables[0].target;
      const inner = ship.querySelector('.ship-bob') || ship;
      inner.setAttribute('transform', `translate(0, ${v.y - 700}) rotate(${v.r})`);
    },
    complete: () => {
      // Splash, then remove
      const pos = getShipTargetX(e.detail.name) || 640;
      emitSplash(pos, 730, 30);
      ship.remove();
    }
  });
});
```

**Step 3:** Hook to `scene.js` to clean up state:
```javascript
stateEvents.addEventListener('node:gone', e => {
  shipEls.delete(e.detail.name);
  stackPositions.delete(e.detail.name);
  computeTargets();
  // Reflow remaining ships (animation handled in animations.js)
});
```

**Step 4:** Reload. Permanently delete a node from the cluster and wait ~60s. **Verify:** ship lists past 30°, slides below the waterline over 2.5s, splash burst at the end, then removed from DOM. Remaining ships re-center.

**Step 5:** Stop. Human reviews.

---

## Phase 7: Polish & perf

### Task 25: `prefers-reduced-motion`

**Files:**
- Modify: `podstatus/static/css/styles.css`
- Modify: `podstatus/static/js/animations.js`

**Step 1:**
```css
@media (prefers-reduced-motion: reduce) {
  .cloud, .wave, .ship-bob, #lighthouse-beam { animation: none !important; }
}
```

**Step 2:** In `animations.js`, gate the screen shake:
```javascript
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Only run anime() screen-shake if !reducedMotion
```

**Step 3:** Toggle in DevTools (Rendering panel → Emulate CSS prefers-reduced-motion: reduce). **Verify:** clouds, waves, ship bob, lighthouse beam all freeze. Death sequence still happens but without screen shake; respawn loses the bounce ease (or not — bounce is fine, it's not vestibular).

**Step 4:** Stop. Human reviews.

---

### Task 26: Auto-degrade particle count under low FPS

**Files:**
- Modify: `podstatus/static/js/effects.js`

**Step 1:** Track rolling average FPS and reduce emission counts when below 30fps.

```javascript
let fpsAvg = 60;
let qualityScale = 1.0;  // 1.0 = full, 0.5 = half particles

function updateQuality(dt) {
  const fps = 1 / Math.max(dt, 0.001);
  fpsAvg = fpsAvg * 0.95 + fps * 0.05;
  if (fpsAvg < 25 && qualityScale > 0.4) qualityScale -= 0.05;
  else if (fpsAvg > 45 && qualityScale < 1.0) qualityScale += 0.02;
  qualityScale = Math.max(0.4, Math.min(1.0, qualityScale));
}

// In step(dt): updateQuality(dt);
// In each emitter, multiply count: count = Math.round(count * qualityScale);
```

**Step 2:** Stress test on Pi: trigger chaos rapidly on multiple pods. **Verify:** no slowdown, no UI freezing. Particle counts subtly reduce if FPS drops, recover when load eases.

**Step 3:** Stop. Human reviews on actual Pi.

---

### Task 27: Final cleanup & old asset removal

**Files:**
- Delete: `podstatus/static/images/background.png` (if no longer referenced)
- Delete: `podstatus/static/images/background-k8up.png` (if no longer referenced)
- Delete: `podstatus/static/images/logo.png` (replaced by SVG)
- Modify: `podstatus/app.py` — remove `inject_background` context processor (no longer used)
- Modify: `podstatus/config.py` — remove `BACKGROUND_IMAGE` config (no longer used) — verify not used elsewhere first

**Step 1:** Confirm none of the old static images are referenced:
```bash
grep -rn "background\.png\|background-k8up\.png\|logo\.png" podstatus/
```

**Step 2:** Delete unreferenced files. Remove `inject_background` from `app.py` if `{{ background_image }}` is no longer used in any template (it isn't after Task 2).

**Step 3:** Remove `BACKGROUND_IMAGE` from `config.py` only if grep confirms zero references.

**Step 4:** Final visual review on Pi: run all states (Running, Pending, Terminating chains, node-NotReady, node-Ready). Verify nothing broken.

**Step 5:** Stop. Human reviews and commits. Update CLAUDE.md if any new patterns deserve documentation.

---

## Verification checklist (final)

Before declaring done, the human should confirm on the Pi 5 kiosk display:

- [ ] Scene loads without errors at 1280×800
- [ ] All 5 containers visible on correct ships, with correct colors and indices
- [ ] VSHN logo and QR code visible and readable; QR scans to `https://vs.hn/boothraffle`
- [ ] Idle ambiance: clouds, waves, ships bobbing, lighthouse beam, occasional seagulls — all run smooth at 60fps
- [ ] Red-button press → on-screen explosion fires within ~50ms of SSE Terminating event
- [ ] Multiple rapid chaos events animate in parallel without dropping frames
- [ ] Pod respawn: container drops back into place with bounce + green flash
- [ ] Node join: ship sails in from right with splash; existing ships reflow
- [ ] Node NotReady: ship lists, sinks slightly, smokestack darkens
- [ ] Node Ready (recovery): ship rights itself
- [ ] Long-running session (1+ hour): no memory leak, no FPS drop
- [ ] Physical fog machine + BlinkSticks still work as before (untouched)

---

## Deferred / out-of-scope

- Audio effects
- Day/night cycle
- Kill-counter easter egg
- Additional death-sequence variants (sinking, seagull-snatch)
- Backend modification to send SSE event types (would simplify Task 24)
