// High-level timeline orchestration (death, respawn, sail-in, etc.).
import { events as stateEvents, pods, nodes } from './state.js';
import {
  emitFlash, emitDebris, emitEmbers, emitSmokeBurst, emitSplash,
} from './effects.js';
import {
  getShipEl, getShipTargetX, showScorch, hideScorch, stackPositions,
} from './scene.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const CONTAINER_PALETTE_RGB = [
  '179,65,31',   // 0
  '30,58,95',    // 1
  '58,140,91',   // 2
  '214,138,43',  // 3
  '228,221,197', // 4
];

// State machine per pod-index:
//   undefined         -> idle
//   'dying'           -> death effects in progress (~2.5s)
//   'awaiting-respawn'-> death effects done, waiting for K8s pod:running event
//   'respawning'      -> crane lowering animation in progress
const inFlight = new Map();
const pendingRespawn = new Set();  // pod:running arrived while still dying
const queuedKill = new Set();      // pod:terminating arrived while respawning

function getContainerScreenPos(index) {
  const g = document.getElementById(`pod-${index}`);
  if (!g) return null;
  const rect = g.getBoundingClientRect();
  const stage = document.getElementById('scene').getBoundingClientRect();
  if (stage.width === 0 || stage.height === 0) return null;
  const scaleX = 1280 / stage.width;
  const scaleY = 800 / stage.height;
  return {
    x: (rect.left + rect.width / 2 - stage.left) * scaleX,
    y: (rect.top + rect.height / 2 - stage.top) * scaleY,
  };
}

// Weighted so the three originals stay the common case — the new variants are
// the surprise, and a surprise that happens every other press isn't one.
const DEATH_VARIANTS = [
  { name: 'explode', weight: 3 },
  { name: 'topple', weight: 2.5 },
  { name: 'crumple', weight: 2.5 },
  { name: 'overboard', weight: 2 },
  { name: 'crushed', weight: 1.5 },
  { name: 'dematerialise', weight: 1.5 },
  { name: 'launched', weight: 1.2 },
];

// Variants that leave fire behind. The rest leave a clean deck.
const FIERY_VARIANTS = new Set(['explode', 'topple', 'crumple', 'crushed']);

function pickDeathVariant() {
  const total = DEATH_VARIANTS.reduce((s, v) => s + v.weight, 0);
  let r = Math.random() * total;
  for (const v of DEATH_VARIANTS) {
    r -= v.weight;
    if (r <= 0) return v.name;
  }
  return 'explode';
}

// --- Detached sprites ----------------------------------------------------

// Several death variants need the container to leave the ship entirely: fall
// into the water, fly off-stage, be crushed from above. Animating the real
// element can't do that — it's parented to the ship's bob group, so its
// coordinates are ship-local and it inherits the bob. Instead the real one is
// hidden and a free-flying copy is dropped into the foreground layer, where it
// can be animated in plain scene coordinates.
function detachContainerSprite(g, index, pos) {
  const fg = document.getElementById('layer-foreground');
  if (!fg || !pos) return null;
  const sprite = document.createElementNS(SVG_NS, 'g');
  sprite.setAttribute('class', 'detached-container');
  sprite.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
  // The cargo art is centred on its own origin here (the shared builder anchors
  // at the top edge, which is what the delivery animations want instead).
  const art = buildCargoArt(index);
  art.setAttribute('transform', 'translate(0, -23)');
  sprite.appendChild(art);
  fg.appendChild(sprite);

  g.style.transition = 'opacity 0.08s';
  g.style.opacity = '0';
  return sprite;
}

const WATERLINE = 724;

// Floating wreckage: a few planks that drift with the current and slowly go
// under. The aftermath is what makes a kill feel like it happened to a place
// rather than to a sprite.
function spawnFloatingDebris(x, color) {
  const w = document.getElementById('layer-water');
  if (!w || !window.anime) return;
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const plank = document.createElementNS(SVG_NS, 'rect');
    const px = x + (Math.random() - 0.5) * 70;
    plank.setAttribute('x', '-9');
    plank.setAttribute('y', '-2');
    plank.setAttribute('width', String(12 + Math.random() * 10));
    plank.setAttribute('height', '3.5');
    plank.setAttribute('fill', `rgb(${color})`);
    plank.setAttribute('opacity', '0.9');
    plank.setAttribute('transform', `translate(${px}, ${WATERLINE + 6 + Math.random() * 14})`);
    w.appendChild(plank);

    const drift = (Math.random() - 0.5) * 120;
    const life = 14000 + Math.random() * 10000;
    window.anime({
      targets: { t: 0 },
      t: 1,
      duration: life,
      easing: 'linear',
      update: a => {
        const t = a.animatables[0].target.t;
        const y = WATERLINE + 6 + t * 26;
        plank.setAttribute('transform',
          `translate(${px + drift * t}, ${y}) rotate(${Math.sin(t * 9) * 12})`);
        plank.setAttribute('opacity', String(0.9 * (1 - t)));
      },
      complete: () => { if (plank.parentNode) plank.remove(); },
    });
  }
}

// A slick that spreads and then disperses. Catches the sunset nicely because
// its fill is tied to the phase palette rather than being a fixed grey.
function spawnOilSlick(x) {
  const w = document.getElementById('layer-water');
  if (!w || !window.anime) return;
  const slick = document.createElementNS(SVG_NS, 'ellipse');
  slick.setAttribute('class', 'oil-slick');
  slick.setAttribute('cx', String(x));
  slick.setAttribute('cy', String(WATERLINE + 14));
  slick.setAttribute('rx', '6');
  slick.setAttribute('ry', '2');
  w.appendChild(slick);

  window.anime({
    targets: { r: 6, o: 0.5 },
    r: 64, o: 0,
    duration: 26000,
    easing: 'easeOutQuad',
    update: a => {
      const v = a.animatables[0].target;
      slick.setAttribute('rx', v.r.toFixed(1));
      slick.setAttribute('ry', (v.r * 0.3).toFixed(1));
      slick.style.opacity = v.o.toFixed(3);
    },
    complete: () => { if (slick.parentNode) slick.remove(); },
  });
}

