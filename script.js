const canvas = document.getElementById('myCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 900;
canvas.height = 600;

/* =========================================================
   CONFIG
   ========================================================= */
const W = 900;
const H = 600;
const CELL = 100;
const ROWS = 5;
const COLS = 9;
const TOP = 100;            // height of the control bar; the castle floor starts below it
const GAP = 4;              // keeps defenders/ghosts slightly smaller than a cell
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

// cost = light, cooldown = seconds before you can place that card again
const DEFENDERS = {
  priest: { name: 'Priest',    cost: 50,  health: 100, cooldown: 5,  upgradable: true,  desc: 'Makes holy light orbs over time.' },
  archer: { name: 'Archer',    cost: 100, health: 100, cooldown: 5,  upgradable: true,  desc: 'Shoots arrows down its row.' },
  knight: { name: 'Knight',    cost: 50,  health: 600, cooldown: 15, upgradable: true,  desc: 'Tough shield blocker. Buys time.' },
  mage:   { name: 'Mage',      cost: 125, health: 100, cooldown: 7,  upgradable: true,  desc: 'Frost bolts that slow ghosts down.' },
  cannon: { name: 'Cannon',    cost: 150, health: 150, cooldown: 10, upgradable: true,  desc: 'Heavy shot that hits every ghost in the row.' },
  trap:   { name: 'Holy Trap', cost: 25,  health: 1,   cooldown: 10, upgradable: false, desc: 'One-use rune. Banishes the first ghost that steps on it.' }
};
const CARD_ORDER = ['priest', 'archer', 'knight', 'mage', 'cannon', 'trap'];
const BASE_RELOAD = { archer: 1.4, mage: 1.8, cannon: 4 };

// speed = pixels per second, dps = damage per second to defenders
const GHOSTS = {
  ghost:   { health: 100,  speed: 22, dps: 40,  w: 70,  points: 10 },
  armored: { health: 240,  speed: 20, dps: 40,  w: 70,  points: 20 },
  wisp:    { health: 70,   speed: 55, dps: 30,  w: 56,  points: 15 },
  phantom: { health: 130,  speed: 24, dps: 40,  w: 70,  points: 25, passes: 1 },   // slips through the first defender it meets
  banshee: { health: 110,  speed: 20, dps: 30,  w: 70,  points: 25 },              // screams to stun defenders
  boss:    { health: 1800, speed: 13, dps: 130, w: 110, points: 200 }
};

const THEMES = {
  courtyard: { a: '#4b5068', b: '#555b75', fog: '170,190,230' },
  dungeon:   { a: '#38423a', b: '#414c43', fog: '130,210,160' },
  rooftop:   { a: '#3d4a5c', b: '#47566b', fog: '210,225,255' },
  throne:    { a: '#3f3150', b: '#4a3a5e', fog: '190,140,255' }
};

// mix = [ghost type, appears after N ghosts, chance]
const LEVELS = [
  { name: 'The Courtyard',  theme: THEMES.courtyard, total: 20, startLight: 150, firstDelay: 12,
    gapStart: 9,   gapStep: 0.25, minGap: 3.5, boss: false,
    unlock: ['priest', 'archer', 'knight'],
    mix: [['armored', 5, 0.25], ['wisp', 12, 0.15]] },
  { name: 'The Dungeon',    theme: THEMES.dungeon,   total: 26, startLight: 150, firstDelay: 10,
    gapStart: 8.5, gapStep: 0.22, minGap: 3,   boss: false,
    unlock: ['priest', 'archer', 'knight', 'mage', 'trap'],
    mix: [['armored', 3, 0.25], ['wisp', 8, 0.2], ['phantom', 9, 0.2]] },
  { name: 'The Rooftop',    theme: THEMES.rooftop,   total: 32, startLight: 175, firstDelay: 10,
    gapStart: 8,   gapStep: 0.2,  minGap: 2.7, boss: true,
    unlock: ['priest', 'archer', 'knight', 'mage', 'trap', 'cannon'],
    mix: [['armored', 3, 0.2], ['wisp', 6, 0.2], ['phantom', 7, 0.2], ['banshee', 10, 0.15]] },
  { name: 'The Throne Room', theme: THEMES.throne,   total: 40, startLight: 200, firstDelay: 10,
    gapStart: 7.5, gapStep: 0.18, minGap: 2.2, boss: true,
    unlock: ['priest', 'archer', 'knight', 'mage', 'trap', 'cannon'],
    mix: [['armored', 2, 0.2], ['wisp', 5, 0.2], ['phantom', 6, 0.2], ['banshee', 8, 0.2]] }
];

// Blessings you choose between levels
const PERKS = [
  { id: 'swift',  name: 'Swift Hands',    desc: 'Archers, mages and cannons reload 20% faster.', apply: p => { p.reload *= 0.8; } },
  { id: 'bright', name: 'Radiant Light',  desc: 'Every light orb gives 10 extra light.',          apply: p => { p.orbBonus += 10; } },
  { id: 'prayer', name: 'Quick Prayer',   desc: 'Defender cards recharge 30% faster.',            apply: p => { p.cooldown *= 0.7; } },
  { id: 'stone',  name: 'Blessed Stone',  desc: 'All defenders have 25% more health.',            apply: p => { p.health *= 1.25; } },
  { id: 'chest',  name: 'War Chest',      desc: 'Start every level with 100 extra light.',        apply: p => { p.startBonus += 100; } },
  { id: 'mist',   name: 'Chilling Mist',  desc: 'Ghosts move 10% slower.',                        apply: p => { p.ghostSpeed *= 0.9; } },
  { id: 'smith',  name: 'Master Smith',   desc: 'Defender cards cost 15% less.',                  apply: p => { p.discount *= 0.85; } },
  { id: 'bells',  name: 'Blessed Bells',  desc: 'Each gate bell can ring one extra time.',        apply: p => { p.bells += 1; } }
];

function cardRect(i) { return { x: 118 + i * 68, y: 10, w: 62, h: 80 }; }
const SHOVEL_INDEX = CARD_ORDER.length;
const PAUSE_RECT = { x: 830, y: 10, w: 30, h: 30 };
const MUTE_RECT  = { x: 864, y: 10, w: 30, h: 30 };
function perkRect(i) { return { x: 70 + i * 270, y: 190, w: 250, h: 230 }; }

/* =========================================================
   GAME STATE
   ========================================================= */
let scene = 'menu';          // 'menu' | 'level' | 'perk' | 'victory'
let run;                     // things that last across levels: score, blessings
let state;                   // the current level
let perkChoices = [];
let best = 0;
let animTime = 0;            // for visual animation only
let endedAt = 0;
const mouse = { x: null, y: null };

try { best = Number(localStorage.getItem('hk_best')) || 0; } catch (e) { /* storage unavailable */ }

function saveBest(score) {
  if (score > best) {
    best = score;
    try { localStorage.setItem('hk_best', String(best)); } catch (e) { /* ignore */ }
  }
}

function newRun() {
  return {
    levelIndex: 0,
    score: 0,
    levelStartScore: 0,
    perks: { reload: 1, orbBonus: 0, cooldown: 1, health: 1, startBonus: 0, ghostSpeed: 1, discount: 1, bells: 0, owned: [] }
  };
}

function newLevelState(idx) {
  const L = LEVELS[idx];
  const gates = [];
  for (let r = 0; r < ROWS; r++) gates.push({ row: r, charges: 1 + run.perks.bells, sweeping: false, x: 0, sweepId: 0 });
  return {
    status: 'playing',      // 'playing' | 'paused' | 'cleared' | 'lost'
    endedAt: 0,
    clearedAt: 0,
    time: 0,
    light: L.startLight + run.perks.startBonus,
    defenders: [],
    ghosts: [],
    shots: [],
    orbs: [],
    gates,
    floaters: [],           // floating numbers
    particles: [],
    rings: [],
    cooldowns: { priest: 0, archer: 0, knight: 0, mage: 0, cannon: 0, trap: 0 },
    selected: null,
    shovel: false,
    skyTimer: 5,
    nextSpawn: L.firstDelay,
    spawned: 0,
    banished: 0,
    sweepCounter: 0,
    shake: 0,
    banner: { title: 'LEVEL ' + (idx + 1), sub: L.name, life: 3, color: '#ffd98a' }
  };
}

function startRun() {
  run = newRun();
  startLevel(0);
}

function startLevel(idx) {
  run.levelIndex = idx;
  run.levelStartScore = run.score;
  state = newLevelState(idx);
  scene = 'level';
}

function retryLevel() {
  run.score = run.levelStartScore;
  state = newLevelState(run.levelIndex);
  scene = 'level';
}

run = newRun();
state = newLevelState(0);

/* =========================================================
   HELPERS
   ========================================================= */
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function inRect(px, py, r) { return px !== null && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }
function getDefender(row, col) { return state.defenders.find(d => d.row === row && d.col === col); }
function isUnlocked(type) { return LEVELS[run.levelIndex].unlock.includes(type); }
function unlockLevel(type) { return LEVELS.findIndex(L => L.unlock.includes(type)) + 1; }
function cost(type) { return Math.max(10, Math.round(DEFENDERS[type].cost * run.perks.discount / 5) * 5); }
function reloadTime(d) { return BASE_RELOAD[d.type] * (d.level === 2 ? 0.8 : 1) * run.perks.reload; }
function maxHealthFor(type, level) { return DEFENDERS[type].health * run.perks.health * (level === 2 ? 1.5 : 1); }

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (W / rect.width),
    y: (e.clientY - rect.top) * (H / rect.height)
  };
}

