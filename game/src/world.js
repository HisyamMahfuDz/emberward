// The simulation: one state object, advanced in fixed steps by updateWorld.
// No DOM, no canvas here — the same code runs in the browser, in the
// screenshot autopilot, and in a headless Node check. All randomness flows
// through the world's seeded stream, so a fixed seed replays a run exactly.
import {
  VIEW, STEP, EMBER, PLAYER, ENEMIES, SPAWN_IN, MAX_ALIVE, CONTACT_COOLDOWN,
  WAVES, TOTAL_WAVES, BANNER_TIME, CLEAR_TIME, CLEAR_BONUS, COMBO, PICKUPS,
  PICKUP_MAGNET, PICKUP_COLLECT, PARTICLE_CAP,
} from './config.js';
import { makeRng, range, chance, shuffle } from './random.js';

export const PHASE_BANNER = 'banner';
export const PHASE_ACTIVE = 'active';
export const PHASE_CLEAR = 'clear';

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function makeStarfield(rng) {
  const stars = [];
  for (let i = 0; i < 140; i += 1) {
    stars.push({ x: rng() * VIEW.width, y: rng() * VIEW.height, r: range(rng, 0.5, 1.8), tw: range(rng, 0, Math.PI * 2) });
  }
  const nebulae = [];
  const colors = ['#2a1b4e', '#12333d', '#241a45'];
  for (let i = 0; i < 5; i += 1) {
    nebulae.push({ x: rng() * VIEW.width, y: rng() * VIEW.height, r: range(rng, 180, 340), color: colors[i % colors.length] });
  }
  return { stars, nebulae };
}

export function createWorld(seed, best = 0) {
  const rng = makeRng(seed);
  const { stars, nebulae } = makeStarfield(rng);
  const world = {
    seed, rng, time: 0, best,
    player: null, enemies: [], bullets: [], particles: [], pickups: [], floaters: [],
    pendingEnemies: [], stars, nebulae,
    wave: 0, wavePhase: PHASE_BANNER, phaseTimer: 0,
    spawnQueue: [], spawnTimer: 0,
    score: 0, combo: 0, comboTimer: 0, kills: 0, shotsFired: 0, shotsHit: 0,
    shake: 0, flash: 0, healGlow: 0, over: false, won: false, started: false,
  };
  resetRun(world, seed);
  return world;
}

export function resetRun(world, seed) {
  world.rng = makeRng(seed);
  world.time = 0;
  world.player = {
    x: VIEW.width / 2, y: VIEW.height - 150, vx: 0, vy: 0,
    hp: PLAYER.maxHp, aim: -Math.PI / 2, fireTimer: 0,
    dashTime: 0, dashCd: 0, dashX: 0, dashY: 1, invuln: 1, rapid: 0,
  };
  world.enemies = [];
  world.bullets = [];
  world.particles = [];
  world.pickups = [];
  world.floaters = [];
  world.pendingEnemies = [];
  world.wave = 1;
  world.wavePhase = PHASE_BANNER;
  world.phaseTimer = BANNER_TIME;
  world.spawnQueue = [];
  world.spawnTimer = 0;
  world.score = 0;
  world.combo = 0;
  world.comboTimer = 0;
  world.kills = 0;
  world.shotsFired = 0;
  world.shotsHit = 0;
  world.shake = 0;
  world.flash = 0;
  world.healGlow = 0;
  world.over = false;
  world.won = false;
  world.started = true;
}

// Ambient drift behind the title screen: embers rise, nothing fights.
export function updateAmbient(world, dt) {
  world.time += dt;
  if (chance(world.rng, dt * 14)) spawnEmberMote(world);
  updateParticles(world, dt);
  updateFloaters(world, dt);
}

function spawnEmberMote(world) {
  const rng = world.rng;
  addParticle(world, {
    x: EMBER.x + range(rng, -26, 26), y: EMBER.y + range(rng, -8, 8),
    vx: range(rng, -8, 8), vy: range(rng, -46, -22),
    life: range(rng, 1.2, 2.6), size: range(rng, 1.5, 3.2),
    color: rng() < 0.5 ? '#ffb347' : '#ff7847', kind: 'dot', drag: 0.4,
  });
}

