// The screenshot scenes behind ?shot=start|play|win|end. Each one plays the
// real rules forward from a fresh world for a fixed stretch, steered by an
// autopilot, so every frame is what a real game looks like and the same seed
// always gives the same frame. The win scene runs a charmed warden (wounds
// close at once, the staff never cools) so the victory screen is reached;
// the end scene runs a hurried pilot that is caught out, as a new player is.
import { VIEW, EMBER, PLAYER, STEP } from './config.js';
import { updateWorld, updateAmbient, resetRun } from './world.js';
import { SCREEN_TITLE, SCREEN_PLAY, SCREEN_OVER, SCREEN_WIN } from './render.js';

const START_SECONDS = 4;
const WIN_LIMIT_SECONDS = 600;
const END_LIMIT_SECONDS = 150;

function nearestFoe(world) {
  const player = world.player;
  let nearest = null;
  let nearestDist = Infinity;
  for (const enemy of world.enemies) {
    if (enemy.dead || enemy.spawnT > 0) continue;
    const d = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = enemy;
    }
  }
  return { enemy: nearest, dist: nearestDist };
}

// Steer away from near foes, toward pickups and the ember when hurt, and
// keep circling so the warden never stands still. The weak pilot reacts
// later, never dashes and aims loosely, so it is caught out.
function autopilot(world, skill) {
  const player = world.player;
  const weak = skill === 'weak';
  let mx = 0;
  let my = 0;
  const fleeRange = weak ? 150 : 250;
  for (const enemy of world.enemies) {
    if (enemy.dead || enemy.spawnT > 0) continue;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < fleeRange) {
      const weight = ((fleeRange - d) / fleeRange) * 2.2;
      mx += (dx / d) * weight;
      my += (dy / d) * weight;
    }
  }
  if (!weak) {
    let pickupTarget = null;
    let pickupDist = 280;
    for (const pickup of world.pickups) {
      const d = Math.hypot(pickup.x - player.x, pickup.y - player.y);
      if (d < pickupDist) {
        pickupDist = d;
        pickupTarget = pickup;
      }
    }
    if (pickupTarget) {
      mx += ((pickupTarget.x - player.x) / (pickupDist || 1)) * 0.9;
      my += ((pickupTarget.y - player.y) / (pickupDist || 1)) * 0.9;
    }
    if (player.hp < 40) {
      const dx = EMBER.x - player.x;
      const dy = EMBER.y - player.y;
      const d = Math.hypot(dx, dy) || 1;
      mx += (dx / d) * 1.2;
      my += (dy / d) * 1.2;
    }
  }
  const cx = player.x - VIEW.width / 2;
  const cy = player.y - VIEW.height / 2;
  const cd = Math.hypot(cx, cy) || 1;
  mx += (-cy / cd) * 0.35;
  my += (cx / cd) * 0.35;
  // Between fights, drift back to an orbit around the ember instead of
  // hugging the walls: the fight stays near the light it defends.
  const { enemy, dist } = nearestFoe(world);
  if (dist > 200) {
    const orbitAngle = world.time * 0.5;
    const orbitX = VIEW.width / 2 + Math.cos(orbitAngle) * 250;
    const orbitY = VIEW.height / 2 + Math.sin(orbitAngle) * 250;
    const odx = orbitX - player.x;
    const ody = orbitY - player.y;
    const od = Math.hypot(odx, ody) || 1;
    mx += (odx / od) * 0.8;
    my += (ody / od) * 0.8;
  }
  const margin = 70;
  if (player.x < margin) mx += 1;
  if (player.x > VIEW.width - margin) mx -= 1;
  if (player.y < margin) my += 1;
  if (player.y > VIEW.height - margin) my -= 1;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  let aimX = player.x + 100;
  let aimY = player.y;
  let fire = false;
  if (enemy && dist < 560) {
    fire = true;
    aimX = enemy.x;
    aimY = enemy.y;
    if (weak) {
      const error = Math.sin(world.time * 1.7) * 0.35;
      const dx = aimX - player.x;
      const dy = aimY - player.y;
      const cos = Math.cos(error);
      const sin = Math.sin(error);
      aimX = player.x + dx * cos - dy * sin;
      aimY = player.y + dx * sin + dy * cos;
    }
  }
  const dash = !weak && dist < 80 && player.dashCd <= 0;
  return { mx, my, aimX, aimY, fire, dash };
}