function text(str, x, y, size, color, align = 'left', weight = 'bold') {
  ctx.font = `${weight} ${size}px Arial`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(String(str), x, y);
}

function emoji(ch, x, y, size) {
  ctx.font = `${size}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(ch, x, y);
}

function rrect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLines(str, maxW, size, weight = 'normal') {
  ctx.font = `${weight} ${size}px Arial`;
  const words = str.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
    else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function healthBar(x, y, w, fraction, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x, y, w, 6);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, fraction), 6);
}

/* =========================================================
   SOUND  (made with the browser's audio, no files needed)
   ========================================================= */
let audioCtx = null;
let muted = false;
try { muted = localStorage.getItem('hk_muted') === '1'; } catch (e) { /* ignore */ }

function ensureAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* audio not available */ }
}

function tone(freq, dur, type, vol, slideTo, delay) {
  if (!audioCtx || muted) return;
  try {
    const t = audioCtx.currentTime + (delay || 0);
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch (e) { /* ignore */ }
}

function noise(dur, vol, delay) {
  if (!audioCtx || muted) return;
  try {
    const t = audioCtx.currentTime + (delay || 0);
    const n = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
    const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = audioCtx.createBufferSource();
    const g = audioCtx.createGain();
    src.buffer = buf;
    g.gain.value = vol;
    src.connect(g);
    g.connect(audioCtx.destination);
    src.start(t);
  } catch (e) { /* ignore */ }
}

const sfxLast = {};
function sfx(name) {
  const now = performance.now();
  if (sfxLast[name] && now - sfxLast[name] < 60) return;   // don't stack the same sound
  sfxLast[name] = now;
  switch (name) {
    case 'shoot':   tone(560, 0.09, 'triangle', 0.07, 240); break;
    case 'bolt':    tone(900, 0.14, 'sine', 0.07, 400); break;
    case 'cannon':  noise(0.25, 0.25); tone(110, 0.25, 'sawtooth', 0.12, 40); break;
    case 'hit':     tone(220, 0.06, 'square', 0.04, 130); break;
    case 'banish':  tone(660, 0.18, 'sine', 0.09, 1000); tone(1000, 0.2, 'sine', 0.05, 1400, 0.06); break;
    case 'collect': tone(880, 0.08, 'sine', 0.09); tone(1320, 0.14, 'sine', 0.07, null, 0.07); break;
    case 'place':   tone(200, 0.1, 'sawtooth', 0.06, 100); break;
    case 'upgrade': tone(520, 0.1, 'triangle', 0.08); tone(780, 0.1, 'triangle', 0.08, null, 0.09); tone(1040, 0.18, 'triangle', 0.08, null, 0.18); break;
    case 'deny':    tone(140, 0.12, 'square', 0.05, 100); break;
    case 'trap':    noise(0.2, 0.15); tone(500, 0.3, 'sine', 0.1, 1200); break;
    case 'bell':    tone(660, 1.0, 'sine', 0.12); tone(990, 0.8, 'sine', 0.07); tone(1320, 0.6, 'sine', 0.04); break;
    case 'wail':    tone(440, 0.8, 'sine', 0.08, 200); tone(660, 0.8, 'sine', 0.04, 300); break;
    case 'boss':    tone(70, 1.4, 'sawtooth', 0.14, 45); tone(105, 1.4, 'square', 0.05, 60); break;
    case 'lose':    tone(300, 0.5, 'sawtooth', 0.1, 80); tone(200, 0.9, 'sawtooth', 0.1, 50, 0.3); break;
    case 'win':     [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.09, null, i * 0.14)); break;
    case 'click':   tone(700, 0.05, 'triangle', 0.06); break;
  }
}

function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('hk_muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  if (!muted) sfx('click');
}

/* =========================================================
   EFFECTS (particles, floating numbers, rings)
   ========================================================= */
function burst(x, y, color, n, speed) {
  const s = state;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.3 + Math.random() * 0.7);
    s.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life: 0.5 + Math.random() * 0.4, max: 0.9, color, size: 2 + Math.random() * 3 });
  }
  if (s.particles.length > 300) s.particles.splice(0, s.particles.length - 300);
}

function floater(x, y, str, color) {
  state.floaters.push({ x, y, str, color, life: 0.9 });
  if (state.floaters.length > 60) state.floaters.shift();
}

function updateEffects(dt) {
  const s = state;
  s.shake = Math.max(0, s.shake - 30 * dt);
  if (s.banner) s.banner.life -= dt;
  for (let i = s.floaters.length - 1; i >= 0; i--) {
    const f = s.floaters[i];
    f.y -= 34 * dt;
    f.life -= dt;
    if (f.life <= 0) s.floaters.splice(i, 1);
  }
  for (let i = s.particles.length - 1; i >= 0; i--) {
    const p = s.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= dt;
    if (p.life <= 0) s.particles.splice(i, 1);
  }
  for (let i = s.rings.length - 1; i >= 0; i--) {
    const r = s.rings[i];
    r.r += 260 * dt;
    r.life -= dt;
    if (r.life <= 0) s.rings.splice(i, 1);
  }
}

/* =========================================================
   ENTITIES
   ========================================================= */
function createDefender(type, row, col) {
  const hp = maxHealthFor(type, 1);
  return {
    type, row, col,
    level: 1,
    x: col * CELL + GAP,
    y: TOP + row * CELL + GAP,
    w: CELL - GAP * 2,
    h: CELL - GAP * 2,
    health: hp,
    maxHealth: hp,
    timer: type === 'priest' ? 6 : type === 'cannon' ? 1.5 : 0.8,
    fire: 0,      // short timer used for firing animations
    stun: 0       // seconds left of being stunned by a banshee
  };
}

function createOrb(x, y, targetY, value) {
  return { x, y, targetY, value, size: 60, life: 10 };
}

function chooseGhostType(L, n) {
  if (L.boss && n === L.total - 1) return 'boss';
  const r = Math.random();
  let acc = 0;
  for (const [type, from, chance] of L.mix) {
    if (n >= from) {
      acc += chance;
      if (r < acc) return type;
    }
  }
  return 'ghost';
}

function spawnGhost(L) {
  const s = state;
  const type = chooseGhostType(L, s.spawned);
  const def = GHOSTS[type];
  s.ghosts.push({
    type,
    row: randInt(0, ROWS - 1),
    x: W,
    w: def.w,
    health: def.health,
    maxHealth: def.health,
    speed: def.speed,
    dps: def.dps,
    points: def.points,
    haunting: false,        // true while it is draining a defender
    phasing: false,         // true while a phantom is passing through a defender
    passes: def.passes || 0,
    ignore: [],
    flash: 0,               // white flash when hit
    slow: 0,                // seconds of frost slow left
    scream: 4 + Math.random() * 2,
    lastSweep: 0
  });
  s.spawned++;
  if (type === 'boss') {
    s.banner = { title: 'A GREAT SPIRIT APPROACHES!', sub: 'The Spectral Lord', life: 3.2, color: '#ff6b6b' };
    s.shake = 10;
    sfx('boss');
  }
}

function damageGhost(g, dmg, kind) {
  g.health -= dmg;
  g.flash = 0.12;
  const cx = g.x + g.w / 2;
  const cy = TOP + g.row * CELL + 30;
  if (kind === 'arrow' || kind === 'bolt' || kind === 'ball') {
    const color = kind === 'bolt' ? '#8fe3ff' : kind === 'ball' ? '#ffb347' : '#ffffff';
    floater(cx, cy, '-' + dmg, color);
    burst(cx, cy + 15, color, 3, 70);
    sfx('hit');
  }
}

function banish(g) {
  const s = state;
  run.score += g.points;
  s.banished++;
  const cx = g.x + g.w / 2;
  const cy = TOP + g.row * CELL + CELL / 2;
  burst(cx, cy, '#bfe9ff', g.type === 'boss' ? 50 : 14, g.type === 'boss' ? 260 : 140);
  floater(cx, cy - 20, '+' + g.points, '#ffd93b');
  if (g.type === 'boss') s.shake = 12;
  sfx('banish');
}

function bansheeScream(g) {
  const s = state;
  let target = null;
  for (const d of s.defenders) {
    if (d.type === 'trap' || d.row !== g.row || d.x > g.x || g.x - d.x > 500) continue;
    if (!target || d.x > target.x) target = d;
  }
  if (!target) return;
  target.stun = Math.max(target.stun, 3);
  s.rings.push({ x: g.x + g.w / 2, y: TOP + g.row * CELL + CELL / 2, r: 20, life: 0.7 });
  floater(target.x + target.w / 2, target.y + 10, 'Stunned!', '#d9b3ff');
  s.shake = Math.max(s.shake, 4);
  sfx('wail');
}

/* =========================================================
   INPUT
   ========================================================= */
canvas.addEventListener('mousemove', e => {
  const p = getPos(e);
  mouse.x = p.x;
  mouse.y = p.y;
});

canvas.addEventListener('mouseleave', () => {
  mouse.x = null;
  mouse.y = null;
});

function selectCard(type) {
  if (!isUnlocked(type)) { sfx('deny'); return; }
  state.selected = state.selected === type ? null : type;
  state.shovel = false;
  sfx('click');
}

function togglePause() {
  if (scene !== 'level') return;
  if (state.status === 'playing') state.status = 'paused';
  else if (state.status === 'paused') state.status = 'playing';
  sfx('click');
}

function pickPerk(i) {
  const perk = perkChoices[i];
  if (!perk) return;
  perk.apply(run.perks);
  run.perks.owned.push(perk.name);
  sfx('upgrade');
  startLevel(run.levelIndex + 1);
}

function finishLevel() {
  if (run.levelIndex >= LEVELS.length - 1) {
    saveBest(run.score);
    scene = 'victory';
    endedAt = performance.now();
    sfx('win');
  } else {
    const pool = PERKS.slice();
    perkChoices = [];
    while (perkChoices.length < 3 && pool.length) {
      perkChoices.push(pool.splice(randInt(0, pool.length - 1), 1)[0]);
    }
    scene = 'perk';
  }
}

function placeAt(row, col) {
  const existing = getDefender(row, col);

  if (state.shovel) {
    if (existing) {
      state.defenders.splice(state.defenders.indexOf(existing), 1);
      burst(existing.x + existing.w / 2, existing.y + existing.h / 2, '#cfd6e6', 8, 80);
      sfx('place');
    }
    return;
  }
  if (!state.selected) return;

  const type = state.selected;
  const def = DEFENDERS[type];
  const price = cost(type);
  const canAfford = state.light >= price && state.cooldowns[type] <= 0;

  if (!existing) {
    if (!canAfford) { sfx('deny'); return; }
    state.defenders.push(createDefender(type, row, col));
    state.light -= price;
    state.cooldowns[type] = def.cooldown * run.perks.cooldown;
    sfx('place');
  } else if (existing.type === type && def.upgradable && existing.level === 1) {
    // placing the same defender on top of one upgrades it
    if (!canAfford) { sfx('deny'); return; }
    existing.level = 2;
    existing.maxHealth = maxHealthFor(type, 2);
    existing.health = existing.maxHealth;
    state.light -= price;
    state.cooldowns[type] = def.cooldown * run.perks.cooldown;
    burst(existing.x + existing.w / 2, existing.y + existing.h / 2, '#ffd93b', 16, 120);
    floater(existing.x + existing.w / 2, existing.y, 'Upgraded!', '#ffd93b');
    sfx('upgrade');
  }
}

canvas.addEventListener('click', e => {
  ensureAudio();
  const p = getPos(e);
  mouse.x = p.x;
  mouse.y = p.y;

  if (scene === 'menu') { sfx('click'); startRun(); return; }

  if (scene === 'victory') {
    if (performance.now() - endedAt > 600) { scene = 'menu'; sfx('click'); }
    return;
  }

  if (scene === 'perk') {
    for (let i = 0; i < perkChoices.length; i++) {
      if (inRect(p.x, p.y, perkRect(i))) { pickPerk(i); return; }
    }
    return;
  }

  // ---- scene === 'level' ----
  if (inRect(p.x, p.y, MUTE_RECT)) { toggleMute(); return; }
  if (inRect(p.x, p.y, PAUSE_RECT)) { togglePause(); return; }

  if (state.status === 'paused') { togglePause(); return; }
  if (state.status === 'lost') {
    if (performance.now() - state.endedAt > 600) { retryLevel(); sfx('click'); }
    return;
  }
  if (state.status !== 'playing') return;

  // control bar: cards and shovel
  if (p.y < TOP) {
    CARD_ORDER.forEach((type, i) => {
      if (inRect(p.x, p.y, cardRect(i))) selectCard(type);
    });
    if (inRect(p.x, p.y, cardRect(SHOVEL_INDEX))) {
      state.shovel = !state.shovel;
      state.selected = null;
      sfx('click');
    }
    return;
  }

  // collect a light orb (topmost first)
  for (let i = state.orbs.length - 1; i >= 0; i--) {
    const o = state.orbs[i];
    if (inRect(p.x, p.y, { x: o.x - 8, y: o.y - 8, w: o.size + 16, h: o.size + 16 })) {
      state.light += o.value;
      floater(o.x + o.size / 2, o.y, '+' + o.value, '#fff2a8');
      state.orbs.splice(i, 1);
      sfx('collect');
      return;
    }
  }

  // castle floor: shovel / place / upgrade
  const col = Math.floor(p.x / CELL);
  const row = Math.floor((p.y - TOP) / CELL);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
  placeAt(row, col);
});

window.addEventListener('keydown', e => {
  ensureAudio();
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (key === 'm') { toggleMute(); return; }

  if (scene === 'menu') {
    if (key === 'Enter' || key === ' ') { sfx('click'); startRun(); }
    return;
  }
  if (scene === 'victory') {
    if ((key === 'Enter' || key === ' ') && performance.now() - endedAt > 600) scene = 'menu';
    return;
  }
  if (scene === 'perk') {
    if (key >= '1' && key <= String(perkChoices.length)) pickPerk(Number(key) - 1);
    return;
  }

  // level
  if (key === 'p') { togglePause(); return; }
  if (state.status === 'lost') {
    if (key === 'Enter' && performance.now() - state.endedAt > 600) retryLevel();
    return;
  }
  if (state.status !== 'playing') return;

  if (key >= '1' && key <= String(CARD_ORDER.length)) {
    selectCard(CARD_ORDER[Number(key) - 1]);
  } else if (key === 'x') {
    state.shovel = !state.shovel;
    state.selected = null;
  } else if (key === 'Escape') {
    state.selected = null;
    state.shovel = false;
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && scene === 'level' && state.status === 'playing') state.status = 'paused';
});

/* =========================================================
   UPDATE  (dt = seconds since last frame, so speed doesn't
   depend on the monitor's refresh rate)
   ========================================================= */
function rowHasTarget(d) {
  return state.ghosts.some(g =>
    g.row === d.row && g.health > 0 && g.x + g.w > d.x + d.w / 2 && g.x < W);
}

function shoot(d) {
  const s = state;
  d.fire = 0.18;
  if (d.type === 'archer') {
    s.shots.push({ kind: 'arrow', x: d.x + d.w - 5, row: d.row, dmg: d.level === 2 ? 30 : 20, speed: 320 });
    sfx('shoot');
  } else if (d.type === 'mage') {
    s.shots.push({ kind: 'bolt', x: d.x + d.w - 8, row: d.row, dmg: d.level === 2 ? 18 : 10, slow: d.level === 2 ? 5 : 3, speed: 260 });
    sfx('bolt');
  } else if (d.type === 'cannon') {
    s.shots.push({ kind: 'ball', x: d.x + d.w, row: d.row, dmg: d.level === 2 ? 90 : 60, speed: 240, pierce: true, hit: [] });
    s.shake = Math.max(s.shake, 3);
    sfx('cannon');
  }
}

function update(dt) {
  const s = state;
  const L = LEVELS[run.levelIndex];
  const P = run.perks;
  s.time += dt;

  // card cooldowns
  for (const k in s.cooldowns) s.cooldowns[k] = Math.max(0, s.cooldowns[k] - dt);

  // light falling from the sky
  s.skyTimer -= dt;
  if (s.skyTimer <= 0) {
    s.skyTimer = 7 + Math.random() * 3;
    const row = randInt(0, ROWS - 1);
    s.orbs.push(createOrb(Math.random() * (W - 100) + 20, TOP - 60, TOP + row * CELL + 20, 25 + P.orbBonus));
  }

  // orbs: fall, then wait, then fade away
  for (let i = s.orbs.length - 1; i >= 0; i--) {
    const o = s.orbs[i];
    if (o.y < o.targetY) {
      o.y = Math.min(o.targetY, o.y + 60 * dt);
    } else {
      o.life -= dt;
      if (o.life <= 0) s.orbs.splice(i, 1);
    }
  }

  // defenders
  for (let i = s.defenders.length - 1; i >= 0; i--) {
    const d = s.defenders[i];
    if (d.health <= 0) {
      burst(d.x + d.w / 2, d.y + d.h / 2, '#cfd6e6', 12, 100);
      s.defenders.splice(i, 1);
      continue;
    }
    d.fire = Math.max(0, d.fire - dt);
    if (d.stun > 0) { d.stun -= dt; continue; }    // stunned: does nothing

    if (d.type === 'priest') {
      d.timer -= dt;
      if (d.timer <= 0) {
        d.timer = d.level === 2 ? 8 : 10;
        s.orbs.push(createOrb(d.x + 10, d.y, d.y + 30, 25 + P.orbBonus + (d.level === 2 ? 15 : 0)));
      }
    } else if (d.type === 'archer' || d.type === 'mage' || d.type === 'cannon') {
      d.timer = Math.max(0, d.timer - dt);
      if (d.timer <= 0 && rowHasTarget(d)) {
        shoot(d);
        d.timer = reloadTime(d);
      }
    } else if (d.type === 'trap') {
      for (const g of s.ghosts) {
        if (g.row === d.row && g.health > 0 && g.x < d.x + d.w - 10 && g.x + g.w > d.x + 10) {
          damageGhost(g, 400, 'trap');
          burst(d.x + d.w / 2, d.y + d.h / 2, '#ffe08a', 26, 200);
          s.rings.push({ x: d.x + d.w / 2, y: d.y + d.h / 2, r: 10, life: 0.5 });
          s.shake = Math.max(s.shake, 4);
          sfx('trap');
          s.defenders.splice(i, 1);
          break;
        }
      }
    }
  }

  // ghosts
  for (let i = s.ghosts.length - 1; i >= 0; i--) {
    const g = s.ghosts[i];
    g.flash = Math.max(0, g.flash - dt);
    g.slow = Math.max(0, g.slow - dt);
    if (g.health <= 0) { banish(g); s.ghosts.splice(i, 1); continue; }

    if (g.type === 'banshee') {
      g.scream -= dt;
      if (g.scream <= 0) { g.scream = 6; bansheeScream(g); }
    }

    // find the defender blocking this ghost (traps never block)
    let target = null;
    g.phasing = false;
    for (const d of s.defenders) {
      if (d.type === 'trap' || d.row !== g.row) continue;
      if (!(g.x < d.x + d.w - 15 && g.x + g.w > d.x)) continue;
      if (g.ignore.includes(d)) { g.phasing = true; continue; }
      if (g.passes > 0) {                     // phantom slips through
        g.passes--;
        g.ignore.push(d);
        g.phasing = true;
        burst(g.x + g.w / 2, TOP + g.row * CELL + 50, '#b8c4e6', 10, 80);
        continue;
      }
      if (!target || d.x > target.x) target = d;
    }

    let spd = g.speed * P.ghostSpeed;
    if (g.slow > 0) spd *= g.type === 'boss' ? 0.75 : 0.5;

    if (target) {
      target.health -= g.dps * dt;
      g.haunting = true;
    } else {
      g.x -= spd * dt;
      g.haunting = false;
    }

    // castle gate: ring the bell, or lose
    const gate = s.gates[g.row];
    if (g.x < 40 && gate.charges > 0 && !gate.sweeping) {
      gate.charges--;
      gate.sweeping = true;
      gate.x = 0;
      gate.sweepId = ++s.sweepCounter;
      s.shake = Math.max(s.shake, 8);
      sfx('bell');
    }
    if (g.x < 0 && !gate.sweeping) {
      s.status = 'lost';
      s.endedAt = performance.now();
      saveBest(run.score);
      sfx('lose');
    }
  }

  // gate bells: a wave of holy light sweeps the row
  for (const gate of s.gates) {
    if (!gate.sweeping) continue;
    gate.x += 650 * dt;
    for (const g of s.ghosts) {
      if (g.row === gate.row && g.health > 0 && g.lastSweep !== gate.sweepId && g.x <= gate.x + 40) {
        g.lastSweep = gate.sweepId;
        damageGhost(g, g.type === 'boss' ? 500 : 9999, 'gate');
        burst(g.x + g.w / 2, TOP + g.row * CELL + 50, '#fff2a8', 14, 160);
        if (g.health > 0) g.x += 220;         // survivors (the boss) get pushed back
      }
    }
    if (gate.x > W + 60) gate.sweeping = false;
  }

  // shots
  for (let i = s.shots.length - 1; i >= 0; i--) {
    const a = s.shots[i];
    a.x += a.speed * dt;
    let remove = a.x > W + 20;
    for (const g of s.ghosts) {
      if (g.row !== a.row || g.health <= 0 || g.x >= W) continue;
      if (!(a.x > g.x + 10 && a.x < g.x + g.w)) continue;
      if (a.pierce) {
        if (a.hit.includes(g)) continue;
        a.hit.push(g);
        damageGhost(g, a.dmg, a.kind);
      } else {
        damageGhost(g, a.dmg, a.kind);
        if (a.slow) g.slow = Math.max(g.slow, a.slow);
        remove = true;
        break;
      }
    }
    if (remove) s.shots.splice(i, 1);
  }

  // spawn ghosts (faster over time)
  s.nextSpawn -= dt;
  if (s.spawned < L.total && s.nextSpawn <= 0) {
    spawnGhost(L);
    s.nextSpawn = Math.max(L.minGap, L.gapStart - s.spawned * L.gapStep);
  }

  // level cleared
  if (s.status === 'playing' && s.spawned >= L.total && s.ghosts.length === 0) {
    s.status = 'cleared';
    s.clearedAt = performance.now();
    run.score += 100;
    s.banner = { title: 'LEVEL COMPLETE!', sub: L.name + ' is safe', life: 2.6, color: '#ffd93b' };
    sfx('win');
  }
}

/* =========================================================
   DRAW: world
   ========================================================= */
function drawCastle(theme) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * CELL, y = TOP + r * CELL;
      ctx.fillStyle = (r + c) % 2 === 0 ? theme.a : theme.b;
      ctx.fillRect(x, y, CELL, CELL);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';      // stone gaps
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
    }
  }
  // castle gate on the left
  ctx.fillStyle = '#5a3b1f';
  ctx.fillRect(0, TOP, 10, ROWS * CELL);
  ctx.fillStyle = '#c9a227';
  for (let r = 0; r < ROWS; r++) {
    for (const off of [25, 75]) {
      ctx.beginPath();
      ctx.arc(5, TOP + r * CELL + off, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBells() {
  for (const gate of state.gates) {
    const cy = TOP + gate.row * CELL + CELL / 2;
    // warm torch glow by the gate
    const flick = 0.12 + 0.03 * Math.sin(animTime * 9 + gate.row * 2);
    const g = ctx.createRadialGradient(0, cy, 2, 0, cy, 120);
    g.addColorStop(0, `rgba(255,170,60,${flick * 2})`);
    g.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, cy - 120, 120, 240);
    if (gate.charges > 0) {
      emoji('🔔', 15, cy, 18);
      if (gate.charges > 1) text('x' + gate.charges, 15, cy + 16, 11, '#ffd93b', 'center');
    }
  }
}

function drawWaves() {
  for (const gate of state.gates) {
    if (!gate.sweeping) continue;
    const y = TOP + gate.row * CELL;
    const g = ctx.createLinearGradient(gate.x - 160, 0, gate.x + 10, 0);
    g.addColorStop(0, 'rgba(255,240,170,0)');
    g.addColorStop(1, 'rgba(255,245,190,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(gate.x - 160, y, 170, CELL);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(gate.x + 6, y, 4, CELL);
  }
}

function drawFog(theme) {
  for (let i = 0; i < 4; i++) {
    const x = ((animTime * (10 + i * 5) + i * 330) % (W + 500)) - 250;
    const y = TOP + 70 + i * 110;
    const g = ctx.createRadialGradient(x, y, 10, x, y, 230);
    g.addColorStop(0, `rgba(${theme.fog},0.09)`);
    g.addColorStop(1, `rgba(${theme.fog},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - 230, y - 230, 460, 460);
  }
}