export function addParticle(world, particle) {
  if (world.particles.length >= PARTICLE_CAP) world.particles.splice(0, world.particles.length - PARTICLE_CAP + 1);
  world.particles.push({ maxLife: particle.life, ...particle });
}

export function burst(world, x, y, color, count, speed, size = 3) {
  for (let i = 0; i < count; i += 1) {
    const angle = world.rng() * Math.PI * 2;
    const v = range(world.rng, speed * 0.3, speed);
    addParticle(world, {
      x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
      life: range(world.rng, 0.3, 0.7), size: range(world.rng, size * 0.5, size * 1.4),
      color, kind: 'dot', drag: 3.2,
    });
  }
}

export function ring(world, x, y, color, maxRadius = 60, life = 0.4) {
  addParticle(world, { x, y, vx: 0, vy: 0, life, size: 4, color, kind: 'ring', drag: 0, maxRadius });
}

export function addFloater(world, x, y, text, color, size = 18) {
  world.floaters.push({ x, y, vy: -46, life: 0.95, maxLife: 0.95, text, color, size });
}

function addShake(world, amount) {
  world.shake = Math.min(15, world.shake + amount);
}

export function foesRemaining(world) {
  return world.enemies.length + world.spawnQueue.length;
}

function buildSpawnQueue(world) {
  const spec = WAVES[world.wave - 1];
  const queue = [];
  for (const [type, count] of Object.entries(spec)) {
    if (type === 'interval') continue;
    for (let i = 0; i < count; i += 1) queue.push(type);
  }
  world.spawnQueue = shuffle(world.rng, queue);
  world.spawnTimer = 0.4;
}

function edgeSpawnPoint(world) {
  const side = Math.floor(world.rng() * 4);
  const margin = 24;
  if (side === 0) return { x: range(world.rng, 0, VIEW.width), y: -margin };
  if (side === 1) return { x: VIEW.width + margin, y: range(world.rng, 0, VIEW.height) };
  if (side === 2) return { x: range(world.rng, 0, VIEW.width), y: VIEW.height + margin };
  return { x: -margin, y: range(world.rng, 0, VIEW.height) };
}

export function spawnEnemy(world, type, x = null, y = null, quick = false) {
  const kind = ENEMIES[type];
  const point = x === null ? edgeSpawnPoint(world) : { x, y };
  world.enemies.push({
    type, x: point.x, y: point.y, kx: 0, ky: 0,
    hp: kind.hp, maxHp: kind.hp, radius: kind.radius,
    spawnT: quick ? 0.25 : SPAWN_IN, hitCd: 0, flash: 0,
    phase: world.rng() * Math.PI * 2, burstTimer: range(world.rng, 1.5, 2.5),
    dead: false,
  });
}

function comboMultiplier(world) {
  return 1 + Math.max(0, world.combo - 1) * COMBO.step;
}

function awardKill(world, enemy, sfx) {
  world.kills += 1;
  world.combo = Math.min(world.combo + 1, COMBO.cap);
  world.comboTimer = COMBO.window;
  const gained = Math.round(ENEMIES[enemy.type].score * comboMultiplier(world));
  world.score += gained;
  addFloater(world, enemy.x, enemy.y - 10, `+${gained}`, '#ffd166', enemy.type === 'wisp' ? 16 : 20);
  burst(world, enemy.x, enemy.y, ENEMIES[enemy.type].color, enemy.type === 'bulwark' ? 26 : 14, 210);
  if (enemy.type === 'bulwark' || enemy.type === 'elite') {
    ring(world, enemy.x, enemy.y, ENEMIES[enemy.type].color, 80, 0.45);
    addShake(world, 5);
  }
  if (sfx) sfx.enemyDie(enemy.type === 'bulwark' || enemy.type === 'elite');
  rollDrop(world, enemy);
  const splits = enemy.type === 'bulwark' ? 'wisp' : enemy.type === 'elite' ? 'skitter' : null;
  if (splits) {
    for (let i = 0; i < 2; i += 1) {
      const angle = world.rng() * Math.PI * 2;
      world.pendingEnemies.push({ type: splits, x: enemy.x + Math.cos(angle) * 20, y: enemy.y + Math.sin(angle) * 20 });
    }
  }
}

