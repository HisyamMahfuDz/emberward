// Everything the player sees: the night sky, the ember, the warden, the
// shadow-kind, the HUD and every menu screen. Drawing only — no game rules
// live here, so the simulation stays testable without a canvas.
import { VIEW, PALETTE, EMBER, PLAYER, ENEMIES, TOTAL_WAVES } from './config.js';
import { foesRemaining, PHASE_BANNER, PHASE_CLEAR } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';
export const SCREEN_PAUSE = 'pause';

const FONT = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif';
const bgCache = new WeakMap();

function text(ctx, str, x, y, { size = 16, weight = 700, color = PALETTE.ink, align = 'center', alpha = 1, spacing = 0 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  try { ctx.letterSpacing = `${spacing}px`; } catch { /* older canvas: ignore */ }
  ctx.fillText(str, x, y);
  ctx.restore();
}

function panel(ctx, x, y, w, h, fill = 'rgba(8, 10, 24, 0.72)', stroke = 'rgba(255, 209, 102, 0.25)') {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function glowCircle(ctx, x, y, radius, color, alpha) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function buildBackground(world) {
  const canvas = document.createElement('canvas');
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  sky.addColorStop(0, PALETTE.skyTop);
  sky.addColorStop(1, PALETTE.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  for (const nebula of world.nebulae) {
    const gradient = ctx.createRadialGradient(nebula.x, nebula.y, 0, nebula.x, nebula.y, nebula.r);
    gradient.addColorStop(0, nebula.color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(nebula.x, nebula.y, nebula.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const vignette = ctx.createRadialGradient(
    VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.36,
    VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.85,
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(2, 3, 10, 0.55)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  return canvas;
}

function drawBackground(ctx, world) {
  let bg = bgCache.get(world);
  if (!bg) {
    bg = buildBackground(world);
    bgCache.set(world, bg);
  }
  ctx.drawImage(bg, 0, 0);
  for (const star of world.stars) {
    const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(world.time * 0.9 + star.tw));
    ctx.save();
    ctx.globalAlpha = twinkle;
    ctx.fillStyle = PALETTE.star;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawEmber(ctx, world) {
  const flicker = 1 + 0.06 * Math.sin(world.time * 7) + 0.04 * Math.sin(world.time * 13 + 1.7);
  const healBoost = world.healGlow * 0.35;
  glowCircle(ctx, EMBER.x, EMBER.y, 190 * flicker, 'rgba(255, 122, 47, 0.5)', 0.5 + healBoost);
  // The healing ring: step inside and the ember mends you.
  ctx.save();
  ctx.strokeStyle = `rgba(255, 179, 71, ${0.22 + healBoost})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 14]);
  ctx.lineDashOffset = -world.time * 18;
  ctx.beginPath();
  ctx.arc(EMBER.x, EMBER.y, EMBER.healRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  // Brazier: a ring of dark stones.
  ctx.save();
  ctx.fillStyle = '#1b2138';
  ctx.beginPath();
  ctx.ellipse(EMBER.x, EMBER.y + 16, 44, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a3358';
  ctx.beginPath();
  ctx.ellipse(EMBER.x, EMBER.y + 12, 44, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#12172b';
  ctx.beginPath();
  ctx.ellipse(EMBER.x, EMBER.y + 11, 32, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // The flame: three layered tongues that sway with the night.
  const sway = Math.sin(world.time * 3.1) * 5;
  const flame = (height, width, color) => {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(EMBER.x - width, EMBER.y + 10);
    ctx.bezierCurveTo(EMBER.x - width * 1.1, EMBER.y - height * 0.45, EMBER.x + sway * 0.4, EMBER.y - height * 0.8, EMBER.x + sway, EMBER.y - height);
    ctx.bezierCurveTo(EMBER.x + sway * 0.6, EMBER.y - height * 0.55, EMBER.x + width * 1.1, EMBER.y - height * 0.4, EMBER.x + width, EMBER.y + 10);
    ctx.quadraticCurveTo(EMBER.x, EMBER.y + 18, EMBER.x - width, EMBER.y + 10);
    ctx.fill();
    ctx.restore();
  };
  flame(52 * flicker, 20, PALETTE.emberOuter);
  flame(38 * flicker, 13, PALETTE.emberMid);
  flame(22 * flicker, 7, PALETTE.emberCore);
}

function drawPlayer(ctx, world) {
  const player = world.player;
  if (world.over) return;
  const blink = player.invuln > 0 && player.dashTime <= 0 && Math.floor(world.time * 14) % 2 === 0;
  ctx.save();
  if (blink) ctx.globalAlpha = 0.45;
  glowCircle(ctx, player.x, player.y, 46, 'rgba(255, 154, 60, 0.55)', 0.55);
  // Cloak: a warm disc with a darker rim and a bright heart.
  const cloak = ctx.createRadialGradient(player.x - 4, player.y - 5, 2, player.x, player.y, PLAYER.radius + 3);
  cloak.addColorStop(0, '#ffc46b');
  cloak.addColorStop(0.55, PALETTE.playerBody);
  cloak.addColorStop(1, '#c95a1e');
  ctx.fillStyle = cloak;
  ctx.beginPath();
  ctx.arc(player.x, player.y, PLAYER.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60, 20, 4, 0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Hood shading toward the aim, and the warden's lit gaze.
  ctx.fillStyle = '#7a2f0e';
  ctx.beginPath();
  ctx.arc(player.x + Math.cos(player.aim) * 4, player.y + Math.sin(player.aim) * 4, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.playerTrim;
  ctx.beginPath();
  ctx.arc(player.x + Math.cos(player.aim) * 6, player.y + Math.sin(player.aim) * 6, 2.6, 0, Math.PI * 2);
  ctx.fill();
  // Staff, pointing where the warden aims.
  const sx = player.x + Math.cos(player.aim) * 12;
  const sy = player.y + Math.sin(player.aim) * 12;
  const tx = player.x + Math.cos(player.aim) * 27;
  const ty = player.y + Math.sin(player.aim) * 27;
  ctx.strokeStyle = '#8a5a2b';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  glowCircle(ctx, tx, ty, player.rapid > 0 ? 18 : 13, 'rgba(255, 232, 163, 0.9)', 0.8);
  ctx.fillStyle = PALETTE.bullet;
  ctx.beginPath();
  ctx.arc(tx, ty, player.rapid > 0 ? 5 : 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(ctx, world, enemy) {
  const kind = ENEMIES[enemy.type];
  const fadeIn = enemy.spawnT > 0 ? 1 - enemy.spawnT / 0.6 : 1;
  const scale = enemy.spawnT > 0 ? 0.6 + 0.4 * fadeIn : 1;
  ctx.save();
  ctx.globalAlpha = Math.max(0, fadeIn);
  ctx.translate(enemy.x, enemy.y);
  ctx.scale(scale, scale);
  glowCircle(ctx, 0, 0, enemy.radius * 2.1, kind.color, 0.28);
  if (enemy.type === 'wisp') {
    const bob = Math.sin(world.time * 3 + enemy.phase) * 3;
    ctx.fillStyle = kind.color;
    ctx.beginPath();
    ctx.arc(0, bob, enemy.radius, Math.PI, 0);
    ctx.lineTo(enemy.radius, bob + 8);
    for (let i = 0; i < 3; i += 1) {
      ctx.quadraticCurveTo(enemy.radius - (i + 0.5) * (2 * enemy.radius / 3), bob + 16 + Math.sin(world.time * 4 + i) * 3, enemy.radius - (i + 1) * (2 * enemy.radius / 3), bob + 8);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-5, bob - 3, 2.8, 0, Math.PI * 2);
    ctx.arc(5, bob - 3, 2.8, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.type === 'skitter') {
    const angle = Math.atan2(world.player.y - enemy.y, world.player.x - enemy.x);
    ctx.rotate(angle);
    ctx.fillStyle = kind.color;
    ctx.beginPath();
    ctx.moveTo(enemy.radius + 6, 0);
    ctx.lineTo(-enemy.radius, -enemy.radius * 0.8);
    ctx.lineTo(-enemy.radius * 0.4, 0);
    ctx.lineTo(-enemy.radius, enemy.radius * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(2, 0, 3.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (enemy.type === 'bulwark') {
    ctx.rotate(world.time * 0.5 + enemy.phase);
    ctx.fillStyle = kind.color;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      const px = Math.cos(a) * enemy.radius;
      const py = Math.sin(a) * enemy.radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-world.time * 0.5 - enemy.phase);
    ctx.fillStyle = PALETTE.bulwarkCore;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius * 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Elite: a spiked ring with a burning core.
    ctx.fillStyle = kind.color;
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + world.time * 1.2;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(enemy.radius * 0.7, -5);
      ctx.lineTo(enemy.radius + 10, 0);
      ctx.lineTo(enemy.radius * 0.7, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    const pulse = 0.7 + 0.3 * Math.sin(world.time * 5 + enemy.phase);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius * 0.38 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  if (enemy.flash > 0) {
    ctx.globalAlpha = Math.min(1, enemy.flash / 0.09) * 0.85;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (enemy.maxHp > 2 && enemy.hp < enemy.maxHp) {
    const w = enemy.radius * 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(enemy.x - w / 2, enemy.y - enemy.radius - 12, w, 4);
    ctx.fillStyle = PALETTE.danger;
    ctx.fillRect(enemy.x - w / 2, enemy.y - enemy.radius - 12, (w * enemy.hp) / enemy.maxHp, 4);
    ctx.restore();
  }
}

function drawBullets(ctx, world) {
  for (const bullet of world.bullets) {
    const len = Math.hypot(bullet.vx, bullet.vy) || 1;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 232, 163, 0.55)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bullet.x - (bullet.vx / len) * 14, bullet.y - (bullet.vy / len) * 14);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
    ctx.restore();
    glowCircle(ctx, bullet.x, bullet.y, 12, 'rgba(255, 232, 163, 0.9)', 0.8);
    ctx.fillStyle = '#fffbe8';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, PLAYER.bulletRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPickup(ctx, world, pickup) {
  const bobY = Math.sin(pickup.bob) * 4;
  const blink = pickup.life < 2 && Math.floor(world.time * 8) % 2 === 0;
  const color = pickup.type === 'heart' ? PALETTE.heart : pickup.type === 'star' ? PALETTE.gold : PALETTE.nova;
  ctx.save();
  if (blink) ctx.globalAlpha = 0.35;
  glowCircle(ctx, pickup.x, pickup.y + bobY, 30, color, 0.5);
  ctx.fillStyle = 'rgba(8, 10, 24, 0.85)';
  ctx.beginPath();
  ctx.arc(pickup.x, pickup.y + bobY, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = color;
  const x = pickup.x;
  const y = pickup.y + bobY;
  if (pickup.type === 'heart') {
    ctx.beginPath();
    ctx.moveTo(x, y + 5);
    ctx.bezierCurveTo(x - 9, y - 3, x - 5, y - 9, x, y - 4);
    ctx.bezierCurveTo(x + 5, y - 9, x + 9, y - 3, x, y + 5);
    ctx.fill();
  } else if (pickup.type === 'star') {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 === 0 ? 8 : 3.5;
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const r = i % 2 === 0 ? 9 : 3;
      const a = (i / 8) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles(ctx, world) {
  for (const particle of world.particles) {
    const alpha = Math.max(0, particle.life / particle.maxLife);
    if (particle.kind === 'ring') {
      const progress = 1 - alpha;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 6 + progress * (particle.maxRadius || 60), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (0.5 + 0.5 * alpha), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawFloaters(ctx, world) {
  for (const floater of world.floaters) {
    const alpha = Math.max(0, floater.life / floater.maxLife);
    text(ctx, floater.text, floater.x, floater.y, { size: floater.size, color: floater.color, alpha });
  }
}

function drawHud(ctx, world, ui) {
  const player = world.player;
  // Health and dash, top left.
  panel(ctx, 18, 16, 248, 64, 'rgba(8, 10, 24, 0.6)', 'rgba(255, 255, 255, 0.12)');
  text(ctx, 'HP', 34, 34, { size: 13, color: PALETTE.dim, align: 'left', spacing: 1 });
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.beginPath();
  ctx.roundRect(78, 26, 172, 15, 7);
  ctx.fill();
  const hpRatio = Math.max(0, player.hp / PLAYER.maxHp);
  const hpGradient = ctx.createLinearGradient(78, 0, 250, 0);
  hpGradient.addColorStop(0, '#ff5e3a');
  hpGradient.addColorStop(1, '#ffb347');
  ctx.fillStyle = hpRatio < 0.3 ? PALETTE.danger : hpGradient;
  if (hpRatio > 0) {
    ctx.beginPath();
    ctx.roundRect(78, 26, 172 * hpRatio, 15, 7);
    ctx.fill();
  }
  ctx.restore();
  text(ctx, `${Math.ceil(player.hp)}`, 244, 34, { size: 13, align: 'right' });
  text(ctx, 'DASH', 34, 60, { size: 13, color: PALETTE.dim, align: 'left', spacing: 1 });
  const dashRatio = 1 - player.dashCd / PLAYER.dashCooldown;
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.beginPath();
  ctx.roundRect(78, 53, 172, 9, 4);
  ctx.fill();
  ctx.fillStyle = dashRatio >= 1 ? PALETTE.gold : '#7d8db3';
  ctx.beginPath();
  ctx.roundRect(78, 53, 172 * Math.max(0, dashRatio), 9, 4);
  ctx.fill();
  ctx.restore();
  if (player.rapid > 0) {
    text(ctx, `RAPID FIRE ${player.rapid.toFixed(1)}s`, 24, 96, { size: 13, color: PALETTE.gold, align: 'left', spacing: 1 });
  }
  // Wave and foes, top centre.
  text(ctx, `WAVE ${Math.min(world.wave, TOTAL_WAVES)} / ${TOTAL_WAVES}`, VIEW.width / 2, 30, { size: 22, spacing: 3 });
  const foes = foesRemaining(world);
  text(ctx, world.wavePhase === PHASE_BANNER ? 'The shadows gather…' : `FOES LEFT ${foes}`, VIEW.width / 2, 56, { size: 14, color: PALETTE.dim, spacing: 1 });
  // Score and best, top right.
  text(ctx, world.score.toLocaleString('en-US'), VIEW.width - 24, 32, { size: 26, align: 'right' });
  text(ctx, `BEST ${world.best.toLocaleString('en-US')}`, VIEW.width - 24, 58, { size: 13, color: PALETTE.dim, align: 'right', spacing: 1 });
  if (world.combo >= 3) {
    const mult = (1 + (world.combo - 1) * 0.25).toFixed(2).replace(/\.?0+$/, '');
    const pulse = 1 + 0.08 * Math.sin(world.time * 8);
    ctx.save();
    ctx.translate(VIEW.width - 24, 88);
    ctx.scale(pulse, pulse);
    panel(ctx, -152, -16, 152, 32, 'rgba(255, 179, 71, 0.16)', 'rgba(255, 209, 102, 0.6)');
    ctx.restore();
    text(ctx, `COMBO ×${mult}`, VIEW.width - 100, 88, { size: 16, color: PALETTE.gold });
  }
  // Sound state, bottom right; controls hint, bottom left.
  text(ctx, ui.muted ? 'SOUND OFF  (M)' : 'SOUND ON  (M)', VIEW.width - 24, VIEW.height - 20, { size: 12, color: PALETTE.dim, align: 'right', spacing: 1 });
  if (ui.hintAlpha > 0) {
    text(ctx, 'WASD move  ·  Mouse aim  ·  Hold click to shoot  ·  Space dash  ·  P pause', 24, VIEW.height - 20, { size: 13, color: PALETTE.dim, align: 'left', alpha: ui.hintAlpha });
  }
}

function drawBanner(ctx, world) {
  if (world.wavePhase === PHASE_BANNER) {
    const progress = 1 - world.phaseTimer / 2.0;
    const alpha = progress < 0.15 ? progress / 0.15 : world.phaseTimer < 0.4 ? world.phaseTimer / 0.4 : 1;
    const label = world.wave >= TOTAL_WAVES ? 'FINAL WAVE' : `WAVE ${world.wave}`;
    const sub = world.wave >= TOTAL_WAVES ? 'Hold until dawn!' : 'The Hollow stirs…';
    text(ctx, label, VIEW.width / 2, 200, { size: 58, spacing: 8, alpha: Math.max(0, alpha) });
    text(ctx, sub, VIEW.width / 2, 244, { size: 18, color: PALETTE.dim, alpha: Math.max(0, alpha) });
  } else if (world.wavePhase === PHASE_CLEAR && world.wave < TOTAL_WAVES) {
    const alpha = Math.min(1, world.phaseTimer / 0.6);
    text(ctx, 'WAVE CLEAR', VIEW.width / 2, 200, { size: 44, color: PALETTE.gold, spacing: 6, alpha: Math.max(0, alpha) });
  }
}

function drawReticle(ctx, ui) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 232, 163, 0.9)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(ui.mouseX, ui.mouseY, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ui.mouseX - 13, ui.mouseY);
  ctx.lineTo(ui.mouseX - 5, ui.mouseY);
  ctx.moveTo(ui.mouseX + 5, ui.mouseY);
  ctx.lineTo(ui.mouseX + 13, ui.mouseY);
  ctx.moveTo(ui.mouseX, ui.mouseY - 13);
  ctx.lineTo(ui.mouseX, ui.mouseY - 5);
  ctx.moveTo(ui.mouseX, ui.mouseY + 5);
  ctx.lineTo(ui.mouseX, ui.mouseY + 13);
  ctx.stroke();
  ctx.restore();
}

function drawStats(ctx, world, y) {
  const accuracy = world.shotsFired > 0 ? Math.round((world.shotsHit / world.shotsFired) * 100) : 0;
  const rows = [
    ['SCORE', world.score.toLocaleString('en-US')],
    ['BEST', world.best.toLocaleString('en-US')],
    ['WAVE REACHED', `${Math.min(world.wave, TOTAL_WAVES)} / ${TOTAL_WAVES}`],
    ['FOES FELLED', `${world.kills}`],
    ['ACCURACY', `${accuracy}%`],
  ];
  panel(ctx, VIEW.width / 2 - 190, y, 380, rows.length * 34 + 28);
  rows.forEach(([label, value], i) => {
    const rowY = y + 24 + i * 34;
    text(ctx, label, VIEW.width / 2 - 164, rowY, { size: 15, color: PALETTE.dim, align: 'left', spacing: 1 });
    text(ctx, value, VIEW.width / 2 + 164, rowY, { size: 17, align: 'right' });
  });
  return y + rows.length * 34 + 28;
}

function drawTitle(ctx, world) {
  ctx.fillStyle = 'rgba(4, 6, 16, 0.45)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const titleGradient = ctx.createLinearGradient(0, 130, 0, 230);
  titleGradient.addColorStop(0, '#fff3d6');
  titleGradient.addColorStop(0.55, '#ffb347');
  titleGradient.addColorStop(1, '#ff5e3a');
  ctx.save();
  ctx.font = `900 96px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  try { ctx.letterSpacing = '16px'; } catch { /* older canvas */ }
  ctx.fillStyle = titleGradient;
  ctx.shadowColor = 'rgba(255, 122, 47, 0.55)';
  ctx.shadowBlur = 34;
  ctx.fillText('EMBERWARD', VIEW.width / 2, 178);
  ctx.restore();
  text(ctx, 'Keep the last ember burning through the night.', VIEW.width / 2, 248, { size: 21, color: PALETTE.ink, weight: 600 });
  text(ctx, 'Ten waves of the Hollow are coming. You are the Warden. Hold the light.', VIEW.width / 2, 278, { size: 16, color: PALETTE.dim, weight: 600 });
  panel(ctx, VIEW.width / 2 - 250, 318, 500, 132);
  const lines = [
    ['WASD / ARROWS', 'Move the Warden'],
    ['MOUSE', 'Aim the staff'],
    ['HOLD CLICK', 'Cast ember bolts'],
    ['SPACE / SHIFT', 'Dash (briefly untouchable)'],
  ];
  lines.forEach(([key, meaning], i) => {
    const rowY = 340 + i * 28;
    text(ctx, key, VIEW.width / 2 - 224, rowY, { size: 14, color: PALETTE.gold, align: 'left', spacing: 1 });
    text(ctx, meaning, VIEW.width / 2 + 224, rowY, { size: 14, color: PALETTE.ink, align: 'right', weight: 600 });
  });
  text(ctx, 'Stand in the ember’s ring to mend your wounds. Gather hearts, stars and novas.', VIEW.width / 2, 478, { size: 14, color: PALETTE.dim, weight: 600 });
  if (world.best > 0) {
    text(ctx, `BEST SCORE  ${world.best.toLocaleString('en-US')}`, VIEW.width / 2, 516, { size: 16, color: PALETTE.gold, spacing: 2 });
  }
  const pulse = 0.6 + 0.4 * Math.sin(world.time * 3);
  text(ctx, 'CLICK OR PRESS ENTER TO BEGIN', VIEW.width / 2, 566, { size: 22, spacing: 4, alpha: pulse });
  text(ctx, 'P pause  ·  M mute  ·  R restart', VIEW.width / 2, 606, { size: 13, color: PALETTE.dim, spacing: 1 });
}

function drawGameOver(ctx, world) {
  ctx.fillStyle = 'rgba(8, 4, 12, 0.66)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  text(ctx, 'THE LIGHT FADES', VIEW.width / 2, 168, { size: 64, color: '#ff8fa3', spacing: 8 });
  text(ctx, 'The shadows take the ember… this time.', VIEW.width / 2, 218, { size: 18, color: PALETTE.dim, weight: 600 });
  const bottom = drawStats(ctx, world, 258);
  const pulse = 0.6 + 0.4 * Math.sin(world.time * 3);
  text(ctx, 'PRESS R OR CLICK TO TRY AGAIN', VIEW.width / 2, bottom + 44, { size: 20, spacing: 3, alpha: pulse });
}

function drawVictory(ctx, world) {
  glowCircle(ctx, VIEW.width / 2, 190, 320, 'rgba(255, 209, 102, 0.35)', 0.8);
  ctx.fillStyle = 'rgba(10, 8, 4, 0.5)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  text(ctx, 'DAWN BREAKS', VIEW.width / 2, 168, { size: 72, color: PALETTE.gold, spacing: 10 });
  text(ctx, 'Ten waves weathered. The ember lives on.', VIEW.width / 2, 218, { size: 18, color: PALETTE.ink, weight: 600 });
  const bottom = drawStats(ctx, world, 258);
  const pulse = 0.6 + 0.4 * Math.sin(world.time * 3);
  text(ctx, 'PRESS R OR CLICK TO PLAY AGAIN', VIEW.width / 2, bottom + 44, { size: 20, spacing: 3, alpha: pulse });
}

function drawPause(ctx) {
  ctx.fillStyle = 'rgba(4, 6, 16, 0.6)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  text(ctx, 'PAUSED', VIEW.width / 2, 300, { size: 54, spacing: 8 });
  text(ctx, 'P resume  ·  R restart  ·  M mute', VIEW.width / 2, 352, { size: 16, color: PALETTE.dim, spacing: 1 });
}

export function drawScene(ctx, world, screen, ui) {
  ctx.save();
  ctx.clearRect(0, 0, VIEW.width, VIEW.height);
  const ox = Math.sin(world.time * 91) * world.shake;
  const oy = Math.cos(world.time * 83) * world.shake;
  ctx.translate(ox, oy);
  drawBackground(ctx, world);
  drawEmber(ctx, world);
  for (const pickup of world.pickups) drawPickup(ctx, world, pickup);
  for (const enemy of world.enemies) drawEnemy(ctx, world, enemy);
  drawBullets(ctx, world);
  if (screen !== SCREEN_TITLE) drawPlayer(ctx, world);
  drawParticles(ctx, world);
  drawFloaters(ctx, world);
  ctx.restore();

  if (world.flash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.5, world.flash);
    ctx.fillStyle = '#ff2038';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.restore();
  }
  const player = world.player;
  if ((screen === SCREEN_PLAY || screen === SCREEN_PAUSE) && player.hp > 0 && player.hp < 30) {
    const pulse = 0.1 + 0.07 * Math.sin(world.time * 6);
    const gradient = ctx.createRadialGradient(
      VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.3,
      VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.75,
    );
    gradient.addColorStop(0, 'rgba(255, 32, 56, 0)');
    gradient.addColorStop(1, `rgba(255, 32, 56, ${pulse})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  if (screen === SCREEN_PLAY || screen === SCREEN_PAUSE) {
    drawHud(ctx, world, ui);
    drawBanner(ctx, world);
    drawReticle(ctx, ui);
  }
  if (screen === SCREEN_TITLE) drawTitle(ctx, world);
  if (screen === SCREEN_OVER) drawGameOver(ctx, world);
  if (screen === SCREEN_WIN) drawVictory(ctx, world);
  if (screen === SCREEN_PAUSE) drawPause(ctx);
}