// How good a frame looks: a fight clustered around the warden, mid-screen,
// with more than one kind of foe. The strict form requires the warden inside
// the central region; the lenient form keeps any lively frame as a fallback.
function actionScore(world, strict) {
  if (world.over || world.won || world.time < 10) return -1;
  const player = world.player;
  if (strict && (player.x < 200 || player.x > 1080 || player.y < 120 || player.y > 600)) return -1;
  // The warden standing on the ember is swallowed by the flame: keep clear.
  if (strict && Math.hypot(player.x - EMBER.x, player.y - EMBER.y) < 70) return -1;
  let cluster = 0;
  const types = new Set();
  for (const enemy of world.enemies) {
    types.add(enemy.type);
    if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < 420) cluster += 1;
  }
  if (strict && cluster < 3) return -1;
  return cluster * 6 + world.bullets.length * 2 + world.pickups.length * 4
    + types.size * 8 + Math.min(world.combo, 8) + (world.wave - 1) * 2;
}

// Two passes over the same deterministic run: the first finds the liveliest
// moment in 70 seconds of play, the second replays exactly to that step, so
// the gameplay frame always shows a real fight, not a quiet gap.
function stagePlay(world, seed) {
  const totalSteps = Math.floor(70 / STEP);
  let bestStep = 0;
  let bestScore = -1;
  let fallbackStep = 0;
  let fallbackScore = -1;
  for (let i = 0; i < totalSteps; i += 1) {
    if (world.over || world.won) break;
    updateWorld(world, STEP, autopilot(world, 'strong'), null);
    const strict = actionScore(world, true);
    if (strict > bestScore) {
      bestScore = strict;
      bestStep = i + 1;
    }
    const lenient = actionScore(world, false);
    if (lenient > fallbackScore) {
      fallbackScore = lenient;
      fallbackStep = i + 1;
    }
  }
  const targetStep = bestStep > 0 ? bestStep : fallbackStep;
  if (targetStep === 0) {
    resetRun(world, seed);
    world.best = 0;
    simulate(world, 20, 'strong', false);
    return { screen: world.over ? SCREEN_OVER : SCREEN_PLAY };
  }
  resetRun(world, seed);
  world.best = 0;
  for (let i = 0; i < targetStep; i += 1) {
    updateWorld(world, STEP, autopilot(world, 'strong'), null);
  }
  return { screen: SCREEN_PLAY };
}

function simulate(world, seconds, skill, charm) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.over || world.won) break;
    if (charm) {
      world.player.hp = PLAYER.maxHp;
      world.player.rapid = 999;
    }
    updateWorld(world, STEP, autopilot(world, skill), null);
  }
}

// Nudge the ambient clock forward (at most ~2.2s of drifting embers) until
// the pulsing "press R / click to begin" prompt sits at its bright phase, so
// staged end and title frames never catch it dim.
function brightenPulse(world) {
  for (let i = 0; i < 130 && Math.sin(world.time * 3) < 0.9; i += 1) {
    updateAmbient(world, STEP);
  }
}

// Set `world` to the named scene and return the screen to draw over it.
export function stageShot(name, world, seed) {
  resetRun(world, seed);
  world.best = 0;
  if (name === 'play') {
    return stagePlay(world, seed);
  }
  if (name === 'win') {
    simulate(world, WIN_LIMIT_SECONDS, 'strong', true);
    brightenPulse(world);
    return { screen: world.won ? SCREEN_WIN : SCREEN_PLAY };
  }
  if (name === 'end') {
    simulate(world, END_LIMIT_SECONDS, 'weak', false);
    if (!world.over) {
      const idle = { mx: 0, my: 0, aimX: world.player.x + 100, aimY: world.player.y, fire: false, dash: false };
      for (let i = 0; i < 60 / STEP && !world.over; i += 1) {
        updateWorld(world, STEP, idle, null);
      }
    }
    // Let the death flash settle for a third of a second: the burst hangs in
    // the air instead of washing the whole frame red.
    const idle = { mx: 0, my: 0, aimX: world.player.x + 100, aimY: world.player.y, fire: false, dash: false };
    for (let i = 0; i < 20; i += 1) updateWorld(world, STEP, idle, null);
    brightenPulse(world);
    return { screen: world.over ? SCREEN_OVER : SCREEN_PLAY };
  }
  for (let i = 0; i < START_SECONDS / STEP; i += 1) updateAmbient(world, STEP);
  brightenPulse(world);
  return { screen: SCREEN_TITLE };
}