// --- New death variants --------------------------------------------------

function playOverboard(g, pos, color, anime) {
  if (!anime || reducedMotion || !pos) return playExplode(g, pos, color, anime);
  const sprite = detachContainerSprite(g, +g.getAttribute('data-index'), pos);
  if (!sprite) return playExplode(g, pos, color, anime);

  const dir = Math.random() < 0.5 ? -1 : 1;
  const splashX = pos.x + dir * 120;

  anime({
    targets: { x: pos.x, y: pos.y, r: 0 },
    x: splashX,
    y: WATERLINE + 4,
    r: dir * 70,
    duration: 900,
    easing: 'easeInQuad',
    update: a => {
      const v = a.animatables[0].target;
      sprite.setAttribute('transform', `translate(${v.x}, ${v.y}) rotate(${v.r})`);
    },
    complete: () => {
      emitSplash(splashX, WATERLINE + 2, 34);
      emitSmokeBurst(splashX, WATERLINE - 10, 5);

      // Bob once, then go under. Bubbles mark the spot after it's gone.
      anime({
        targets: { y: WATERLINE + 4, o: 1 },
        y: WATERLINE + 46,
        o: 0,
        duration: 2400,
        easing: 'easeInQuad',
        update: a => {
          const v = a.animatables[0].target;
          sprite.setAttribute('transform',
            `translate(${splashX}, ${v.y}) rotate(${dir * 70 + (1 - v.o) * 30})`);
          sprite.style.opacity = v.o.toFixed(2);
        },
        complete: () => {
          if (sprite.parentNode) sprite.remove();
          for (let i = 0; i < 5; i++) {
            setTimeout(() => emitSplash(splashX + (Math.random() - 0.5) * 20, WATERLINE + 6, 3), i * 260);
          }
        },
      });

      spawnFloatingDebris(splashX, color);
      spawnOilSlick(splashX);
    },
  });
}

function playCrushed(g, pos, color, anime) {
  const cinner = g.querySelector('.container-inner');
  if (!cinner || !anime || reducedMotion || !pos) return playExplode(g, pos, color, anime);

  // A crane block drops in from above the stage and flattens the container.
  const fg = document.getElementById('layer-foreground');
  const block = document.createElementNS(SVG_NS, 'g');
  block.setAttribute('class', 'crusher-block');
  const cable = document.createElementNS(SVG_NS, 'line');
  cable.setAttribute('x1', '0'); cable.setAttribute('y1', '-800');
  cable.setAttribute('x2', '0'); cable.setAttribute('y2', '-18');
  cable.setAttribute('stroke', '#1a1a1a'); cable.setAttribute('stroke-width', '2');
  block.appendChild(cable);
  const body = document.createElementNS(SVG_NS, 'rect');
  body.setAttribute('x', '-30'); body.setAttribute('y', '-18');
  body.setAttribute('width', '60'); body.setAttribute('height', '20');
  body.setAttribute('rx', '3');
  body.setAttribute('fill', '#3a3a3a'); body.setAttribute('stroke', '#111');
  body.setAttribute('stroke-width', '1.5');
  block.appendChild(body);
  const stripe = document.createElementNS(SVG_NS, 'rect');
  stripe.setAttribute('x', '-30'); stripe.setAttribute('y', '-10');
  stripe.setAttribute('width', '60'); stripe.setAttribute('height', '5');
  stripe.setAttribute('fill', '#e0a52a');
  block.appendChild(stripe);
  fg.appendChild(block);

  const hitY = pos.y - 26;
  block.setAttribute('transform', `translate(${pos.x}, ${hitY - 420})`);

  cinner.style.transformBox = 'fill-box';
  cinner.style.transformOrigin = '50% 100%';

  anime({
    targets: { y: hitY - 420 },
    y: hitY,
    duration: 420,
    easing: 'easeInQuad',
    update: a => block.setAttribute('transform', `translate(${pos.x}, ${a.animatables[0].target.y})`),
    complete: () => {
      emitFlash(pos.x, pos.y, 40);
      emitDebris(pos.x, pos.y, color, 30);
      emitSmokeBurst(pos.x, pos.y, 12);
      shakeScene(anime);

      anime({
        targets: cinner,
        scaleY: 0.12,
        scaleX: 1.35,
        duration: 180,
        easing: 'easeOutQuad',
        complete: () => {
          g.style.transition = 'opacity 0.3s';
          g.style.opacity = '0';
        },
      });

      // Block lifts away again, which is what sells it as machinery rather
      // than a falling object.
      anime({
        targets: { y: hitY },
        y: hitY - 420,
        duration: 1100,
        delay: 350,
        easing: 'easeInOutQuad',
        update: a => block.setAttribute('transform', `translate(${pos.x}, ${a.animatables[0].target.y})`),
        complete: () => { if (block.parentNode) block.remove(); },
      });
    },
  });
}

function playDematerialise(g, pos, color, anime) {
  const cinner = g.querySelector('.container-inner');
  if (!cinner || !anime || reducedMotion) return playExplode(g, pos, color, anime);

  // The honest visual for `kubectl delete`: no explosion, just a resource
  // ceasing to exist. Scanlines tear horizontally and the whole thing
  // resolves into nothing.
  const bands = [];
  for (let i = 0; i < 7; i++) {
    const band = document.createElementNS(SVG_NS, 'rect');
    band.setAttribute('x', '-35');
    band.setAttribute('y', String(-46 + i * 6.6));
    band.setAttribute('width', '70');
    band.setAttribute('height', '6.6');
    band.setAttribute('fill', `rgb(${color})`);
    band.setAttribute('opacity', '0.95');
    cinner.appendChild(band);
    bands.push(band);
  }

  if (pos) emitFlash(pos.x, pos.y, 26);

  // Cyan wash: the one colour in this scene that reads as "digital".
  const body = g.querySelector('.container-body');
  if (body) body.style.filter = 'drop-shadow(0 0 10px #4ff0ff) brightness(1.5)';

  bands.forEach((band, i) => {
    anime({
      targets: band,
      translateX: (Math.random() - 0.5) * 120,
      opacity: [0.95, 0],
      duration: 420 + Math.random() * 380,
      delay: i * 45,
      easing: 'easeInQuad',
    });
  });

  anime({
    targets: cinner,
    opacity: [1, 0],
    duration: 780,
    easing: 'steps(6)',
    complete: () => {
      g.style.opacity = '0';
      cinner.style.opacity = '';
      if (body) body.style.filter = '';
      bands.forEach(b => b.remove());
      if (pos) emitFlash(pos.x, pos.y, 14);
    },
  });
}

