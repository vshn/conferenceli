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

const DEATH_VARIANTS = ['explode', 'topple', 'crumple'];

function pickDeathVariant() {
  return DEATH_VARIANTS[Math.floor(Math.random() * DEATH_VARIANTS.length)];
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
  }
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
      case 'topple':  playTopple(g, pos, color, anime); break;
      case 'crumple': playCrumple(g, pos, color, anime); break;
      default:        playExplode(g, pos, color, anime); break;
    }
  }, 300);

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
  const cargo = document.createElementNS(SVG_NS, 'g');
  cargo.setAttribute('class', 'drone-cargo');
  cargo.setAttribute('transform', 'translate(0, 40)');
  // Mini container body
  const cb = document.createElementNS(SVG_NS, 'rect');
  cb.setAttribute('x', '-35'); cb.setAttribute('y', '0');
  cb.setAttribute('width', '70'); cb.setAttribute('height', '46');
  cb.setAttribute('fill', CONTAINER_PALETTE[index] || '#888');
  cb.setAttribute('stroke', '#000'); cb.setAttribute('stroke-width', '1.5');
  cargo.appendChild(cb);
  // Top highlight
  const hl = document.createElementNS(SVG_NS, 'line');
  hl.setAttribute('x1', '-35'); hl.setAttribute('y1', '0');
  hl.setAttribute('x2', '35'); hl.setAttribute('y2', '0');
  hl.setAttribute('stroke', '#fff'); hl.setAttribute('stroke-width', '1.2'); hl.setAttribute('opacity', '0.45');
  cargo.appendChild(hl);
  // Stencil number
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
  cargo.appendChild(stencil);
  g.appendChild(cargo);

  parent.appendChild(g);
  return { g, cable, cargo };
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
  podG.style.opacity = '0';  // hide real container until the drone delivers it

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
  const drone = buildDrone(fg, index);

  // Drone enters from off-screen left at high altitude.
  const FLIGHT_Y = 200;
  let droneX = -120;
  let droneY = FLIGHT_Y;
  drone.g.setAttribute('transform', `translate(${droneX}, ${droneY})`);

  // Bail early if the underlying ship/container vanished mid-flight (node:gone
  // or pod moved to another node). The drone is left to fly out gracefully.
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
    drone.g.remove();
    finalize();
    return;
  }

  // Phase 1: drone flies in from off-screen left (1.8s — quick approach)
  anime({
    targets: { x: droneX, y: droneY },
    x: sceneSlotX,
    y: FLIGHT_Y,
    duration: 1800,
    easing: 'easeInOutCubic',
    update: a => {
      const v = a.animatables[0].target;
      drone.g.setAttribute('transform', `translate(${v.x}, ${v.y})`);
    },
    complete: () => {
      // Phase 2: lower cargo. Cargo currently at y=40 (relative to drone).
      // Need it at sceneSlotY - FLIGHT_Y so its TOP aligns with the container body top.
      // Container body top is at sceneSlotY + (-46) (slotY plus container's body y=-46).
      // But cargo's local y=0 is its top edge. So target cargo-y = sceneSlotY - FLIGHT_Y - 46.
      const targetCargoY = sceneSlotY - FLIGHT_Y - 46;
      anime({
        targets: { y: 40 },
        y: targetCargoY,
        duration: 2200,
        easing: 'easeInOutQuad',
        update: a => {
          const v = a.animatables[0].target;
          drone.cargo.setAttribute('transform', `translate(0, ${v.y})`);
          drone.cable.setAttribute('y2', String(v.y));
        },
        complete: () => {
          // Container "clicks" into place — hide drone's cargo, reveal real podG with pulse
          drone.cargo.style.opacity = '0';
          drone.cable.style.opacity = '0';
          finalize();
          // Phase 3: drone flies off to the right (2.5s)
          anime({
            targets: { x: sceneSlotX, y: FLIGHT_Y },
            x: sceneSlotX + 1500,
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