function rollDrop(world, enemy) {
  const roll = world.rng();
  let type = null;
  if (roll < PICKUPS.nova.drop) type = 'nova';
  else if (roll < PICKUPS.nova.drop + PICKUPS.star.drop) type = 'star';
  else if (roll < PICKUPS.nova.drop + PICKUPS.star.drop + PICKUPS.heart.drop) type = 'heart';
  if (!type) return;
  world.pickups.push({
    type, x: enemy.x, y: enemy.y, vx: range(world.rng, -40, 40), vy: range(world.rng, -40, 40),
    life: PICKUPS[type].life, bob: world.rng() * Math.PI * 2,
  });
}

export function damageEnemy(world, enemy, damage, dirX, dirY, sfx) {
  if (enemy.dead) return;
  const kind = ENEMIES[enemy.type];
  enemy.hp -= damage;
  enemy.flash = 0.09;
  enemy.kx += dirX * kind.knockback;
  enemy.ky += dirY * kind.knockback;
  burst(world, enemy.x, enemy.y, '#ffffff', 3, 130, 2);
  if (enemy.hp <= 0) {
    enemy.dead = true;
    awardKill(world, enemy, sfx);
  }
}

function damagePlayer(world, damage, fromX, fromY, sfx) {
  const player = world.player;
  if (player.invuln > 0 || world.over) return;
  player.hp -= damage;
  player.invuln = PLAYER.hitInvuln;
  const dx = player.x - fromX;
  const dy = player.y - fromY;
  const len = Math.hypot(dx, dy) || 1;
  player.vx += (dx / len) * PLAYER.contactKnockback;
  player.vy += (dy / len) * PLAYER.contactKnockback;
  world.flash = 0.55;
  addShake(world, 8);
  burst(world, player.x, player.y, '#ff4d5e', 16, 240);
  if (sfx) sfx.playerHit();
  if (player.hp <= 0) {
    player.hp = 0;
    world.over = true;
    burst(world, player.x, player.y, '#ffb347', 46, 320, 4);
    ring(world, player.x, player.y, '#ff7847', 130, 0.7);
    if (sfx) sfx.gameOver();
  }
}

function detonateNova(world, x, y, sfx) {
  ring(world, x, y, PICKUPS.nova.color, 340, 0.6);
  burst(world, x, y, PICKUPS.nova.color, 40, 420, 4);
  addShake(world, 10);
  if (sfx) sfx.nova();
  for (const enemy of world.enemies.slice()) {
    const dx = enemy.x - x;
    const dy = enemy.y - y;
    const len = Math.hypot(dx, dy) || 1;
    damageEnemy(world, enemy, PICKUPS.nova.damage, dx / len, dy / len, sfx);
  }
}

function collectPickup(world, pickup, sfx) {
  const player = world.player;
  if (pickup.type === 'heart') {
    player.hp = Math.min(PLAYER.maxHp, player.hp + 30);
    addFloater(world, player.x, player.y - 26, '+30 HP', PICKUPS.heart.color, 20);
  } else if (pickup.type === 'star') {
    player.rapid = PICKUPS.star.rapidTime;
    addFloater(world, player.x, player.y - 26, 'RAPID FIRE!', PICKUPS.star.color, 20);
  } else if (pickup.type === 'nova') {
    addFloater(world, player.x, player.y - 26, 'NOVA!', PICKUPS.nova.color, 22);
    detonateNova(world, player.x, player.y, sfx);
  }
  burst(world, pickup.x, pickup.y, PICKUPS[pickup.type].color, 12, 160);
  if (sfx) sfx.pickup();
}