function playLaunched(g, pos, color, anime) {
  if (!anime || reducedMotion || !pos) return playExplode(g, pos, color, anime);
  const sprite = detachContainerSprite(g, +g.getAttribute('data-index'), pos);
  if (!sprite) return playExplode(g, pos, color, anime);

  emitFlash(pos.x, pos.y, 50);
  emitSmokeBurst(pos.x, pos.y + 10, 14);
  shakeScene(anime);

  const dir = pos.x < 640 ? 1 : -1;
  const landX = pos.x + dir * (700 + Math.random() * 300);
  const apex = 140 + Math.random() * 90;

  anime({
    targets: { t: 0 },
    t: 1,
    duration: 1900,
    easing: 'linear',
    update: a => {
      const t = a.animatables[0].target.t;
      const x = pos.x + (landX - pos.x) * t;
      // Parabola: up fast, down slow, landing back at the waterline.
      const y = pos.y + (WATERLINE - pos.y) * t - apex * 4 * t * (1 - t);
      sprite.setAttribute('transform', `translate(${x}, ${y}) rotate(${dir * t * 540})`);
    },
    complete: () => {
      if (sprite.parentNode) sprite.remove();
      // Landed off-stage more often than not, so the splash is deliberately
      // small and distant — a thud you half-see rather than a second explosion.
      if (landX > -40 && landX < 1320) {
        emitSplash(landX, WATERLINE + 2, 22);
        spawnFloatingDebris(landX, color);
      }
    },
  });
}

function playExplode(g, pos, color, anime) {
  if (pos) {
    emitFlash(pos.x, pos.y, 95);              // huge outer fireball
    emitFlash(pos.x, pos.y, 55);              // mid layer
    emitFlash(pos.x, pos.y, 28);              // hot white-hot core
    emitDebris(pos.x, pos.y, color, 42);
    emitEmbers(pos.x, pos.y, 14);
  }
  g.style.transition = 'opacity 0.15s';
  g.style.opacity = '0';

  if (!reducedMotion && anime) {
    shakeScene(anime);
  }
}

// Screen shake. Animates a plain object and writes --shake-x, which #scene
// composes into its transform. Never touch #scene's transform property here:
// anime.js would rebuild it from the inline style only and drop the
// stage scale set by fitStage(), pinning the view back to 1280x800.
function shakeScene(anime) {
  const scene = document.getElementById('scene');
  if (!scene) return;
  anime({
    targets: { x: 0 },
    x: [
      { value: -4, duration: 30 },
      { value:  6, duration: 30 },
      { value: -3, duration: 30 },
      { value:  0, duration: 30 },
    ],
    easing: 'linear',
    update: a => scene.style.setProperty('--shake-x', a.animatables[0].target.x + 'px'),
    complete: () => scene.style.setProperty('--shake-x', '0px'),
  });
}

function playTopple(g, pos, color, anime) {
  const cinner = g.querySelector('.container-inner');
  if (!cinner || !anime || reducedMotion) return playExplode(g, pos, color, anime);

  const dir = Math.random() < 0.5 ? -1 : 1;  // tip left or right
  cinner.style.transformBox = 'fill-box';
  cinner.style.transformOrigin = dir < 0 ? '0% 100%' : '100% 100%';

  if (pos) emitEmbers(pos.x, pos.y, 6);

  // Creak: small wobble against the fall direction, then commit
  anime({
    targets: cinner,
    rotate: [
      { value: -dir * 5, duration: 110, easing: 'easeOutQuad' },
      { value: 0,        duration: 70,  easing: 'easeInQuad' },
    ],
    complete: () => {
      anime({
        targets: cinner,
        rotate: dir * 92,
        translateX: dir * 16,
        duration: 520,
        easing: 'easeInQuad',
        complete: () => {
          // Impact: dust + flash + debris near the toppled side
          if (pos) {
            const ix = pos.x + dir * 36;
            const iy = pos.y + 14;
            emitFlash(ix, iy, 38);
            emitDebris(ix, iy, color, 22);
            emitSmokeBurst(ix, iy, 8);
            emitEmbers(ix, iy, 6);
          }
          g.style.transition = 'opacity 0.25s';
          g.style.opacity = '0';
        },
      });
    },
  });
}

function playCrumple(g, pos, color, anime) {
  const cinner = g.querySelector('.container-inner');
  if (!cinner || !anime || reducedMotion) return playExplode(g, pos, color, anime);

  cinner.style.transformBox = 'fill-box';
  cinner.style.transformOrigin = '50% 100%';

  // Embers leak from seams as it buckles
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      if (pos && g.isConnected) {
        emitEmbers(pos.x + (Math.random() - 0.5) * 30, pos.y, 3);
      }
    }, i * 90);
  }

  anime({
    targets: cinner,
    scaleY: [
      { value: 0.94, duration: 120, easing: 'easeOutQuad' },
      { value: 1.06, duration: 80,  easing: 'easeInOutQuad' },
      { value: 0.08, duration: 480, easing: 'easeInQuad' },
    ],
    scaleX: [
      { value: 1.04, duration: 120 },
      { value: 0.96, duration: 80 },
      { value: 1.32, duration: 480 },
    ],
    complete: () => {
      // Final pop as the squashed shell collapses
      if (pos) {
        emitFlash(pos.x, pos.y, 44);
        emitDebris(pos.x, pos.y, color, 24);
        emitSmokeBurst(pos.x, pos.y - 4, 10);
        emitEmbers(pos.x, pos.y, 8);
      }
      g.style.transition = 'opacity 0.25s';
      g.style.opacity = '0';
    },
  });
}

