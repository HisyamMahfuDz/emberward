// Keyboard and mouse state, turned into one control object per frame that the
// world consumes: { mx, my, aimX, aimY, fire, dash }. The autopilot builds
// the same shape, so staged screenshots and real play drive identical code.
import { VIEW } from './config.js';

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyP', 'KeyM', 'KeyR', 'Enter',
]);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mouseX = VIEW.width / 2;
    this.mouseY = VIEW.height / 2 - 120;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.anyGesture = false;
    canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    canvas.addEventListener('pointerdown', (event) => {
      this.mouseDown = true;
      this.mouseClicked = true;
      this.anyGesture = true;
      this.onPointerMove(event);
      canvas.focus();
    });
    window.addEventListener('pointerup', () => { this.mouseDown = false; });
    window.addEventListener('blur', () => { this.down.clear(); this.mouseDown = false; });
    window.addEventListener('keydown', (event) => {
      if (GAME_KEYS.has(event.code)) event.preventDefault();
      if (!event.repeat) this.pressed.add(event.code);
      this.down.add(event.code);
      this.anyGesture = true;
    });
    window.addEventListener('keyup', (event) => { this.down.delete(event.code); });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  onPointerMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = ((event.clientX - rect.left) / rect.width) * VIEW.width;
    this.mouseY = ((event.clientY - rect.top) / rect.height) * VIEW.height;
  }

  // Edge-triggered: true once for the frame the key went down.
  wasPressed(code) {
    return this.pressed.has(code);
  }

  wasClicked() {
    return this.mouseClicked;
  }

  axis() {
    let mx = 0;
    let my = 0;
    if (this.down.has('KeyA') || this.down.has('ArrowLeft')) mx -= 1;
    if (this.down.has('KeyD') || this.down.has('ArrowRight')) mx += 1;
    if (this.down.has('KeyW') || this.down.has('ArrowUp')) my -= 1;
    if (this.down.has('KeyS') || this.down.has('ArrowDown')) my += 1;
    if (mx !== 0 && my !== 0) {
      const inv = 1 / Math.SQRT2;
      mx *= inv;
      my *= inv;
    }
    return { mx, my };
  }

  controls() {
    const { mx, my } = this.axis();
    return {
      mx,
      my,
      aimX: this.mouseX,
      aimY: this.mouseY,
      fire: this.mouseDown,
      dash: this.wasPressed('Space') || this.wasPressed('ShiftLeft') || this.wasPressed('ShiftRight'),
    };
  }

  // Call once per rendered frame, after the world has consumed the edges.
  endFrame() {
    this.pressed.clear();
    this.mouseClicked = false;
  }
}