function fireBullet(world, sfx) {
  const player = world.player;
  const cos = Math.cos(player.aim);
  const sin = Math.sin(player.aim);
  world.bullets.push({
    x: player.x + cos * 22, y: player.y + sin * 22,
    vx: cos * PLAYER.bulletSpeed, vy: sin * PLAYER.bulletSpeed,
    life: PLAYER.bulletLife, dead: false,
  });
  world.shotsFired += 1;
  addParticle(world, {
    x: player.x + cos * 24, y: player.y + sin * 24, vx: cos * 60, vy: sin * 60,
    life: 0.08, size: 7, color: '#ffe8a3', kind: 'dot', drag: 0,
  });
  if (sfx) sfx.shoot();
}

function updatePlayer(world, dt, controls, sfx) {
  const player = world.player;
  player.aim = Math.atan2(controls.aimY - player.y, controls.aimX - player.x);
  player.invuln = Math.max(0, player.invuln - dt);
  player.dashCd = Math.max(0, player.dashCd - dt);
  player.rapid = Math.max(0, player.rapid - dt);

  if (controls.dash && player.dashCd <= 0 && player.dashTime <= 0) {
    const moving = controls.mx !== 0 || controls.my !== 0;
    const dx = moving ? controls.mx : Math.cos(player.aim);
    const dy = moving ? controls.my : Math.sin(player.aim);
    const len = Math.hypot(dx, dy) || 1;
    player.dashX = dx / len;
    player.dashY = dy / len;
    player.dashTime = PLAYER.dashTime;
    player.dashCd = PLAYER.dashCooldown;
    player.invuln = Math.max(player.invuln, PLAYER.dashTime + 0.05);
    if (sfx) sfx.dash();
  }

  if (player.dashTime > 0) {
    player.dashTime -= dt;
    player.vx = player.dashX * PLAYER.dashSpeed;
    player.vy = player.dashY * PLAYER.dashSpeed;
    addParticle(world, {
      x: player.x, y: player.y, vx: -player.dashX * 40, vy: -player.dashY * 40,
      life: 0.3, size: 8, color: '#ff9a3c', kind: 'dot', drag: 2,
    });
  } else {
    player.vx += controls.mx * PLAYER.accel * dt;
    player.vy += controls.my * PLAYER.accel * dt;
    const drag = Math.exp(-PLAYER.friction * dt);
    if (controls.mx === 0) player.vx *= drag;
    if (controls.my === 0) player.vy *= drag;
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > PLAYER.maxSpeed) {
      player.vx = (player.vx / speed) * PLAYER.maxSpeed;
      player.vy = (player.vy / speed) * PLAYER.maxSpeed;
    }
  }
  player.x = Math.min(VIEW.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + player.vx * dt));
  player.y = Math.min(VIEW.height - PLAYER.radius, Math.max(PLAYER.radius, player.y + player.vy * dt));

  player.fireTimer -= dt;
  if (controls.fire && player.fireTimer <= 0 && !world.over) {
    fireBullet(world, sfx);
    player.fireTimer = player.rapid > 0 ? PLAYER.rapidInterval : PLAYER.fireInterval;
  }

  // The ember mends whoever stands in its light.
  world.healGlow = Math.max(0, world.healGlow - dt * 2);
  const nearEmber = dist(player.x, player.y, EMBER.x, EMBER.y) < EMBER.healRadius;
  if (nearEmber && player.hp < PLAYER.maxHp && !world.over) {
    player.hp = Math.min(PLAYER.maxHp, player.hp + EMBER.healRate * dt);
    world.healGlow = 1;
    if (chance(world.rng, dt * 10)) {
      addParticle(world, {
        x: player.x + range(world.rng, -14, 14), y: player.y + range(world.rng, -6, 10),
        vx: 0, vy: -34, life: 0.7, size: 2.5, color: '#7dfcd0', kind: 'dot', drag: 0.5,
      });
    }
  }
}