function playDeath(index) {
  const g = document.getElementById(`pod-${index}`);
  if (!g) return;
  const phase = inFlight.get(index);
  if (phase === 'respawning') {
    queuedKill.add(index);
    return;
  }
  if (phase === 'dying' || phase === 'awaiting-respawn') return;

  inFlight.set(index, 'dying');

  const pos = getContainerScreenPos(index);
  const color = CONTAINER_PALETTE_RGB[index] || '200,200,200';
  const anime = window.anime;
  const variant = pickDeathVariant();

  // Phase 2: variant-specific demise at +300ms (after the deathWarning shake)
  setTimeout(() => {
    if (!g.isConnected) return;
    switch (variant) {
      case 'topple':        playTopple(g, pos, color, anime); break;
      case 'crumple':       playCrumple(g, pos, color, anime); break;
      case 'overboard':     playOverboard(g, pos, color, anime); break;
      case 'crushed':       playCrushed(g, pos, color, anime); break;
      case 'dematerialise': playDematerialise(g, pos, color, anime); break;
      case 'launched':      playLaunched(g, pos, color, anime); break;
      default:              playExplode(g, pos, color, anime); break;
    }
  }, 300);

  // Scorch and the smoke pillar only make sense where something actually
  // burned. A container that slid overboard, was catapulted off-stage, or was
  // quietly deleted leaves a clean deck.
  if (FIERY_VARIANTS.has(variant)) {
    // Show scorch on the deck slot at +600ms
    setTimeout(() => {
      if (!g.isConnected) return;
      const pod = pods.get(index);
      if (pod) showScorch(pod.node, +g.getAttribute('data-slot'));
    }, 600);

    // Phase 3: smoke pillar — 12 bursts over 1.6s
    for (let i = 0; i < 12; i++) {
      setTimeout(() => {
        if (pos && g.isConnected) emitSmokeBurst(pos.x, pos.y, 4);
      }, 600 + i * 130);
    }
  }

  // Death visuals end ~1.5s in (slightly later than 1.4s to cover slow variants);
  // transition to awaiting-respawn so a pod:running event triggers the drone
  // delivery immediately. Also clear any leftover transforms from variants
  // so the respawned container appears upright.
  setTimeout(() => {
    if (!g.isConnected) {
      // Container's ship was sunk while we were dying — clean up state.
      inFlight.delete(index);
      pendingRespawn.delete(index);
      queuedKill.delete(index);
      return;
    }
    const cinner = g.querySelector('.container-inner');
    if (cinner) {
      cinner.style.transform = '';
      cinner.style.transformOrigin = '';
      cinner.style.transformBox = '';
      cinner.style.opacity = '';
    }
    inFlight.set(index, 'awaiting-respawn');
    if (pendingRespawn.has(index)) {
      pendingRespawn.delete(index);
      playRespawn(index);
    }
  }, 1500);
}