function drawVignette() {
  const g = ctx.createRadialGradient(W / 2, TOP + 250, 220, W / 2, TOP + 250, 540);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, TOP, W, H - TOP);
}

function placementInfo(row, col) {
  const type = state.selected;
  if (!type) return null;
  const existing = getDefender(row, col);
  const def = DEFENDERS[type];
  const ok = state.light >= cost(type) && state.cooldowns[type] <= 0;
  if (!existing) return ok ? 'place' : 'blocked';
  if (existing.type === type && def.upgradable && existing.level === 1) return ok ? 'upgrade' : 'blocked';
  return 'blocked';
}

function drawHover() {
  if (mouse.x === null || mouse.y < TOP) return;
  const col = Math.floor(mouse.x / CELL);
  const row = Math.floor((mouse.y - TOP) / CELL);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

  const x = col * CELL, y = TOP + row * CELL;
  const info = placementInfo(row, col);
  ctx.lineWidth = 3;
  if (state.shovel) ctx.strokeStyle = 'rgba(255,60,60,0.9)';
  else if (info === 'upgrade') ctx.strokeStyle = 'rgba(255,217,59,0.95)';
  else if (info === 'blocked') ctx.strokeStyle = 'rgba(255,90,90,0.7)';
  else ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);

  if (info === 'place') {
    ctx.globalAlpha = 0.5;
    drawSprite(state.selected, x + CELL / 2, y + CELL / 2, 1);
    ctx.globalAlpha = 1;
  } else if (info === 'upgrade') {
    text('UPGRADE ★', x + CELL / 2, y + 10, 12, '#ffd93b', 'center');
  }
}

