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