function onPodRunning(index) {
  const g = document.getElementById(`pod-${index}`);
  if (!g) return;
  const phase = inFlight.get(index);
  if (phase === 'dying') {
    // Death effects still playing — queue the respawn for when they finish
    pendingRespawn.add(index);
    return;
  }
  if (phase === 'awaiting-respawn') {
    playRespawn(index);
    return;
  }
  if (phase === 'respawning') {
    return;  // already in progress
  }
  // No death in flight — make sure container is visible (e.g., on first appearance)
  g.style.opacity = '1';
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const CONTAINER_PALETTE = [
  '#b3411f', '#1e3a5f', '#3a8c5b', '#d68a2b', '#e4ddc5',
];

// Shared container artwork, anchored with its TOP edge at local y=0. Every
// delivery variant needs the same 70x46 box with the same stencil, so it lives
// in one place rather than being re-declared per vehicle.
function buildCargoArt(index) {
  const g = document.createElementNS(SVG_NS, 'g');

  const cb = document.createElementNS(SVG_NS, 'rect');
  cb.setAttribute('x', '-35'); cb.setAttribute('y', '0');
  cb.setAttribute('width', '70'); cb.setAttribute('height', '46');
  cb.setAttribute('fill', CONTAINER_PALETTE[index] || '#888');
  cb.setAttribute('stroke', '#000'); cb.setAttribute('stroke-width', '1.5');
  g.appendChild(cb);

  // Vertical ribbing, matching the real containers on the deck.
  for (let i = -28; i <= 28; i += 7) {
    const rib = document.createElementNS(SVG_NS, 'line');
    rib.setAttribute('x1', i); rib.setAttribute('y1', '2');
    rib.setAttribute('x2', i); rib.setAttribute('y2', '44');
    rib.setAttribute('stroke', '#000'); rib.setAttribute('stroke-width', '0.6');
    rib.setAttribute('opacity', '0.3');
    g.appendChild(rib);
  }

  const hl = document.createElementNS(SVG_NS, 'line');
  hl.setAttribute('x1', '-35'); hl.setAttribute('y1', '0');
  hl.setAttribute('x2', '35'); hl.setAttribute('y2', '0');
  hl.setAttribute('stroke', '#fff'); hl.setAttribute('stroke-width', '1.2');
  hl.setAttribute('opacity', '0.45');
  g.appendChild(hl);

  const stencil = document.createElementNS(SVG_NS, 'text');
  stencil.setAttribute('x', '0'); stencil.setAttribute('y', '23');
  stencil.setAttribute('text-anchor', 'middle');
  stencil.setAttribute('dominant-baseline', 'middle');
  stencil.setAttribute('font-family', '"Courier New", monospace');
  stencil.setAttribute('font-size', '30');
  stencil.setAttribute('font-weight', 'bold');
  stencil.setAttribute('fill', '#fff');
  stencil.setAttribute('opacity', '0.92');
  stencil.textContent = String(index);
  g.appendChild(stencil);

  return g;
}

function buildDrone(parent, index) {
  // Quadcopter rendered in scene-coordinates (placed in layer-foreground).
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'delivery-drone');

  // Drone body: dark rounded rectangle
  const body = document.createElementNS(SVG_NS, 'rect');
  body.setAttribute('x', '-26'); body.setAttribute('y', '-7');
  body.setAttribute('width', '52'); body.setAttribute('height', '14');
  body.setAttribute('rx', '5');
  body.setAttribute('fill', '#2c2c2c'); body.setAttribute('stroke', '#0e0e0e'); body.setAttribute('stroke-width', '1');
  g.appendChild(body);
  // Cyan running light
  const light = document.createElementNS(SVG_NS, 'circle');
  light.setAttribute('cx', '-22'); light.setAttribute('cy', '0'); light.setAttribute('r', '2');
  light.setAttribute('fill', '#7ec0e8');
  g.appendChild(light);

  // Two arm segments crossing the body diagonally
  for (const [x1, y1, x2, y2] of [[-30, -10, 30, 10], [-30, 10, 30, -10]]) {
    const arm = document.createElementNS(SVG_NS, 'line');
    arm.setAttribute('x1', x1); arm.setAttribute('y1', y1);
    arm.setAttribute('x2', x2); arm.setAttribute('y2', y2);
    arm.setAttribute('stroke', '#1a1a1a'); arm.setAttribute('stroke-width', '3');
    g.appendChild(arm);
  }
  // Four rotor blurs at arm tips (ellipses simulating spinning blades)
  for (const [cx, cy] of [[-30, -10], [30, -10], [-30, 10], [30, 10]]) {
    const rotor = document.createElementNS(SVG_NS, 'ellipse');
    rotor.setAttribute('cx', cx); rotor.setAttribute('cy', cy);
    rotor.setAttribute('rx', '14'); rotor.setAttribute('ry', '2.5');
    rotor.setAttribute('fill', '#9a9a9a'); rotor.setAttribute('opacity', '0.55');
    rotor.setAttribute('class', 'drone-rotor');
    g.appendChild(rotor);
    const hub = document.createElementNS(SVG_NS, 'circle');
    hub.setAttribute('cx', cx); hub.setAttribute('cy', cy); hub.setAttribute('r', '2');
    hub.setAttribute('fill', '#444');
    g.appendChild(hub);
  }

  // Cable hanging below
  const cable = document.createElementNS(SVG_NS, 'line');
  cable.setAttribute('class', 'drone-cable');
  cable.setAttribute('x1', '0'); cable.setAttribute('y1', '7');
  cable.setAttribute('x2', '0'); cable.setAttribute('y2', '40');
  cable.setAttribute('stroke', '#1a1a1a'); cable.setAttribute('stroke-width', '1.4');
  g.appendChild(cable);

  // Cargo group hangs at the cable end (y position is animated)
  const cargo = buildCargoArt(index);
  cargo.setAttribute('class', 'drone-cargo');
  cargo.setAttribute('transform', 'translate(0, 40)');
  g.appendChild(cargo);

  parent.appendChild(g);
  return { g, cable, cargo };
}

// Respawn is the "Kubernetes healed itself" beat — the punchline of every
// button press. Varying the delivery keeps that punchline from going stale,
// while the drone stays the most common so the scene has a default character.
const RESPAWN_VARIANTS = [
  { name: 'drone', weight: 3 },
  { name: 'crane-lift', weight: 2 },
  { name: 'heli-sling', weight: 2 },
  { name: 'submarine', weight: 1.4 },
  { name: 'printer', weight: 1 },
];

function pickRespawnVariant() {
  const total = RESPAWN_VARIANTS.reduce((s, v) => s + v.weight, 0);
  let r = Math.random() * total;
  for (const v of RESPAWN_VARIANTS) {
    r -= v.weight;
    if (r <= 0) return v.name;
  }
  return 'drone';
}

function playRespawn(index) {
  const podG = document.getElementById(`pod-${index}`);
  if (!podG) {
    inFlight.delete(index);
    return;
  }
  inFlight.set(index, 'respawning');
  const anime = window.anime;
  podG.style.transition = '';
  podG.style.opacity = '0';  // hide real container until it's delivered

  // Resolve the slot's scene-space position
  const shipBob = podG.parentNode;
  const shipG = shipBob ? shipBob.parentNode : null;
  const shipMatch = shipG ? (shipG.getAttribute('transform') || '').match(/translate\(([^,]+),\s*([^)]+)\)/) : null;
  const shipX = shipMatch ? parseFloat(shipMatch[1]) : 640;
  const shipY = shipMatch ? parseFloat(shipMatch[2]) : 700;
  const podMatch = (podG.getAttribute('transform') || '').match(/translate\(([^,]+),\s*([^)]+)\)/);
  const slotX = podMatch ? parseFloat(podMatch[1]) : 0;
  const slotY = podMatch ? parseFloat(podMatch[2]) : -8;
  const sceneSlotX = shipX + slotX;
  const sceneSlotY = shipY + slotY;

  const fg = document.getElementById('layer-foreground');

  // Bail early if the underlying ship/container vanished mid-flight (node:gone
  // or pod moved to another node). The vehicle is left to leave gracefully.
  const podStillThere = () => podG.isConnected;

  const finalize = () => {
    if (!podStillThere()) {
      inFlight.delete(index);
      pendingRespawn.delete(index);
      queuedKill.delete(index);
      return;
    }
    // Reveal real container with green pulse
    podG.style.opacity = '1';
    const body = podG.querySelector('.container-body');
    if (body) {
      body.style.filter = 'drop-shadow(0 0 14px #2ee87b)';
      setTimeout(() => { body.style.filter = ''; }, 500);
    }
    const pod = pods.get(index);
    if (pod) hideScorch(pod.node, +podG.getAttribute('data-slot'));
    inFlight.delete(index);
    if (queuedKill.has(index)) {
      queuedKill.delete(index);
      setTimeout(() => playDeath(index), 200);
    }
  };

  if (!anime) {
    finalize();
    return;
  }

  const ctx = { podG, index, anime, fg, x: sceneSlotX, y: sceneSlotY, finalize };

  switch (pickRespawnVariant()) {
    case 'crane-lift': respawnCraneLift(ctx); break;
    case 'heli-sling': respawnHeliSling(ctx); break;
    case 'submarine':  respawnSubmarine(ctx); break;
    case 'printer':    respawnPrinter(ctx); break;
    default:           respawnDrone(ctx); break;
  }
}

