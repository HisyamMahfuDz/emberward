// Boot, the fixed-step loop and the screen state machine: title, play,
// pause, game over and victory. The world advances in STEP-sized slices no
// matter the display's refresh rate, so play feels the same everywhere and
// staged screenshots replay exactly.
import { VIEW, STEP } from './config.js';
import { Input } from './input.js';
import { SoundFX } from './audio.js';
import { createWorld, resetRun, updateWorld, updateAmbient } from './world.js';
import { drawScene, SCREEN_TITLE, SCREEN_PLAY, SCREEN_OVER, SCREEN_WIN, SCREEN_PAUSE } from './render.js';
import { stageShot } from './shots.js';

const BEST_KEY = 'emberward-best';

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(best) {
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    // Private mode or no storage: the best score simply does not persist.
  }
}

function clockSeed() {
  return (Date.now() % 2147483647) + 1;
}

function boot() {
  const canvas = document.getElementById('game');
  const status = document.getElementById('status');
  const ctx = canvas.getContext('2d');
  const input = new Input(canvas);
  const sfx = new SoundFX();
  const world = createWorld(clockSeed(), loadBest());

  let screen = SCREEN_TITLE;
  let staged = false;
  let hintTimer = 0;

  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    const seed = Number(params.get('seed')) || 7;
    staged = true;
    screen = stageShot(shot, world, seed).screen;
  }

  function fitCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(VIEW.width * dpr);
    canvas.height = Math.round(VIEW.height * dpr);
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  function announce(message) {
    if (status) status.textContent = message;
  }

  function startRun() {
    resetRun(world, clockSeed());
    world.best = Math.max(world.best, loadBest());
    screen = SCREEN_PLAY;
    hintTimer = 0;
    announce('The night begins. Survive ten waves.');
  }

  function setScreen(next, message) {
    screen = next;
    if (message) announce(message);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY && !staged) setScreen(SCREEN_PAUSE, 'Paused.');
  });

  // A small hook for headless verification: the state is readable, and
  // nothing about the game changes when it is read.
  window.EMBERWARD = {
    world,
    get screen() { return screen; },
    get staged() { return staged; },
  };

  let last = performance.now();
  let accumulator = 0;
  let pendingDash = false;

  function frame(now) {
    requestAnimationFrame(frame);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (staged) {
      // A staged scene is a photograph, but the game behind it stays live:
      // R, Enter or a click leaves staging and starts a real run.
      if (input.wasPressed('KeyR') || input.wasPressed('Enter') || input.wasClicked()) {
        staged = false;
        sfx.click();
        startRun();
      }
      drawScene(ctx, world, screen, { mouseX: input.mouseX, mouseY: input.mouseY, muted: sfx.muted, hintAlpha: 0 });
      input.endFrame();
      return;
    }

    if (input.anyGesture) sfx.unlock();
    if (input.wasPressed('KeyM')) {
      const muted = sfx.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }

    const elapsed = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (screen === SCREEN_TITLE) {
      updateAmbient(world, elapsed);
      if (input.wasPressed('Enter') || input.wasClicked()) {
        sfx.click();
        startRun();
      }
    } else if (screen === SCREEN_PLAY) {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
        setScreen(SCREEN_PAUSE, 'Paused.');
      } else {
        accumulator += elapsed;
        // Read the controls once per frame. A dash pressed on a frame that
        // runs no step must survive to the next frame, or the edge is eaten.
        const controls = input.controls();
        controls.dash = controls.dash || pendingDash;
        pendingDash = false;
        let steps = 0;
        while (accumulator >= STEP && steps < 5) {
          updateWorld(world, STEP, controls, sfx);
          accumulator -= STEP;
          steps += 1;
        }
        if (steps === 0 && controls.dash) pendingDash = true;
        if (steps === 5) accumulator = 0;
        hintTimer += elapsed;
        if (world.over) {
          saveBest(world.best);
          setScreen(SCREEN_OVER, `The light fades. Score ${world.score}.`);
        } else if (world.won) {
          saveBest(world.best);
          setScreen(SCREEN_WIN, `Dawn breaks. Score ${world.score}.`);
        }
      }
    } else if (screen === SCREEN_PAUSE) {
      if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
        setScreen(SCREEN_PLAY, 'Back to the fight.');
        last = performance.now();
      } else if (input.wasPressed('KeyR')) {
        startRun();
      }
    } else if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      updateAmbient(world, elapsed);
      if (input.wasPressed('KeyR') || input.wasPressed('Enter') || input.wasClicked()) {
        sfx.click();
        startRun();
      }
    }

    const hintAlpha = screen === SCREEN_PLAY ? Math.max(0, Math.min(1, (12 - hintTimer) / 3)) : 0;
    drawScene(ctx, world, screen, { mouseX: input.mouseX, mouseY: input.mouseY, muted: sfx.muted, hintAlpha });
    input.endFrame();
  }

  announce('Emberward. Keep the last ember burning through the night.');
  requestAnimationFrame(frame);
}

boot();