/* ---------- defenders ---------- */

// glowing ball of holy light (the currency; also used by the priest)
function drawOrb(cx, cy, r) {
  const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r * 1.6);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,240,170,0.95)');
  g.addColorStop(0.6, 'rgba(255,220,120,0.45)');
  g.addColorStop(1, 'rgba(255,220,120,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
  ctx.fill();
}

// Archer: hooded, with a bow. The string is pulled back and an arrow is nocked until he fires.
function drawArcher(cx, cy, s, p) {
  const ready = !(p && p.fire > 0);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  // quiver on the back
  ctx.fillStyle = '#5a3e22';
  ctx.fillRect(-26, -14, 9, 28);
  ctx.fillStyle = '#e8e8e8';
  for (const ax of [-24, -21, -18]) ctx.fillRect(ax, -20, 2, 7);
  // legs
  ctx.fillStyle = '#5a3e22';
  ctx.fillRect(-14, 18, 12, 22);
  ctx.fillRect(2, 18, 12, 22);
  // tunic + belt
  ctx.fillStyle = '#4f7d3a';
  ctx.fillRect(-18, -10, 36, 32);
  ctx.fillStyle = '#5a3e22';
  ctx.fillRect(-18, 10, 36, 5);
  // head
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(0, -22, 13, 0, Math.PI * 2);
  ctx.fill();
  // green hood + red feather
  ctx.fillStyle = '#3f6b3a';
  ctx.beginPath();
  ctx.arc(0, -26, 15, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-17, -27, 34, 5);
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(6, -40);
  ctx.lineTo(16, -50);
  ctx.stroke();
  // arm reaching toward the bow
  ctx.fillStyle = '#f1c27d';
  ctx.fillRect(8, -3, 30, 6);
  // bow
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(8, 0, 30, -0.9, 0.9);
  ctx.stroke();
  const tx = 8 + 30 * Math.cos(0.9), ty = 30 * Math.sin(0.9);
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(tx, -ty);
  ctx.lineTo(ready ? 16 : tx, 0);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  if (ready) {                         // nocked arrow
    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(40, 0);
    ctx.stroke();
    ctx.fillStyle = '#b0b7bf';
    ctx.beginPath();
    ctx.moveTo(40, -4);
    ctx.lineTo(48, 0);
    ctx.lineTo(40, 4);
    ctx.fill();
  }
  ctx.restore();
}