// Every variant lands the cargo's TOP edge here: the slot's y plus the
// container body's own -46 offset.
function cargoTopY(slotY) { return slotY - 46; }

function respawnDrone({ index, anime, fg, x, y, finalize }) {
  const drone = buildDrone(fg, index);
  const FLIGHT_Y = 200;
  drone.g.setAttribute('transform', `translate(-120, ${FLIGHT_Y})`);

  // Phase 1: drone flies in from off-screen left (1.8s — quick approach)
  anime({
    targets: { x: -120, y: FLIGHT_Y },
    x, y: FLIGHT_Y,
    duration: 1800,
    easing: 'easeInOutCubic',
    update: a => {
      const v = a.animatables[0].target;
      drone.g.setAttribute('transform', `translate(${v.x}, ${v.y})`);
    },
    complete: () => {
      // Phase 2: lower cargo from its stowed y=40 to the slot.
      anime({
        targets: { y: 40 },
        y: cargoTopY(y) - FLIGHT_Y,
        duration: 2200,
        easing: 'easeInOutQuad',
        update: a => {
          const v = a.animatables[0].target;
          drone.cargo.setAttribute('transform', `translate(0, ${v.y})`);
          drone.cable.setAttribute('y2', String(v.y));
        },
        complete: () => {
          drone.cargo.style.opacity = '0';
          drone.cable.style.opacity = '0';
          finalize();
          // Phase 3: drone flies off to the right (2.5s)
          anime({
            targets: { x, y: FLIGHT_Y },
            x: x + 1500,
            y: FLIGHT_Y - 60,
            duration: 2500,
            easing: 'easeInQuad',
            update: a => {
              const v = a.animatables[0].target;
              drone.g.setAttribute('transform', `translate(${v.x}, ${v.y})`);
            },
            complete: () => { if (drone.g.parentNode) drone.g.remove(); },
          });
        },
      });
    },
  });
}

// Dockside gantry crane: mast and jib rise on the near side, the trolley runs
// out along the jib, then the cable pays out. The most "working port" of the
// five, and the one that best matches the crane events already in the theatre.
function respawnCraneLift({ index, anime, fg, x, y, finalize }) {
  const JIB_Y = 360;
  // Stand the mast on whichever side has more room, so the jib always reaches
  // inward across the slot rather than off the edge of the stage.
  const side = x < 640 ? 1 : -1;
  const mastX = x + side * 250;

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'respawn-crane');
  fg.appendChild(g);

  const mk = (tag, attrs) => {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    g.appendChild(e);
    return e;
  };

  mk('rect', { x: mastX - 9, y: JIB_Y, width: 18, height: 700 - JIB_Y, fill: '#c8a12e', stroke: '#6d5514', 'stroke-width': 1.5 });
  mk('rect', { x: Math.min(mastX, x) - 30, y: JIB_Y - 10, width: Math.abs(mastX - x) + 60, height: 10, fill: '#d8b33c', stroke: '#6d5514', 'stroke-width': 1.2 });
  mk('rect', { x: mastX - 22, y: JIB_Y - 34, width: 44, height: 24, fill: '#3f3f3f', stroke: '#161616', 'stroke-width': 1.2 });

  const trolley = document.createElementNS(SVG_NS, 'g');
  g.appendChild(trolley);
  const tBody = document.createElementNS(SVG_NS, 'rect');
  tBody.setAttribute('x', '-12'); tBody.setAttribute('y', '-6');
  tBody.setAttribute('width', '24'); tBody.setAttribute('height', '12');
  tBody.setAttribute('fill', '#2f2f2f');
  trolley.appendChild(tBody);
  const cable = document.createElementNS(SVG_NS, 'line');
  cable.setAttribute('x1', '0'); cable.setAttribute('y1', '6');
  cable.setAttribute('x2', '0'); cable.setAttribute('y2', '40');
  cable.setAttribute('stroke', '#1a1a1a'); cable.setAttribute('stroke-width', '1.6');
  trolley.appendChild(cable);
  const cargo = buildCargoArt(index);
  cargo.setAttribute('transform', 'translate(0, 40)');
  trolley.appendChild(cargo);

  trolley.setAttribute('transform', `translate(${mastX}, ${JIB_Y})`);

  anime({
    targets: { tx: mastX },
    tx: x,
    duration: 1900,
    easing: 'easeInOutQuad',
    update: a => trolley.setAttribute('transform', `translate(${a.animatables[0].target.tx}, ${JIB_Y})`),
    complete: () => {
      anime({
        targets: { cy: 40 },
        cy: cargoTopY(y) - JIB_Y,
        duration: 2000,
        easing: 'easeInOutQuad',
        update: a => {
          const v = a.animatables[0].target.cy;
          cargo.setAttribute('transform', `translate(0, ${v})`);
          cable.setAttribute('y2', String(v));
        },
        complete: () => {
          cargo.style.opacity = '0';
          cable.style.opacity = '0';
          finalize();
          anime({
            targets: g,
            opacity: [1, 0],
            duration: 900,
            delay: 400,
            easing: 'easeInQuad',
            complete: () => { if (g.parentNode) g.remove(); },
          });
        },
      });
    },
  });
}