function updateEnemies(world, dt, sfx) {
  const player = world.player;
  const enemies = world.enemies;
  for (const enemy of enemies) {
    if (enemy.dead) continue;
    enemy.flash = Math.max(0, enemy.flash - dt);
    enemy.hitCd = Math.max(0, enemy.hitCd - dt);
    if (enemy.spawnT > 0) {
      enemy.spawnT -= dt;
      continue;
    }
    const kind = ENEMIES[enemy.type];
    let tx = player.x;
    let ty = player.y;
    if (enemy.type === 'elite') {
      tx += player.vx * 0.35;
      ty += player.vy * 0.35;
    }
    let dx = tx - enemy.x;
    let dy = ty - enemy.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    let speed = kind.speed;
    let wobble = 0;
    if (enemy.type === 'wisp') wobble = Math.sin(world.time * 2.2 + enemy.phase) * 0.55;
    if (enemy.type === 'skitter') wobble = Math.sin(world.time * 5 + enemy.phase) * 0.9;
    if (enemy.type === 'elite') {
      enemy.burstTimer -= dt;
      if (enemy.burstTimer <= -0.5) enemy.burstTimer = 2.5;
      if (enemy.burstTimer <= 0) speed *= 1.6;
    }
    const px = -dy * wobble;
    const py = dx * wobble;
    enemy.x += (dx * speed + px * speed + enemy.kx) * dt;
    enemy.y += (dy * speed + py * speed + enemy.ky) * dt;
    const decay = Math.exp(-6 * dt);
    enemy.kx *= decay;
    enemy.ky *= decay;
    enemy.x = Math.min(VIEW.width + 30, Math.max(-30, enemy.x));
    enemy.y = Math.min(VIEW.height + 30, Math.max(-30, enemy.y));

    if (enemy.hitCd <= 0 && dist(enemy.x, enemy.y, player.x, player.y) < enemy.radius + PLAYER.radius - 2) {
      damagePlayer(world, kind.damage, enemy.x, enemy.y, sfx);
      enemy.hitCd = CONTACT_COOLDOWN;
      enemy.kx -= dx * 120;
      enemy.ky -= dy * 120;
      if (world.over) return;
    }
  }
  // Gentle separation so foes do not stack into one blob.
  for (let i = 0; i < enemies.length; i += 1) {
    const a = enemies[i];
    if (a.dead || a.spawnT > 0) continue;
    for (let j = i + 1; j < enemies.length; j += 1) {
      const b = enemies[j];
      if (b.dead || b.spawnT > 0) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = a.radius + b.radius - 4;
      if (d > 0 && d < min) {
        const push = (min - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }
}

function updateBullets(world, dt, sfx) {
  for (const bullet of world.bullets) {
    if (bullet.dead) continue;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (bullet.life <= 0 || bullet.x < -20 || bullet.x > VIEW.width + 20 || bullet.y < -20 || bullet.y > VIEW.height + 20) {
      bullet.dead = true;
      continue;
    }
    for (const enemy of world.enemies) {
      if (enemy.dead || enemy.spawnT > 0.35) continue;
      if (dist(bullet.x, bullet.y, enemy.x, enemy.y) < enemy.radius + PLAYER.bulletRadius) {
        bullet.dead = true;
        world.shotsHit += 1;
        const len = Math.hypot(bullet.vx, bullet.vy) || 1;
        damageEnemy(world, enemy, PLAYER.bulletDamage, bullet.vx / len, bullet.vy / len, sfx);
        break;
      }
    }
  }
}

function updatePickups(world, dt, sfx) {
  const player = world.player;
  for (const pickup of world.pickups) {
    pickup.life -= dt;
    pickup.bob += dt * 3;
    const d = dist(pickup.x, pickup.y, player.x, player.y);
    if (d < PICKUP_MAGNET && !world.over) {
      const pull = 620 * dt;
      pickup.vx += ((player.x - pickup.x) / (d || 1)) * pull;
      pickup.vy += ((player.y - pickup.y) / (d || 1)) * pull;
    }
    const drag = Math.exp(-3 * dt);
    pickup.vx *= drag;
    pickup.vy *= drag;
    pickup.x += pickup.vx * dt;
    pickup.y += pickup.vy * dt;
    if (d < PICKUP_COLLECT && !world.over) {
      pickup.life = 0;
      collectPickup(world, pickup, sfx);
    }
  }
  world.pickups = world.pickups.filter((pickup) => pickup.life > 0);
}

function updateParticles(world, dt) {
  for (const particle of world.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    const drag = Math.exp(-(particle.drag || 0) * dt);
    particle.vx *= drag;
    particle.vy *= drag;
  }
  world.particles = world.particles.filter((particle) => particle.life > 0);
}

function updateFloaters(world, dt) {
  for (const floater of world.floaters) {
    floater.life -= dt;
    floater.y += floater.vy * dt;
  }
  world.floaters = world.floaters.filter((floater) => floater.life > 0);
}

function updateWaves(world, dt, sfx) {
  if (world.wavePhase === PHASE_BANNER) {
    world.phaseTimer -= dt;
    if (world.phaseTimer <= 0) {
      world.wavePhase = PHASE_ACTIVE;
      buildSpawnQueue(world);
    }
    return;
  }
  if (world.wavePhase === PHASE_ACTIVE) {
    if (world.spawnQueue.length > 0) {
      world.spawnTimer -= dt;
      if (world.spawnTimer <= 0 && world.enemies.length < MAX_ALIVE) {
        spawnEnemy(world, world.spawnQueue.shift());
        world.spawnTimer = WAVES[world.wave - 1].interval;
      }
    } else if (world.enemies.length === 0 && world.pendingEnemies.length === 0) {
      const bonus = CLEAR_BONUS(world.wave);
      world.score += bonus;
      addFloater(world, VIEW.width / 2, 150, `WAVE CLEAR  +${bonus}`, '#ffd166', 26);
      world.wavePhase = PHASE_CLEAR;
      world.phaseTimer = CLEAR_TIME;
      if (sfx) sfx.waveClear();
    }
    return;
  }
  world.phaseTimer -= dt;
  if (world.phaseTimer <= 0) {
    if (world.wave >= TOTAL_WAVES) {
      world.won = true;
      if (sfx) sfx.victory();
    } else {
      world.wave += 1;
      world.wavePhase = PHASE_BANNER;
      world.phaseTimer = BANNER_TIME;
      if (sfx) sfx.waveStart();
    }
  }
}

export function updateWorld(world, dt, controls, sfx) {
  world.time += dt;
  if (world.over || world.won) {
    updateParticles(world, dt);
    updateFloaters(world, dt);
    world.shake *= Math.exp(-4 * dt);
    world.flash *= Math.exp(-3 * dt);
    return;
  }
  updatePlayer(world, dt, controls, sfx);
  updateEnemies(world, dt, sfx);
  updateBullets(world, dt, sfx);
  updatePickups(world, dt, sfx);
  updateParticles(world, dt);
  updateFloaters(world, dt);
  if (chance(world.rng, dt * 10)) spawnEmberMote(world);
  if (world.comboTimer > 0) {
    world.comboTimer -= dt;
    if (world.comboTimer <= 0) world.combo = 0;
  }
  updateWaves(world, dt, sfx);
  for (const pending of world.pendingEnemies) {
    spawnEnemy(world, pending.type, pending.x, pending.y, true);
  }
  world.pendingEnemies = [];
  world.enemies = world.enemies.filter((enemy) => !enemy.dead);
  world.bullets = world.bullets.filter((bullet) => !bullet.dead);
  world.shake *= Math.exp(-4 * dt);
  world.flash *= Math.exp(-3 * dt);
  if (world.score > world.best) world.best = world.score;
}

export { STEP };