// Knight: full helmet with red plume, holding a big shield. The shield cracks when badly damaged.
function drawKnight(cx, cy, s, p) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  // legs
  ctx.fillStyle = '#5b616b';
  ctx.fillRect(-14, 18, 12, 22);
  ctx.fillRect(2, 18, 12, 22);
  // steel armor + red tabard
  ctx.fillStyle = '#9aa5b1';
  ctx.fillRect(-18, -10, 36, 32);
  ctx.fillStyle = '#b03a2e';
  ctx.fillRect(-9, -10, 18, 32);
  // helmet with visor slit and plume
  ctx.fillStyle = '#8a929c';
  ctx.beginPath();
  ctx.arc(0, -22, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#23262d';
  ctx.fillRect(-9, -24, 18, 4);
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.ellipse(0, -38, 4, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // hand holding the shield
  ctx.fillStyle = '#6f7782';
  ctx.fillRect(2, 2, 12, 8);
  // shield
  ctx.beginPath();
  ctx.moveTo(8, -24);
  ctx.lineTo(36, -24);
  ctx.lineTo(36, 14);
  ctx.quadraticCurveTo(36, 34, 22, 42);
  ctx.quadraticCurveTo(8, 34, 8, 14);
  ctx.closePath();
  ctx.fillStyle = '#2f4fb8';
  ctx.fill();
  ctx.strokeStyle = '#cfd6e6';
  ctx.lineWidth = 3;
  ctx.stroke();
  // gold cross emblem
  ctx.fillStyle = '#e0b73a';
  ctx.fillRect(20, -14, 4, 32);
  ctx.fillRect(12, -2, 20, 4);
  // cracks when damaged
  if (p && p.health < p.maxHealth * 0.5) {
    ctx.strokeStyle = '#11141b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, -22);
    ctx.lineTo(24, -8);
    ctx.lineTo(31, 2);
    ctx.lineTo(26, 16);
    ctx.stroke();
  }
  ctx.restore();
}

// Priest: white robe, holds a glowing staff. A light orb floats up just before he makes light.
function drawPriest(cx, cy, s, p) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  // long robe
  ctx.fillStyle = '#e8e4f0';
  ctx.beginPath();
  ctx.moveTo(-18, -10);
  ctx.lineTo(18, -10);
  ctx.lineTo(24, 40);
  ctx.lineTo(-24, 40);
  ctx.closePath();
  ctx.fill();
  // purple stole + gold hem
  ctx.fillStyle = '#7b4fb3';
  ctx.fillRect(-4, -10, 8, 50);
  ctx.fillStyle = '#e0b73a';
  ctx.fillRect(-24, 36, 48, 4);
  // head
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(0, -22, 13, 0, Math.PI * 2);
  ctx.fill();
  // purple cowl
  ctx.fillStyle = '#6a3fa0';
  ctx.beginPath();
  ctx.arc(0, -26, 15, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-16, -27, 32, 5);
  // staff
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(26, -30);
  ctx.lineTo(26, 40);
  ctx.stroke();
  // hand on the staff
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(24, 4, 5, 0, Math.PI * 2);
  ctx.fill();
  // glowing orb on top of the staff
  const pulse = p ? 1 + 0.15 * Math.sin(animTime * 5) : 1;
  drawOrb(26, -36, 9 * pulse);
  // floating orb hint (always on the card icon, only just before payout on the field)
  if (!p || p.timer < 2) {
    const bob = p ? Math.sin(animTime * 8) * 3 : 0;
    drawOrb(-26, -34 + bob, 8);
  }
  ctx.restore();
}