function respawnHeliSling({ index, anime, fg, x, y, finalize }) {
  const FLIGHT_Y = 185;
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'respawn-heli');
  fg.appendChild(g);

  const mk = (tag, attrs, parent = g) => {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    parent.appendChild(e);
    return e;
  };

  mk('ellipse', { cx: 0, cy: 0, rx: 30, ry: 13, fill: '#2b4a63', stroke: '#14293a', 'stroke-width': 1.2 });
  mk('path', { d: 'M22,-4 L62,-1 L62,3 L22,6 Z', fill: '#2b4a63', stroke: '#14293a', 'stroke-width': 1 });
  mk('polygon', { points: '58,-2 72,-14 74,-10 62,2', fill: '#20394d' });
  mk('ellipse', { cx: -14, cy: -2, rx: 9, ry: 6, fill: '#9fd3ee', opacity: 0.85 });
  mk('rect', { x: -2, y: -20, width: 4, height: 8, fill: '#1b1b1b' });
  mk('rect', { class: 'drone-rotor', x: -52, y: -22, width: 104, height: 2.6, fill: '#9a9a9a', opacity: 0.6 });
  mk('path', { d: 'M-16,13 L-20,24 M16,13 L20,24 M-24,24 L24,24', stroke: '#1b1b1b', 'stroke-width': 2, fill: 'none' });

  const cable = mk('line', { x1: 0, y1: 13, x2: 0, y2: 44, stroke: '#1a1a1a', 'stroke-width': 1.5 });
  const cargo = buildCargoArt(index);
  cargo.setAttribute('transform', 'translate(0, 44)');
  g.appendChild(cargo);

  // Enters from the right, mirroring the drone's left-hand approach so the two
  // never look like the same animation with different paint.
  g.setAttribute('transform', `translate(1420, ${FLIGHT_Y}) scale(-1, 1)`);

  anime({
    targets: { x: 1420 },
    x,
    duration: 2000,
    easing: 'easeInOutCubic',
    update: a => g.setAttribute('transform', `translate(${a.animatables[0].target.x}, ${FLIGHT_Y}) scale(-1, 1)`),
    complete: () => {
      anime({
        targets: { cy: 44 },
        cy: cargoTopY(y) - FLIGHT_Y,
        duration: 2100,
        easing: 'easeInOutQuad',
        update: a => {
          const v = a.animatables[0].target.cy;
          cargo.setAttribute('transform', `translate(0, ${v})`);
          cable.setAttribute('y2', String(v));
        },
        complete: () => {
          cargo.style.opacity = '0';
          cable.style.opacity = '0';
          finalize();
          anime({
            targets: { x },
            x: -260,
            duration: 2600,
            easing: 'easeInQuad',
            update: a => g.setAttribute('transform', `translate(${a.animatables[0].target.x}, ${FLIGHT_Y - 40}) scale(-1, 1)`),
            complete: () => { if (g.parentNode) g.remove(); },
          });
        },
      });
    },
  });
}

// The container arrives from *below*. Nobody expects the replacement pod to
// come out of the water, which is the entire point of keeping this one rare.
function respawnSubmarine({ index, anime, fg, x, y, finalize }) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'respawn-sub');
  fg.appendChild(g);

  const mk = (tag, attrs, parent = g) => {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    parent.appendChild(e);
    return e;
  };

  const hull = document.createElementNS(SVG_NS, 'g');
  g.appendChild(hull);
  mk('ellipse', { cx: 0, cy: 0, rx: 62, ry: 15, fill: '#27343c', stroke: '#111a20', 'stroke-width': 1.5 }, hull);
  mk('rect', { x: -12, y: -22, width: 26, height: 22, rx: 3, fill: '#2f3d46', stroke: '#111a20', 'stroke-width': 1.2 }, hull);
  mk('rect', { x: -1.5, y: -34, width: 3, height: 12, fill: '#1a2329' }, hull);
  mk('circle', { cx: 8, cy: -12, r: 2.4, fill: '#ffd36a' }, hull);

  const mast = mk('rect', { x: -2, y: -34, width: 4, height: 0, fill: '#3a4a54' });
  const cargo = buildCargoArt(index);
  cargo.style.opacity = '0';
  g.appendChild(cargo);

  const SURFACE_Y = 736;
  g.setAttribute('transform', `translate(${x}, ${SURFACE_Y + 70})`);

  // Surface, with the splash arriving as the hull breaks through.
  anime({
    targets: { sy: SURFACE_Y + 70 },
    sy: SURFACE_Y,
    duration: 1500,
    easing: 'easeOutQuad',
    update: a => g.setAttribute('transform', `translate(${x}, ${a.animatables[0].target.sy})`),
    complete: () => {
      emitSplash(x, SURFACE_Y - 10, 30);
      cargo.style.opacity = '1';

      // A telescoping mast pushes the container up to the slot.
      const rise = SURFACE_Y - cargoTopY(y);
      anime({
        targets: { h: 0 },
        h: rise,
        duration: 2200,
        easing: 'easeInOutQuad',
        update: a => {
          const h = a.animatables[0].target.h;
          mast.setAttribute('y', String(-34 - h));
          mast.setAttribute('height', String(h + 12));
          cargo.setAttribute('transform', `translate(0, ${-h})`);
        },
        complete: () => {
          cargo.style.opacity = '0';
          finalize();
          anime({
            targets: { sy: SURFACE_Y },
            sy: SURFACE_Y + 80,
            duration: 1800,
            delay: 500,
            easing: 'easeInQuad',
            update: a => {
              mast.setAttribute('height', '0');
              g.setAttribute('transform', `translate(${x}, ${a.animatables[0].target.sy})`);
            },
            complete: () => {
              emitSplash(x, SURFACE_Y - 6, 14);
              if (g.parentNode) g.remove();
            },
          });
        },
      });
    },
  });
}

