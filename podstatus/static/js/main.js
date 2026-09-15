import * as state from './state.js';
import * as scene from './scene.js';
import * as effects from './effects.js';
import * as animations from './animations.js';
import * as theatre from './theatre/eventBus.js';
import * as director from './theatre/director.js';
import './theatre/events/index.js';

const STAGE_W = 1280;
const STAGE_H = 800;
// The stage is authored at 1280x800 (16:10) but displays are usually 16:9, so
// the top and bottom 48 units are treated as bleed: background that may be
// cropped away. Fitting the SAFE_H band instead of the full height lets the
// scene fill the screen edge-to-edge horizontally rather than pillarboxing.
// On 1920x1080 this lands on exactly 1.5x (1280*1.5 = 1920) and crops 40
// units top and bottom — inside the bleed, so nothing important is lost.
// Anything that must stay visible belongs in y = [48, 752].
const SAFE_H = STAGE_H - 2 * 48;

function fitStage() {
  const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / SAFE_H);
  document.documentElement.style.setProperty('--stage-scale', scale);
  effects.resize(scale);
}

document.addEventListener('DOMContentLoaded', () => {
  effects.init();
  fitStage();
  window.addEventListener('resize', fitStage);
  scene.init();
  animations.init();
  // The Director writes the phase palette onto elements scene.init() just
  // built, so it has to come after it — and before the first SSE arrives, so
  // the scene is already at the right time of day when pods start appearing.
  director.init();
  state.init();
  theatre.init();
});
