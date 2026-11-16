// Emberward tuning: every number that shapes how the game feels lives here,
// so balance can be read and changed in one place. No other file hardcodes
// speeds, damage, wave sizes or colours.
export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;

export const PALETTE = {
  skyTop: '#070a18',
  skyBottom: '#101530',
  nebulaViolet: '#2a1b4e',
  nebulaTeal: '#12333d',
  star: '#dfe8ff',
  ink: '#f5ead6',
  dim: '#9aa7c7',
  gold: '#ffd166',
  emberCore: '#fff3d6',
  emberMid: '#ffb347',
  emberOuter: '#ff5e3a',
  playerBody: '#ff9a3c',
  playerTrim: '#ffe8c2',
  bullet: '#ffe8a3',
  wisp: '#a78bfa',
  skitter: '#f472b6',
  bulwark: '#7c6cf0',
  bulwarkCore: '#c4b5fd',
  elite: '#fb7185',
  heart: '#ff6b81',
  nova: '#4de3d1',
  danger: '#ff4d5e',
};

export const EMBER = { x: VIEW.width / 2, y: VIEW.height / 2, healRadius: 112, healRate: 6 };

export const PLAYER = {
  radius: 13,
  maxHp: 100,
  accel: 2600,
  maxSpeed: 305,
  friction: 7.5,
  fireInterval: 0.16,
  rapidInterval: 0.07,
  bulletSpeed: 580,
  bulletLife: 1.1,
  bulletRadius: 5,
  bulletDamage: 1,
  dashSpeed: 920,
  dashTime: 0.16,
  dashCooldown: 1.5,
  hitInvuln: 0.6,
  contactKnockback: 300,
};

// Enemy kinds: hp, speed, radius, contact damage, score, knockback taken.
export const ENEMIES = {
  wisp: { hp: 2, speed: 72, radius: 15, damage: 10, score: 50, knockback: 130, color: PALETTE.wisp },
  skitter: { hp: 1, speed: 158, radius: 10, damage: 8, score: 40, knockback: 180, color: PALETTE.skitter },
  bulwark: { hp: 7, speed: 44, radius: 26, damage: 18, score: 150, knockback: 34, color: PALETTE.bulwark },
  elite: { hp: 10, speed: 108, radius: 18, damage: 14, score: 300, knockback: 70, color: PALETTE.elite },
};

export const SPAWN_IN = 0.6; // seconds an enemy fades in at the edge, harmless
export const MAX_ALIVE = 26; // spawn queue waits while this many foes live
export const CONTACT_COOLDOWN = 0.7; // per-enemy seconds between contact hits

// Wave table: how many of each kind, and the gap between spawns.
export const WAVES = [
  { wisp: 6, skitter: 0, bulwark: 0, elite: 0, interval: 0.85 },
  { wisp: 8, skitter: 4, bulwark: 0, elite: 0, interval: 0.8 },
  { wisp: 10, skitter: 6, bulwark: 0, elite: 0, interval: 0.75 },
  { wisp: 8, skitter: 6, bulwark: 2, elite: 0, interval: 0.7 },
  { wisp: 12, skitter: 8, bulwark: 2, elite: 0, interval: 0.65 },
  { wisp: 10, skitter: 8, bulwark: 3, elite: 1, interval: 0.6 },
  { wisp: 14, skitter: 10, bulwark: 3, elite: 2, interval: 0.55 },
  { wisp: 12, skitter: 12, bulwark: 4, elite: 2, interval: 0.5 },
  { wisp: 16, skitter: 12, bulwark: 4, elite: 3, interval: 0.45 },
  { wisp: 14, skitter: 14, bulwark: 5, elite: 4, interval: 0.4 },
];
export const TOTAL_WAVES = WAVES.length;
export const BANNER_TIME = 2.0; // wave banner before spawning starts
export const CLEAR_TIME = 2.4; // breather after a wave is cleared
export const CLEAR_BONUS = (wave) => 250 + wave * 50;

export const COMBO = { window: 3.0, step: 0.25, cap: 13 };

export const PICKUPS = {
  heart: { color: PALETTE.heart, drop: 0.08, life: 9 },
  star: { color: PALETTE.gold, drop: 0.07, life: 9, rapidTime: 6 },
  nova: { color: PALETTE.nova, drop: 0.05, life: 9, damage: 6 },
};
export const PICKUP_MAGNET = 95;
export const PICKUP_COLLECT = 27;

export const PARTICLE_CAP = 500;