// The container prints itself into existence, band by band, under a scan line.
// Deliberately the rarest: it's the one that makes people ask what just
// happened, and that only works if it almost never happens.
function respawnPrinter({ index, anime, fg, x, y, finalize }) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'respawn-printer');
  g.setAttribute('transform', `translate(${x}, ${cargoTopY(y)})`);
  fg.appendChild(g);

  const BANDS = 9;
  const bandH = 46 / BANDS;
  const bands = [];
  for (let i = 0; i < BANDS; i++) {
    const b = document.createElementNS(SVG_NS, 'rect');
    b.setAttribute('x', '-35');
    // Built bottom-up, the way a printer actually lays material down.
    b.setAttribute('y', String(46 - (i + 1) * bandH));
    b.setAttribute('width', '70');
    b.setAttribute('height', String(bandH + 0.4));
    b.setAttribute('fill', CONTAINER_PALETTE[index] || '#888');
    b.setAttribute('opacity', '0');
    g.appendChild(b);
    bands.push(b);
  }

  const scan = document.createElementNS(SVG_NS, 'rect');
  scan.setAttribute('x', '-40'); scan.setAttribute('y', '46');
  scan.setAttribute('width', '80'); scan.setAttribute('height', '2.5');
  scan.setAttribute('fill', '#7ff0ff');
  g.appendChild(scan);

  const STEP = 190;

  bands.forEach((b, i) => {
    anime({
      targets: b,
      opacity: [0, 1],
      duration: 160,
      delay: i * STEP,
      easing: 'linear',
    });
  });

  anime({
    targets: { sy: 46 },
    sy: -2,
    duration: BANDS * STEP,
    easing: 'linear',
    update: a => scan.setAttribute('y', String(a.animatables[0].target.sy)),
    complete: () => {
      scan.remove();
      emitFlash(x, y - 23, 30);
      finalize();
      anime({
        targets: g,
        opacity: [1, 0],
        duration: 280,
        easing: 'linear',
        complete: () => { if (g.parentNode) g.remove(); },
      });
    },
  });
}

function playSailIn(name) {
  const ship = getShipEl(name);
  if (!ship) return;
  const target = getShipTargetX(name);
  const anime = window.anime;
  if (target === undefined) return;

  if (!anime) {
    ship.setAttribute('transform', `translate(${target}, 700)`);
    return;
  }

  anime({
    targets: { x: 1500 },
    x: target,
    duration: 2000,
    easing: 'easeOutCubic',
    update: a => {
      const v = a.animatables[0].target;
      ship.setAttribute('transform', `translate(${v.x}, 700)`);
      const stack = stackPositions.get(name);
      if (stack) stack.x = v.x + 107;
    },
    complete: () => {
      emitSplash(target, 720, 18);
      emitSmokeBurst(target + 13, 620, 6);
    },
  });

  // Reflow others smoothly
  for (const otherName of nodes.keys()) {
    if (otherName === name) continue;
    const other = getShipEl(otherName);
    const otherTarget = getShipTargetX(otherName);
    if (!other || otherTarget === undefined) continue;
    const m = (other.getAttribute('transform') || '').match(/translate\(([^,]+)/);
    const cur = m ? parseFloat(m[1]) : otherTarget;
    if (Math.abs(cur - otherTarget) < 1) continue;
    anime({
      targets: { x: cur },
      x: otherTarget,
      duration: 1000,
      easing: 'easeInOutCubic',
      update: a => {
        const v = a.animatables[0].target;
        other.setAttribute('transform', `translate(${v.x}, 700)`);
        const stack = stackPositions.get(otherName);
        if (stack) stack.x = v.x + 107;
      },
    });
  }
}

function playFullSink(name) {
  const ship = getShipEl(name);
  if (!ship) return;
  const anime = window.anime;
  const targetX = getShipTargetX(name) || 640;

  if (!anime) {
    ship.remove();
    return;
  }

  anime({
    targets: { y: 0, r: 10 },
    y: 150, r: 35,
    duration: 2500,
    easing: 'easeInQuad',
    update: a => {
      const v = a.animatables[0].target;
      const inner = ship.querySelector('.ship-bob') || ship;
      inner.setAttribute('transform', `translate(0, ${v.y}) rotate(${v.r})`);
    },
    complete: () => {
      emitSplash(targetX, 730, 30);
      if (ship.parentNode) ship.remove();
    },
  });
}

// Seeded from whatever the server rendered into the DOM, so an operator-set
// starting value survives kiosk reloads.
let killCount = (() => {
  const node = document.querySelector('#kill-counter .kc-value');
  const n = node ? parseInt(node.textContent, 10) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
})();

function renderKillCount() {
  const el = document.getElementById('kill-counter');
  if (!el) return;
  el.querySelector('.kc-value').textContent = String(killCount);
  el.classList.remove('bumped');
  // Force reflow so the animation can replay
  void el.offsetWidth;
  el.classList.add('bumped');
}

function bumpKillCounter() {
  killCount += 1;
  renderKillCount();
}

// Operator-driven seed update from /control/kill-count via SSE.
export function setKillCount(n) {
  const v = Math.max(0, Math.floor(Number(n)));
  if (!Number.isFinite(v)) return;
  killCount = v;
  renderKillCount();
}

export function init() {
  stateEvents.addEventListener('pod:terminating', e => {
    bumpKillCounter();
    playDeath(e.detail.index);
  });
  stateEvents.addEventListener('pod:running', e => onPodRunning(e.detail.index));
  stateEvents.addEventListener('pod:appeared', e => {
    // First time we see a pod (page load) — just ensure it's fully visible.
    const g = document.getElementById(`pod-${e.detail.index}`);
    if (g) g.style.opacity = '1';
  });
  stateEvents.addEventListener('node:joined', e => {
    // Defer slightly so scene.js has finished placing the ship off-screen
    setTimeout(() => playSailIn(e.detail.name), 50);
  });
  stateEvents.addEventListener('node:ready', e => {
    // Recovery flash on the bow lantern
    const ship = getShipEl(e.detail.name);
    if (!ship) return;
    const lantern = ship.querySelector('.ship-lantern');
    if (!lantern) return;
    lantern.classList.add('relight');
    setTimeout(() => lantern.classList.remove('relight'), 1500);
  });
  stateEvents.addEventListener('node:gone', e => playFullSink(e.detail.name));
  console.log('[animations] init', reducedMotion ? '(reduced-motion on)' : '');
}