// Mage: blue robe, pointy hat, staff with a frost crystal that flares when he casts.
function drawMage(cx, cy, s, p) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  // robe
  ctx.fillStyle = '#2f4fb8';
  ctx.beginPath();
  ctx.moveTo(-18, -10);
  ctx.lineTo(18, -10);
  ctx.lineTo(24, 40);
  ctx.lineTo(-24, 40);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e0b73a';
  ctx.fillRect(-24, 36, 48, 4);
  // head
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(0, -22, 13, 0, Math.PI * 2);
  ctx.fill();
  // white beard
  ctx.fillStyle = '#f2f2f2';
  ctx.beginPath();
  ctx.moveTo(-10, -18);
  ctx.lineTo(10, -18);
  ctx.lineTo(0, 4);
  ctx.closePath();
  ctx.fill();
  // pointy hat with a star
  ctx.fillStyle = '#243c8a';
  ctx.beginPath();
  ctx.moveTo(-18, -30);
  ctx.lineTo(2, -52);
  ctx.lineTo(18, -30);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -30, 22, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd93b';
  ctx.beginPath();
  ctx.arc(3, -40, 3, 0, Math.PI * 2);
  ctx.fill();
  // staff
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(26, -24);
  ctx.lineTo(26, 40);
  ctx.stroke();
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(24, 4, 5, 0, Math.PI * 2);
  ctx.fill();
  // frost crystal (flares when casting)
  const pulse = p && p.fire > 0 ? 1.7 : 1 + 0.12 * Math.sin(animTime * 5);
  const g = ctx.createRadialGradient(26, -34, 1, 26, -34, 20 * pulse);
  g.addColorStop(0, 'rgba(143,227,255,0.9)');
  g.addColorStop(1, 'rgba(143,227,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(26, -34, 20 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c9f3ff';
  ctx.beginPath();
  ctx.moveTo(26, -46);
  ctx.lineTo(33, -34);
  ctx.lineTo(26, -22);
  ctx.lineTo(19, -34);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Cannon: iron barrel on a wooden carriage. It kicks back when it fires.
function drawCannon(cx, cy, s, p) {
  const kick = p && p.fire > 0 ? 7 : 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  // barrel
  ctx.fillStyle = '#2b2f38';
  ctx.beginPath();
  ctx.moveTo(-24 - kick, -4);
  ctx.lineTo(34 - kick, -9);
  ctx.lineTo(34 - kick, 19);
  ctx.lineTo(-24 - kick, 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1a1d24';                 // muzzle ring
  ctx.fillRect(30 - kick, -11, 9, 32);
  ctx.fillStyle = '#4a505c';                 // highlight
  ctx.fillRect(-20 - kick, 0, 50, 3);
  // carriage
  ctx.fillStyle = '#6b4a2a';
  ctx.fillRect(-30, 14, 52, 14);
  // wheel
  ctx.fillStyle = '#4a321b';
  ctx.beginPath();
  ctx.arc(-6, 30, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.lineWidth = 2;
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(-6, 30);
    ctx.lineTo(-6 + Math.cos(a) * 14, 30 + Math.sin(a) * 14);
    ctx.stroke();
  }
  // muzzle flash and smoke
  if (kick) {
    ctx.fillStyle = '#ffd54a';
    ctx.beginPath();
    ctx.arc(46 - kick, 5, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,200,200,0.6)';
    ctx.beginPath();
    ctx.arc(52 - kick, -4, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Holy Trap: a glowing rune on the floor.
function drawTrap(cx, cy, s, p) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  const pulse = 0.65 + 0.25 * Math.sin(animTime * 3 + (p ? p.col : 0));
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 42);
  g.addColorStop(0, `rgba(255,224,138,${pulse * 0.5})`);
  g.addColorStop(1, 'rgba(255,224,138,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(255,224,138,${pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();                            // pentagram
  for (let i = 0; i <= 5; i++) {
    const a = -Math.PI / 2 + i * 4 * Math.PI / 5;
    const x = Math.cos(a) * 26, y = Math.sin(a) * 26;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawSprite(type, cx, cy, s, p) {
  if (type === 'archer') drawArcher(cx, cy, s, p);
  else if (type === 'knight') drawKnight(cx, cy, s, p);
  else if (type === 'mage') drawMage(cx, cy, s, p);
  else if (type === 'cannon') drawCannon(cx, cy, s, p);
  else if (type === 'trap') drawTrap(cx, cy, s, p);
  else drawPriest(cx, cy, s, p);
}

function drawDefenders() {
  for (const d of state.defenders) {
    const cx = d.x + d.w / 2;
    drawSprite(d.type, cx, d.y + d.h / 2, 1, d);
    if (d.type === 'trap') continue;
    if (d.health < d.maxHealth) {
      healthBar(d.x + 8, d.y + d.h - 6, d.w - 16, d.health / d.maxHealth, '#3ddc4a');
    }
    if (d.level === 2) {                         // upgrade star
      text('★', d.x + d.w - 11, d.y + 15, 20, '#3a2b00', 'center');
      text('★', d.x + d.w - 12, d.y + 14, 20, '#ffd93b', 'center');
    }
    if (d.stun > 0) {                            // stun stars circling the head
      for (let k = 0; k < 3; k++) {
        const a = animTime * 4 + k * 2.1;
        text('★', cx + Math.cos(a) * 18, d.y + 6 + Math.sin(a) * 5, 13, '#ffe14d', 'center');
      }
    }
  }
}

/* ---------- ghosts ---------- */
const GHOST_COLORS = { ghost: '#f2f5ff', armored: '#cfd6e6', wisp: '#9be7ff', phantom: '#b8c4e6', banshee: '#e2d4ff', boss: '#d9d2ff' };

function drawGhost(cx, cy, g) {
  const sc = g.type === 'wisp' ? 0.8 : g.type === 'boss' ? 1.8 : 1;
  const bob = Math.sin(animTime * 3 + g.row * 2 + g.x * 0.04) * 3 * sc;   // floating up and down

  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.scale(sc, sc);

  let alpha = 0.9;
  if (g.type === 'phantom') alpha = g.phasing ? 0.3 : 0.6;
  ctx.globalAlpha = alpha;

  if (g.type === 'boss') {                       // purple aura
    const a = ctx.createRadialGradient(0, 0, 10, 0, 0, 62);
    a.addColorStop(0, 'rgba(160,100,255,0.45)');
    a.addColorStop(1, 'rgba(160,100,255,0)');
    ctx.fillStyle = a;
    ctx.beginPath();
    ctx.arc(0, 0, 62, 0, Math.PI * 2);
    ctx.fill();
  }

  // banshee hair (behind the body)
  if (g.type === 'banshee') {
    ctx.fillStyle = '#3b2a5e';
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sd * 28, -8);
      ctx.quadraticCurveTo(sd * 42, 16, sd * 30, 40);
      ctx.lineTo(sd * 23, 30);
      ctx.quadraticCurveTo(sd * 30, 10, sd * 22, -14);
      ctx.fill();
    }
  }

  // body: dome on top, wavy hem at the bottom
  ctx.fillStyle = g.flash > 0 ? '#ffffff' : GHOST_COLORS[g.type];
  ctx.beginPath();
  ctx.moveTo(-28, 30);
  ctx.lineTo(-28, -8);
  ctx.arc(0, -8, 28, Math.PI, 0);
  ctx.lineTo(28, 30);
  ctx.quadraticCurveTo(21, 20, 14, 30);
  ctx.quadraticCurveTo(7, 40, 0, 30);
  ctx.quadraticCurveTo(-7, 20, -14, 30);
  ctx.quadraticCurveTo(-21, 40, -28, 30);
  ctx.closePath();
  ctx.fill();
  if (g.slow > 0) {                              // frosty outline
    ctx.strokeStyle = '#8fe3ff';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // iron helmet for armored ghosts
  if (g.type === 'armored') {
    ctx.fillStyle = '#7d8590';
    ctx.beginPath();
    ctx.arc(0, -18, 29, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-30, -20, 60, 5);
  }

  // crown for the boss
  if (g.type === 'boss') {
    ctx.fillStyle = '#f5c542';
    ctx.beginPath();
    ctx.moveTo(-18, -34);
    ctx.lineTo(-18, -52);
    ctx.lineTo(-9, -42);
    ctx.lineTo(0, -56);
    ctx.lineTo(9, -42);
    ctx.lineTo(18, -52);
    ctx.lineTo(18, -34);
    ctx.closePath();
    ctx.fill();
  }

  // eyes (glow red while haunting) and mouth
  const angry = g.haunting || g.type === 'boss';
  ctx.fillStyle = angry ? '#e63946' : '#1b1b2f';
  ctx.beginPath();
  ctx.ellipse(-10, -8, 5, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(10, -8, 5, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b1b2f';
  ctx.beginPath();
  ctx.ellipse(0, 10, 6, g.type === 'banshee' ? 11 : g.haunting ? 9 : 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawGhosts() {
  for (const g of state.ghosts) {
    const wobble = g.haunting ? Math.sin(animTime * 14) * 2 : 0;
    const cx = g.x + g.w / 2 + wobble;
    const cy = TOP + g.row * CELL + CELL / 2;

    if (g.type === 'wisp') {            // speed trail
      ctx.strokeStyle = 'rgba(155,231,255,0.6)';
      ctx.lineWidth = 3;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(cx + 30, cy + k * 12);
        ctx.lineTo(cx + 52, cy + k * 12);
        ctx.stroke();
      }
    }

    drawGhost(cx, cy, g);
    if (g.type !== 'boss') healthBar(cx - 25, cy + 44, 50, g.health / g.maxHealth, '#e63946');
  }
}

function drawBossBar() {
  const boss = state.ghosts.find(g => g.type === 'boss');
  if (!boss) return;
  const w = 320, x = (W - w) / 2, y = TOP + 8;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - 4, y - 4, w + 8, 28);
  ctx.fillStyle = '#3a1020';
  ctx.fillRect(x, y, w, 12);
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(x, y, w * Math.max(0, boss.health / boss.maxHealth), 12);
  text('SPECTRAL LORD', W / 2, y + 20, 11, '#fff', 'center');
}

/* ---------- shots, orbs, effects ---------- */
function drawShots() {
  for (const a of state.shots) {
    if (a.kind === 'arrow') {
      const ay = TOP + a.row * CELL + 50;
      ctx.fillStyle = '#8b5a2b';                       // shaft
      ctx.fillRect(a.x - 20, ay - 1.5, 20, 3);
      ctx.fillStyle = '#e8e8e8';                       // feathers
      ctx.fillRect(a.x - 20, ay - 4, 6, 8);
      ctx.fillStyle = '#b0b7bf';                       // tip
      ctx.beginPath();
      ctx.moveTo(a.x, ay - 4);
      ctx.lineTo(a.x + 9, ay);
      ctx.lineTo(a.x, ay + 4);
      ctx.fill();
    } else if (a.kind === 'bolt') {
      const by = TOP + a.row * CELL + 44;
      const g = ctx.createRadialGradient(a.x, by, 1, a.x, by, 16);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(143,227,255,0.9)');
      g.addColorStop(1, 'rgba(143,227,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(a.x, by, 16, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const by = TOP + a.row * CELL + 56;
      ctx.fillStyle = 'rgba(255,170,60,0.35)';
      ctx.fillRect(a.x - 40, by - 5, 40, 10);
      ctx.fillStyle = '#1a1d24';
      ctx.beginPath();
      ctx.arc(a.x, by, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function drawOrbs() {
  for (const o of state.orbs) {
    const cx = o.x + o.size / 2, cy = o.y + o.size / 2;
    // fade out when about to disappear
    ctx.globalAlpha = o.y >= o.targetY && o.life < 2 ? Math.max(0.2, o.life / 2) : 1;
    drawOrb(cx, cy, 24 + Math.sin(animTime * 4 + o.x) * 1.5);
    ctx.globalAlpha = 1;
  }
}

function drawEffects() {
  for (const r of state.rings) {
    ctx.globalAlpha = Math.max(0, r.life / 0.7);
    ctx.strokeStyle = '#d9b3ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawFloaters() {
  for (const f of state.floaters) {
    ctx.globalAlpha = Math.min(1, f.life * 2);
    text(f.str, f.x, f.y, 15, '#000', 'center');          // shadow
    text(f.str, f.x - 1, f.y - 1, 15, f.color, 'center');
  }
  ctx.globalAlpha = 1;
}

function drawWorld() {
  const theme = LEVELS[run.levelIndex].theme;
  ctx.save();
  if (state.shake > 0) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  drawCastle(theme);
  drawBells();
  if (scene === 'level' && state.status === 'playing') drawHover();
  drawDefenders();
  drawGhosts();
  drawWaves();
  drawShots();
  drawFog(theme);
  drawVignette();
  drawEffects();
  drawOrbs();
  drawFloaters();
  drawBossBar();
  ctx.restore();
}

/* =========================================================
   DRAW: interface
   ========================================================= */
function drawBar() {
  const L = LEVELS[run.levelIndex];
  ctx.fillStyle = '#1f2030';
  ctx.fillRect(0, 0, W, TOP);
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(0, TOP - 4, W, 4);

  // light counter
  ctx.fillStyle = '#e8dcc0';
  ctx.fillRect(10, 10, 100, 80);
  drawOrb(60, 34, 16);
  text(Math.floor(state.light), 60, 72, 26, '#000', 'center');

  // defender cards
  let hovered = -1;
  CARD_ORDER.forEach((type, i) => {
    const r = cardRect(i), def = DEFENDERS[type];
    const unlocked = isUnlocked(type);
    const price = cost(type);
    if (inRect(mouse.x, mouse.y, r)) hovered = i;

    ctx.fillStyle = !unlocked ? '#4a4a55' : state.light >= price ? '#e8dcc0' : '#8f8870';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (unlocked) {
      drawSprite(type, r.x + r.w / 2, r.y + 32, 0.45);
      text(price, r.x + r.w / 2, r.y + 67, 16, '#000', 'center');
      text(i + 1, r.x + 6, r.y + 9, 11, '#555');
      const cd = state.cooldowns[type];
      if (cd > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(r.x, r.y, r.w, r.h * (cd / (def.cooldown * run.perks.cooldown)));
      }
      if (state.selected === type) {          // blue glow so it stands out from the beige card
        ctx.save();
        ctx.shadowColor = '#3aa0ff';
        ctx.shadowBlur = 14;
        ctx.strokeStyle = '#1e78ff';
        ctx.lineWidth = 4;
        ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
        ctx.restore();
      }
    } else {
      emoji('🔒', r.x + r.w / 2, r.y + 30, 24);
      text('Lv ' + unlockLevel(type), r.x + r.w / 2, r.y + 64, 13, '#ddd', 'center');
    }
  });

  // shovel
  const sr = cardRect(SHOVEL_INDEX);
  ctx.fillStyle = '#e8dcc0';
  ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
  emoji('⛏️', sr.x + sr.w / 2, sr.y + 32, 32);
  text('Remove', sr.x + sr.w / 2, sr.y + 66, 12, '#000', 'center');
  text('X', sr.x + 6, sr.y + 9, 11, '#555');
  if (state.shovel) {
    ctx.strokeStyle = '#ff5050';
    ctx.lineWidth = 4;
    ctx.strokeRect(sr.x + 2, sr.y + 2, sr.w - 4, sr.h - 4);
  }

  // level, score, progress
  text('Lv ' + (run.levelIndex + 1) + ' · ' + L.name, 600, 20, 14, '#ffd98a');
  text('Score ' + run.score + '   Best ' + Math.max(best, run.score), 600, 42, 14, '#fff');
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(600, 60, 290, 16);
  ctx.fillStyle = '#8fd3ff';
  ctx.fillRect(600, 60, 290 * (state.banished / L.total), 16);
  text('Ghosts banished ' + state.banished + ' / ' + L.total, 745, 68, 11, '#000', 'center');

  // pause and mute buttons
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  rrect(PAUSE_RECT.x, PAUSE_RECT.y, PAUSE_RECT.w, PAUSE_RECT.h, 6);
  ctx.fill();
  rrect(MUTE_RECT.x, MUTE_RECT.y, MUTE_RECT.w, MUTE_RECT.h, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  if (state.status === 'paused') {
    ctx.beginPath();
    ctx.moveTo(PAUSE_RECT.x + 11, PAUSE_RECT.y + 8);
    ctx.lineTo(PAUSE_RECT.x + 22, PAUSE_RECT.y + 15);
    ctx.lineTo(PAUSE_RECT.x + 11, PAUSE_RECT.y + 22);
    ctx.fill();
  } else {
    ctx.fillRect(PAUSE_RECT.x + 9, PAUSE_RECT.y + 8, 4, 14);
    ctx.fillRect(PAUSE_RECT.x + 17, PAUSE_RECT.y + 8, 4, 14);
  }
  emoji(muted ? '🔇' : '🔊', MUTE_RECT.x + 15, MUTE_RECT.y + 16, 17);

  // tooltip for the card under the mouse
  if (hovered >= 0 && state.status === 'playing') {
    const type = CARD_ORDER[hovered], def = DEFENDERS[type];
    const lines = wrapLines(def.desc, 270, 14);
    if (!isUnlocked(type)) lines.push('Unlocks in level ' + unlockLevel(type) + '.');
    else if (def.upgradable) lines.push('Place another on it to upgrade (★).');
    const w = 300, h = 36 + lines.length * 18;
    const x = Math.min(cardRect(hovered).x, W - w - 8), y = TOP + 6;
    ctx.fillStyle = 'rgba(10,12,20,0.94)';
    rrect(x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 2;
    ctx.stroke();
    text(def.name + ' · ' + cost(type) + ' light', x + 12, y + 18, 16, '#ffd98a');
    lines.forEach((ln, k) => text(ln, x + 12, y + 40 + k * 18, 14, '#e8e8e8', 'left', 'normal'));
  }
}

function drawBanner() {
  const b = state.banner;
  if (!b || b.life <= 0) return;
  const a = Math.min(1, b.life * 1.5);
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 250, W, 110);
  text(b.title, W / 2, 292, 42, b.color, 'center');
  text(b.sub, W / 2, 334, 22, '#fff', 'center', 'normal');
  ctx.globalAlpha = 1;
}

function drawStatusOverlay() {
  if (state.status === 'paused') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    text('PAUSED', W / 2, 270, 64, '#ffd98a', 'center');
    text('Press P or click to resume', W / 2, 335, 24, '#fff', 'center', 'normal');
  } else if (state.status === 'lost') {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, H);
    text('THE GHOSTS HAUNTED THE CASTLE!', W / 2, 240, 44, '#ff6b6b', 'center');
    text('Score ' + run.score + '   Best ' + best, W / 2, 305, 26, '#fff', 'center');
    text('Click or press Enter to retry level ' + (run.levelIndex + 1), W / 2, 365, 24, '#ffd98a', 'center', 'normal');
  }
}

function drawPerkScreen() {
  ctx.fillStyle = 'rgba(5,6,12,0.82)';
  ctx.fillRect(0, 0, W, H);
  text('LEVEL ' + (run.levelIndex + 1) + ' COMPLETE!', W / 2, 80, 46, '#ffd93b', 'center');
  text('Choose a blessing for the next level', W / 2, 140, 22, '#fff', 'center', 'normal');
  perkChoices.forEach((perk, i) => {
    const r = perkRect(i);
    const hot = inRect(mouse.x, mouse.y, r);
    ctx.fillStyle = hot ? '#2c3050' : '#1f2030';
    rrect(r.x, r.y, r.w, r.h, 12);
    ctx.fill();
    ctx.strokeStyle = hot ? '#ffd93b' : '#c9a227';
    ctx.lineWidth = hot ? 4 : 2;
    ctx.stroke();
    text(i + 1, r.x + 16, r.y + 20, 16, '#8a8fa8');
    drawOrb(r.x + r.w / 2, r.y + 60, 20);
    text(perk.name, r.x + r.w / 2, r.y + 112, 22, '#ffd98a', 'center');
    wrapLines(perk.desc, r.w - 40, 16).forEach((ln, k) => text(ln, r.x + r.w / 2, r.y + 148 + k * 22, 16, '#e8e8e8', 'center', 'normal'));
  });
  text('Score ' + run.score + '   Best ' + Math.max(best, run.score), W / 2, 460, 20, '#fff', 'center');
  if (run.perks.owned.length) {
    wrapLines('Your blessings: ' + run.perks.owned.join(', '), 760, 15).forEach((ln, k) =>
      text(ln, W / 2, 495 + k * 20, 15, '#aab', 'center', 'normal'));
  }
}

function drawMenu() {
  const theme = LEVELS[0].theme;
  drawCastle(theme);
  drawFog(theme);
  drawVignette();
  ctx.fillStyle = 'rgba(5,6,12,0.74)';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.shadowColor = 'rgba(255,170,40,0.9)';
  ctx.shadowBlur = 30;
  text('HAUNTED KEEP', W / 2, 90, 66, '#ffd98a', 'center');
  ctx.restore();
  text('Defend the castle from the restless dead', W / 2, 142, 20, '#cfd6e6', 'center', 'normal');

  CARD_ORDER.forEach((type, i) => drawSprite(type, 130 + i * 128, 235, 0.95));
  const demo = ['ghost', 'armored', 'wisp', 'phantom', 'banshee', 'boss'];
  demo.forEach((type, i) => {
    const g = { type, row: i, x: i * 10, haunting: false, phasing: false, flash: 0, slow: 0 };
    drawGhost(130 + i * 128, 350, g);
  });

  const tips = [
    'Click glowing light orbs to collect them, then spend them on defenders.',
    'Place the same defender on top of one to upgrade it.',
    'Each gate has a bell that clears a row once. Use that second chance well.',
    'Keys: 1-6 choose a defender   X remove   P pause   M mute'
  ];
  tips.forEach((t, i) => text(t, W / 2, 430 + i * 26, 16, '#e8e8e8', 'center', 'normal'));

  const blink = 0.55 + 0.45 * Math.sin(animTime * 4);
  ctx.globalAlpha = blink;
  text('Click or press ENTER to start', W / 2, 553, 26, '#ffd98a', 'center');
  ctx.globalAlpha = 1;
  if (best > 0) text('Best score: ' + best, W / 2, 582, 15, '#aab', 'center', 'normal');
}

function drawVictory() {
  ctx.fillStyle = 'rgba(5,6,12,0.82)';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.shadowColor = 'rgba(255,217,59,0.9)';
  ctx.shadowBlur = 30;
  text('THE KEEP IS SAVED!', W / 2, 220, 58, '#ffd93b', 'center');
  ctx.restore();
  text('You banished every ghost from all ' + LEVELS.length + ' levels.', W / 2, 290, 24, '#fff', 'center', 'normal');
  text('Final score ' + run.score, W / 2, 345, 34, '#ffd98a', 'center');
  text(run.score >= best ? 'New best score!' : 'Best ' + best, W / 2, 390, 20, '#8fd3ff', 'center');
  text('Click to return to the menu', W / 2, 460, 22, '#fff', 'center', 'normal');
}

function draw() {
  ctx.fillStyle = '#07080d';
  ctx.fillRect(0, 0, W, H);
  if (scene === 'menu') {
    drawMenu();
  } else if (scene === 'perk') {
    drawWorld();
    drawBar();
    drawPerkScreen();
  } else if (scene === 'victory') {
    drawWorld();
    drawBar();
    drawVictory();
  } else {
    drawWorld();
    drawBar();
    drawBanner();
    drawStatusOverlay();
  }
}

/* =========================================================
   MAIN LOOP
   ========================================================= */
let lastTime = performance.now();

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);  // cap dt so a background tab doesn't cause a huge jump
  lastTime = now;
  animTime += dt;

  if (scene === 'level') {
    if (state.status === 'playing') {
      update(dt);
      updateEffects(dt);
    } else if (state.status === 'lost') {
      updateEffects(dt);
    } else if (state.status === 'cleared') {
      updateEffects(dt);
      if (performance.now() - state.clearedAt > 2600) finishLevel();
    }
  }

  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);