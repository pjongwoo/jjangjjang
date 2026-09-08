"use strict";

/* ===================== 설정값 ===================== */
const LANES = 5;
const ROWS = 6;
const MAX_COUNT = 999999999;
const BASE_BOSS_HP = 34;
const BOSS_GROWTH = 1.26;

const DIFFICULTIES = {
  easy: {
    key: "easy", label: "쉬움",
    lives: 5, mobCrossTime: 7.5, bossCrossTimeMult: 2.0, bossHpMult: 0.7, spawnInterval: 0.9,
    desc: "적이 느리게 내려오고 생명이 넉넉해요. 처음이라면 이걸로 시작하세요.",
  },
  normal: {
    key: "normal", label: "보통",
    lives: 3, mobCrossTime: 5.5, bossCrossTimeMult: 1.8, bossHpMult: 1.0, spawnInterval: 0.65,
    desc: "적당한 속도와 균형 잡힌 난이도예요.",
  },
  hard: {
    key: "hard", label: "어려움",
    lives: 2, mobCrossTime: 3.8, bossCrossTimeMult: 1.6, bossHpMult: 1.4, spawnInterval: 0.45,
    desc: "적이 빠르게 내려오고 생명이 적어요. 실력자용!",
  },
};

const GATE_TYPES = {
  mult: {
    name: "배율 게이트",
    color: "#8b5cf6",
    dark: "#5b21b6",
    tiers: [
      { factor: 2, cost: 20 },
      { factor: 3, cost: 45 },
      { factor: 4, cost: 90 },
      { factor: 6, cost: 180 },
      { factor: 10, cost: 360 },
    ],
    desc: (t) => `통과하는 총알 수를 ×${t.factor} 로 만듭니다`,
    label: (t) => `×${t.factor}`,
  },
  add: {
    name: "증가 게이트",
    color: "#22c1c3",
    dark: "#0e6f70",
    tiers: [
      { amount: 2, cost: 12 },
      { amount: 5, cost: 32 },
      { amount: 10, cost: 70 },
      { amount: 20, cost: 150 },
    ],
    desc: (t) => `통과하는 총알에 ${t.amount}발을 추가합니다`,
    label: (t) => `+${t.amount}`,
  },
  power: {
    name: "공격력 게이트",
    color: "#ff9d3d",
    dark: "#b35a00",
    tiers: [
      { factor: 1.5, cost: 18 },
      { factor: 2, cost: 45 },
      { factor: 3, cost: 100 },
    ],
    desc: (t) => `총알 1발의 데미지를 ×${t.factor} 로 만듭니다 (보스에게 효과적)`,
    label: (t) => `⚔×${t.factor}`,
  },
  coin: {
    name: "코인 게이트",
    color: "#ffd24d",
    dark: "#8a6400",
    tiers: [
      { amount: 3, cost: 15 },
      { amount: 8, cost: 40 },
      { amount: 18, cost: 90 },
    ],
    desc: (t) => `총알이 지날 때마다 코인 ${t.amount}개 획득`,
    label: (t) => `$${t.amount}`,
  },
};

/* ===================== 상태 ===================== */
const state = {
  W: 480, H: 800,
  laneCenters: [], rowY: [], topLine: 0, bottomLine: 0, rowGap: 0,
  coins: 100,
  wave: 1,
  lives: 3,
  gates: {},   // gates[row][lane] = { type, level, spent }
  hazards: {}, // hazards[row][lane] = true
  bullets: [],
  enemies: [],
  floatTexts: [],
  particles: [],
  boss: { hp: BASE_BOSS_HP, maxHp: BASE_BOSS_HP },
  currentLane: Math.floor(LANES / 2),
  phase: "pending", // pending | build | battle | victory | defeat
  difficulty: null,
  mobSpeed: 60, bossSpeed: 30,
  mobsToSpawn: 8, mobsSpawned: 0, mobSpawnInterval: 0.6, mobSpawnTimer: 0,
  bossSpawned: false, bossAlive: false,
  fireInterval: 0.2, fireTimer: 0,
  totalKilled: 0, totalEnemiesThisWave: 9,
  speedMultiplier: 1,
  rivals: { a: { p: 0, speed: 0 }, b: { p: 0, speed: 0 } },
  shopTarget: null,
};

/* ===================== DOM refs ===================== */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const coinValueEl = document.getElementById("coinValue");
const waveValueEl = document.getElementById("waveValue");
const livesValueEl = document.getElementById("livesValue");
const speedBtn = document.getElementById("speedBtn");
const diffBtn = document.getElementById("diffBtn");
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");
const actionBtn = document.getElementById("actionBtn");
const bannerOverlay = document.getElementById("bannerOverlay");
const bannerText = document.getElementById("bannerText");
const bannerSub = document.getElementById("bannerSub");
const bannerBtn = document.getElementById("bannerBtn");
const shopModal = document.getElementById("shopModal");
const shopTitle = document.getElementById("shopTitle");
const shopBody = document.getElementById("shopBody");
const shopClose = document.getElementById("shopClose");
const diffModal = document.getElementById("diffModal");
const diffBody = document.getElementById("diffBody");
const diffClose = document.getElementById("diffClose");
const youFill = document.getElementById("youFill");
const botAFill = document.getElementById("botAFill");
const botBFill = document.getElementById("botBFill");

/* ===================== 유틸 ===================== */
function formatNum(n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const units = ["K", "M", "B", "T"];
  let u = -1;
  let v = n;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1000;
    u++;
  }
  return v.toFixed(v < 10 ? 2 : 1).replace(/\.0+$/, "") + units[u];
}

function laneCenterX(lane) {
  return state.laneCenters[lane];
}

function spawnFloatText(x, y, text, color, big) {
  state.floatTexts.push({ x, y, text, color, life: 1, maxLife: 1, vy: -46, big: !!big });
}

function spawnParticle(x, y, color) {
  state.particles.push({ x, y, life: 0.35, maxLife: 0.35, color: color || "255, 210, 100" });
}

/* ===================== 레이아웃 ===================== */
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(200, rect.width);
  const h = Math.max(300, rect.height);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.W = w;
  state.H = h;
  computeLayout();
}

function computeLayout() {
  const W = state.W, H = state.H;
  const laneWidth = W / LANES;
  state.laneCenters = [];
  for (let i = 0; i < LANES; i++) state.laneCenters.push(laneWidth * (i + 0.5));

  state.topLine = H * 0.12;      // 적 스폰 라인 (위)
  state.bottomLine = H * 0.86;   // 플레이어 라인 (아래)
  state.playerY = state.bottomLine;

  const rowGap = (state.bottomLine - state.topLine) / ROWS;
  state.rowGap = rowGap;
  state.rowY = [];
  for (let r = 0; r < ROWS; r++) state.rowY.push(state.topLine + rowGap * (r + 0.5));
}

/* ===================== 난이도 / 새 게임 ===================== */
function renderDiffOptions() {
  diffBody.innerHTML = "";
  Object.values(DIFFICULTIES).forEach((d) => {
    const btn = document.createElement("button");
    btn.className = "diff-option" + (state.difficulty && state.difficulty.key === d.key ? " selected" : "");
    btn.innerHTML = `<div class="diff-name ${d.key}">${d.label}</div><div class="diff-desc">${d.desc}</div><div class="diff-stats">생명 ${d.lives}개</div>`;
    btn.onclick = () => {
      startNewRun(d.key);
      diffModal.classList.add("hidden");
    };
    diffBody.appendChild(btn);
  });
  diffClose.style.visibility = state.difficulty ? "visible" : "hidden";
}

function openDiffModal() {
  renderDiffOptions();
  diffModal.classList.remove("hidden");
}
diffBtn.addEventListener("click", openDiffModal);
diffClose.addEventListener("click", () => {
  if (state.difficulty) diffModal.classList.add("hidden");
});

function startNewRun(diffKey) {
  state.difficulty = DIFFICULTIES[diffKey];
  state.wave = 1;
  state.coins = 100;
  state.gates = {};
  state.hazards = {};
  setupWave(true);
}

/* ===================== 웨이브 설정 ===================== */
function setupWave(newHazards) {
  state.phase = "build";
  const d = state.difficulty;
  const waveSpeedFactor = Math.max(0.6, 1 - (state.wave - 1) * 0.03);

  state.boss.maxHp = Math.round(BASE_BOSS_HP * Math.pow(BOSS_GROWTH, state.wave - 1) * d.bossHpMult);
  state.boss.hp = state.boss.maxHp;
  state.bullets = [];
  state.enemies = [];
  state.floatTexts = [];
  state.particles = [];
  state.lives = d.lives;
  state.currentLane = Math.floor(LANES / 2);

  const zoneLen = state.bottomLine - state.topLine || 500;
  state.mobSpeed = zoneLen / (d.mobCrossTime * waveSpeedFactor);
  state.bossSpeed = zoneLen / (d.mobCrossTime * d.bossCrossTimeMult * waveSpeedFactor);

  state.mobsToSpawn = Math.min(30, 8 + state.wave * 2);
  state.mobsSpawned = 0;
  state.mobSpawnInterval = Math.max(0.25, d.spawnInterval - state.wave * 0.01);
  state.mobSpawnTimer = 0.4;
  state.bossSpawned = false;
  state.bossAlive = false;

  state.fireInterval = Math.max(0.09, 0.2 - state.wave * 0.004);
  state.fireTimer = 0;

  state.totalKilled = 0;
  state.totalEnemiesThisWave = state.mobsToSpawn + 1;

  if (newHazards) regenerateHazards();
  resetRivals();
  updateHud();
  setActionButton("전투 시작", false);
  hideBanner();
}

function regenerateHazards() {
  state.hazards = {};
  const count = Math.min(4, 1 + Math.floor(state.wave / 3));
  let attempts = 0;
  let placed = 0;
  while (placed < count && attempts < 60) {
    attempts++;
    const r = Math.floor(Math.random() * ROWS);
    const l = Math.floor(Math.random() * LANES);
    if (state.gates[r] && state.gates[r][l]) continue;
    if (state.hazards[r] && state.hazards[r][l]) continue;
    if (!state.hazards[r]) state.hazards[r] = {};
    state.hazards[r][l] = true;
    placed++;
  }
}

function resetRivals() {
  state.rivals.a = { p: 0, speed: 1 / (16 + Math.random() * 8) };
  state.rivals.b = { p: 0, speed: 1 / (16 + Math.random() * 10) };
}

/* ===================== 전투 ===================== */
function startBattle() {
  if (state.phase !== "build") return;
  state.phase = "battle";
  setActionButton("전투 중...", true);
}

function endBattle(won) {
  if (won) {
    state.phase = "victory";
    const base = 40 + state.wave * 18;
    const livesBonus = state.lives * 15;
    const reward = base + livesBonus;
    state.coins += reward;
    updateHud();
    showBanner("승리! 🎉", `보스를 처치했습니다! 코인 +${formatNum(reward)}`, "다음 웨이브", () => {
      state.wave += 1;
      setupWave(true);
    });
  } else {
    state.phase = "defeat";
    const reason = state.lives <= 0 ? "생명을 모두 잃었습니다." : "보스가 저지선을 뚫었습니다!";
    showBanner("실패...", `${reason} 게이트를 보강해서 다시 도전해보세요!`, "다시 도전", () => {
      setupWave(false);
    });
  }
}

function showBanner(title, sub, btnLabel, onClick) {
  bannerText.textContent = title;
  bannerSub.textContent = sub;
  bannerBtn.textContent = btnLabel;
  bannerBtn.onclick = () => {
    onClick();
  };
  bannerOverlay.classList.remove("hidden");
}
function hideBanner() {
  bannerOverlay.classList.add("hidden");
}

function setActionButton(label, disabled) {
  actionBtn.textContent = label;
  actionBtn.disabled = disabled;
}

/* ===================== 게이트 상점 ===================== */
function openShop(r, l) {
  if (state.phase !== "build") return;
  state.shopTarget = { r, l };
  shopBody.innerHTML = "";

  if (state.hazards[r] && state.hazards[r][l]) {
    shopTitle.textContent = "위험 지대 ☠";
    const info = document.createElement("div");
    info.className = "shop-option";
    info.innerHTML = `<div class="shop-icon">☠</div><div class="shop-info"><div class="shop-name">위험 지대</div><div class="shop-desc">이 칸을 지나가는 총알은 절반으로 줄어듭니다. 레인을 옮겨 피하세요!</div></div>`;
    shopBody.appendChild(info);
    shopModal.classList.remove("hidden");
    return;
  }

  const existing = state.gates[r] && state.gates[r][l];

  if (existing) {
    const def = GATE_TYPES[existing.type];
    shopTitle.textContent = `${def.name} (Lv.${existing.level + 1})`;

    const cur = document.createElement("div");
    cur.className = "shop-option";
    cur.style.cursor = "default";
    cur.innerHTML = `<div class="shop-icon">${def.label(def.tiers[existing.level])}</div><div class="shop-info"><div class="shop-name">현재 효과</div><div class="shop-desc">${def.desc(def.tiers[existing.level])}</div></div>`;
    shopBody.appendChild(cur);

    if (existing.level + 1 < def.tiers.length) {
      const nextTier = def.tiers[existing.level + 1];
      const btn = document.createElement("button");
      btn.className = "shop-option";
      btn.disabled = state.coins < nextTier.cost;
      btn.innerHTML = `<div class="shop-icon">${def.label(nextTier)}</div><div class="shop-info"><div class="shop-name">업그레이드</div><div class="shop-desc">${def.desc(nextTier)}</div></div><div class="shop-cost">🪙${nextTier.cost}</div>`;
      btn.onclick = () => {
        if (state.coins < nextTier.cost) return;
        state.coins -= nextTier.cost;
        existing.level += 1;
        existing.spent += nextTier.cost;
        updateHud();
        openShop(r, l);
      };
      shopBody.appendChild(btn);
    } else {
      const maxed = document.createElement("div");
      maxed.className = "shop-option";
      maxed.style.cursor = "default";
      maxed.innerHTML = `<div class="shop-icon">★</div><div class="shop-info"><div class="shop-name">최대 레벨</div><div class="shop-desc">더 이상 업그레이드할 수 없습니다</div></div>`;
      shopBody.appendChild(maxed);
    }

    const refund = Math.floor(existing.spent * 0.5);
    const sell = document.createElement("button");
    sell.className = "shop-option sell";
    sell.innerHTML = `<div class="shop-icon">🗑</div><div class="shop-info"><div class="shop-name">판매</div><div class="shop-desc">게이트를 제거하고 코인을 환급받습니다</div></div><div class="shop-cost">+${refund}</div>`;
    sell.onclick = () => {
      delete state.gates[r][l];
      state.coins += refund;
      updateHud();
      closeShop();
    };
    shopBody.appendChild(sell);
  } else {
    shopTitle.textContent = "게이트 설치";
    Object.keys(GATE_TYPES).forEach((type) => {
      const def = GATE_TYPES[type];
      const tier = def.tiers[0];
      const btn = document.createElement("button");
      btn.className = "shop-option";
      btn.disabled = state.coins < tier.cost;
      btn.innerHTML = `<div class="shop-icon" style="color:${def.color}">${def.label(tier)}</div><div class="shop-info"><div class="shop-name">${def.name}</div><div class="shop-desc">${def.desc(tier)}</div></div><div class="shop-cost">🪙${tier.cost}</div>`;
      btn.onclick = () => {
        if (state.coins < tier.cost) return;
        state.coins -= tier.cost;
        if (!state.gates[r]) state.gates[r] = {};
        state.gates[r][l] = { type, level: 0, spent: tier.cost };
        updateHud();
        closeShop();
      };
      shopBody.appendChild(btn);
    });
  }

  shopModal.classList.remove("hidden");
}
function closeShop() {
  shopModal.classList.add("hidden");
  state.shopTarget = null;
}

/* ===================== 입력 ===================== */
function moveLane(dir) {
  state.currentLane = Math.min(LANES - 1, Math.max(0, state.currentLane + dir));
}
leftBtn.addEventListener("click", () => moveLane(-1));
rightBtn.addEventListener("click", () => moveLane(1));
window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") moveLane(-1);
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") moveLane(1);
});

actionBtn.addEventListener("click", () => {
  if (state.phase === "build") startBattle();
});

speedBtn.addEventListener("click", () => {
  state.speedMultiplier = state.speedMultiplier === 1 ? 2 : 1;
  speedBtn.textContent = state.speedMultiplier + "x";
  speedBtn.classList.toggle("active", state.speedMultiplier === 2);
});

shopClose.addEventListener("click", closeShop);
shopModal.addEventListener("click", (e) => {
  if (e.target === shopModal) closeShop();
});

canvas.addEventListener("pointerup", (e) => {
  if (state.phase !== "build") return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  if (y < state.topLine || y > state.bottomLine) return;
  const l = Math.floor(x / (state.W / LANES));
  const r = Math.floor((y - state.topLine) / state.rowGap);
  if (l < 0 || l >= LANES || r < 0 || r >= ROWS) return;
  openShop(r, l);
});

/* ===================== HUD ===================== */
function updateHud() {
  coinValueEl.textContent = formatNum(state.coins);
  waveValueEl.textContent = state.wave;
  livesValueEl.textContent = "❤️".repeat(Math.max(0, state.lives));
}

function updateRivals() {
  const youPct = Math.min(100, Math.round((state.totalKilled / state.totalEnemiesThisWave) * 100));
  youFill.style.width = youPct + "%";
  botAFill.style.width = Math.min(100, Math.round(state.rivals.a.p * 100)) + "%";
  botBFill.style.width = Math.min(100, Math.round(state.rivals.b.p * 100)) + "%";
}

/* ===================== 게임 루프 ===================== */
let lastTime = performance.now();

function applyRow(bullet, row) {
  const l = bullet.lane;
  if (state.hazards[row] && state.hazards[row][l]) {
    bullet.count = Math.max(1, Math.floor(bullet.count / 2));
    spawnFloatText(laneCenterX(l), state.rowY[row], "-50%", "#ff5d6c");
    return;
  }
  const g = state.gates[row] && state.gates[row][l];
  if (!g) return;
  const def = GATE_TYPES[g.type];
  const tier = def.tiers[g.level];
  switch (g.type) {
    case "mult":
      bullet.count = Math.min(MAX_COUNT, Math.round(bullet.count * tier.factor));
      spawnFloatText(laneCenterX(l), state.rowY[row], def.label(tier), def.color, true);
      break;
    case "add":
      bullet.count = Math.min(MAX_COUNT, bullet.count + tier.amount);
      spawnFloatText(laneCenterX(l), state.rowY[row], def.label(tier), def.color);
      break;
    case "power":
      bullet.dmg *= tier.factor;
      spawnFloatText(laneCenterX(l), state.rowY[row], def.label(tier), def.color);
      break;
    case "coin":
      state.coins += tier.amount;
      updateHud();
      spawnFloatText(laneCenterX(l), state.rowY[row], "🪙+" + tier.amount, def.color);
      break;
  }
}

function trySpawnEnemies(dt) {
  if (state.mobsSpawned < state.mobsToSpawn) {
    state.mobSpawnTimer -= dt;
    if (state.mobSpawnTimer <= 0) {
      state.mobSpawnTimer = state.mobSpawnInterval;
      state.mobsSpawned++;
      state.enemies.push({
        kind: "mob",
        lane: Math.floor(Math.random() * LANES),
        y: state.topLine - 16,
        hp: 1, maxHp: 1,
      });
    }
  } else if (!state.bossSpawned) {
    state.mobSpawnTimer -= dt;
    if (state.mobSpawnTimer <= -0.8) {
      state.bossSpawned = true;
      state.bossAlive = true;
      state.enemies.push({
        kind: "boss",
        lane: Math.floor(Math.random() * LANES),
        y: state.topLine - 30,
        hp: state.boss.maxHp, maxHp: state.boss.maxHp,
      });
    }
  }
}

function update(dt) {
  for (let i = state.floatTexts.length - 1; i >= 0; i--) {
    const f = state.floatTexts[i];
    f.life -= dt / f.maxLife;
    f.y += f.vy * dt;
    f.vy *= 0.92;
    if (f.life <= 0) state.floatTexts.splice(i, 1);
  }
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }

  if (state.phase !== "battle") return;

  state.rivals.a.p = Math.min(1, state.rivals.a.p + state.rivals.a.speed * dt);
  state.rivals.b.p = Math.min(1, state.rivals.b.p + state.rivals.b.speed * dt);

  // 총알 발사 (플레이어 위치에서 위로)
  state.fireTimer -= dt;
  if (state.fireTimer <= 0) {
    state.fireTimer = state.fireInterval;
    state.bullets.push({ lane: state.currentLane, y: state.bottomLine - 10, count: 1, dmg: 1, nextRow: ROWS - 1 });
  }

  trySpawnEnemies(dt);

  // 총알 이동 (위로)
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.y -= (state.bottomLine - state.topLine) / 0.5 * dt;
    while (b.nextRow >= 0 && b.y <= state.rowY[b.nextRow]) {
      applyRow(b, b.nextRow);
      b.nextRow--;
    }
    if (b.y <= state.topLine - 20 || b.count <= 0) {
      state.bullets.splice(i, 1);
    }
  }

  // 적 이동 (아래로)
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    const spd = e.kind === "boss" ? state.bossSpeed : state.mobSpeed;
    e.y += spd * dt;
    if (e.y >= state.bottomLine) {
      if (e.kind === "boss") {
        state.enemies.splice(i, 1);
        endBattle(false);
        return;
      } else {
        state.lives -= 1;
        updateHud();
        spawnFloatText(laneCenterX(e.lane), state.bottomLine - 10, "-1 ❤️", "#ff5d6c", true);
        state.enemies.splice(i, 1);
        if (state.lives <= 0) {
          endBattle(false);
          return;
        }
      }
    }
  }

  // 충돌 처리: 같은 레인에서 총알이 적과 만나면 데미지
  const hitRadius = 20;
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    for (const b of state.bullets) {
      if (b.lane !== e.lane || b.count <= 0) continue;
      if (Math.abs(b.y - e.y) > hitRadius) continue;
      const dmg = Math.min(b.count * b.dmg, e.hp);
      const bulletsUsed = Math.min(b.count, Math.ceil(dmg / b.dmg));
      e.hp -= dmg;
      b.count -= bulletsUsed;
      spawnParticle(laneCenterX(e.lane), e.y, e.kind === "boss" ? "255, 120, 140" : "255, 210, 100");
      if (e.hp <= 0) break;
    }
  }

  // 처치된 적 제거
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    if (e.hp <= 0) {
      state.totalKilled++;
      if (e.kind === "boss") {
        state.boss.hp = 0;
        state.enemies.splice(i, 1);
        endBattle(true);
        return;
      } else {
        state.enemies.splice(i, 1);
      }
    } else if (e.kind === "boss") {
      state.boss.hp = e.hp;
    }
  }

  updateRivals();
}

/* ===================== 렌더링 ===================== */
function drawBullet(x, y, count, dmg) {
  const r = Math.min(16, 5 + Math.log10(count + 1) * 4);
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
  const hue = Math.min(200, 170 + (dmg - 1) * 20);
  grad.addColorStop(0, `hsl(${hue}, 95%, 80%)`);
  grad.addColorStop(1, `hsl(${hue}, 90%, 55%)`);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.stroke();

  if (count > 1) {
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.strokeText(formatNum(count), x, y - r - 5);
    ctx.fillStyle = "#fff";
    ctx.fillText(formatNum(count), x, y - r - 5);
  }
}

function drawMob(x, y) {
  const r = 15;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(x - 4, y - 4, 3, x, y, r);
  grad.addColorStop(0, "#ff8b8b");
  grad.addColorStop(1, "#c22b3f");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#2a0a10";
  ctx.beginPath();
  ctx.arc(x - 4, y - 1, 2.2, 0, Math.PI * 2);
  ctx.arc(x + 4, y - 1, 2.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawBoss(x, y, hp, maxHp) {
  const r = 34;
  ctx.fillStyle = "#7a1f3d";
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.72;
    const px = x + Math.cos(ang) * rr;
    const py = y + Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffdc5e";
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.1, r * 0.14, 0, Math.PI * 2);
  ctx.arc(x + r * 0.3, y - r * 0.1, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a0a12";
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.1, r * 0.06, 0, Math.PI * 2);
  ctx.arc(x + r * 0.3, y - r * 0.1, r * 0.06, 0, Math.PI * 2);
  ctx.fill();

  const barW = 76, barH = 8, barX = x - barW / 2, barY = y - r - 16;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  roundRect(barX, barY, barW, barH, 4);
  ctx.fill();
  const pct = Math.max(0, hp / maxHp);
  const hpGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  hpGrad.addColorStop(0, "#ff5d6c");
  hpGrad.addColorStop(1, "#ffb15e");
  ctx.fillStyle = hpGrad;
  roundRect(barX, barY, barW * pct, barH, 4);
  ctx.fill();
}

function drawPlayer(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#5ec6ff";
  ctx.beginPath();
  ctx.moveTo(-16, 14);
  ctx.lineTo(0, -16);
  ctx.lineTo(16, 14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#0d3a57";
  ctx.beginPath();
  ctx.arc(0, 4, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGateSlot(r, l) {
  const laneWidth = state.W / LANES;
  const x0 = l * laneWidth + laneWidth * 0.08;
  const w = laneWidth * 0.84;
  const y0 = state.rowY[r] - state.rowGap * 0.36;
  const h = state.rowGap * 0.72;
  const cx = x0 + w / 2, cy = y0 + h / 2;

  const hazard = state.hazards[r] && state.hazards[r][l];
  const gate = state.gates[r] && state.gates[r][l];

  ctx.save();
  if (hazard) {
    ctx.fillStyle = "rgba(255, 93, 108, 0.18)";
    ctx.strokeStyle = "#ff5d6c";
    ctx.setLineDash([6, 5]);
    roundRect(x0, y0, w, h, 10);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "bold 20px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ff5d6c";
    ctx.fillText("☠", cx, cy);
  } else if (gate) {
    const def = GATE_TYPES[gate.type];
    const tier = def.tiers[gate.level];
    const grad = ctx.createLinearGradient(x0, y0, x0, y0 + h);
    grad.addColorStop(0, def.color);
    grad.addColorStop(1, def.dark);
    ctx.fillStyle = grad;
    roundRect(x0, y0, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(def.label(tier), cx, cy - 2);
    if (gate.level > 0) {
      ctx.font = "bold 9px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText("Lv." + (gate.level + 1), cx, cy + h * 0.32);
    }
  } else {
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.setLineDash([5, 5]);
    roundRect(x0, y0, w, h, 10);
    ctx.stroke();
    ctx.setLineDash([]);
    if (state.phase === "build") {
      ctx.font = "16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillText("+", cx, cy);
    }
  }
  ctx.restore();
}

function roundRect(x, y, w, h, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function draw() {
  const W = state.W, H = state.H;
  ctx.clearRect(0, 0, W, H);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0c1226");
  bg.addColorStop(1, "#060911");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const laneWidth = W / LANES;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= LANES; i++) {
    ctx.beginPath();
    ctx.moveTo(i * laneWidth, state.topLine - 20);
    ctx.lineTo(i * laneWidth, state.bottomLine + 20);
    ctx.stroke();
  }

  // 적 스폰 라인 표시
  ctx.strokeStyle = "rgba(255,93,108,0.35)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, state.topLine - 20);
  ctx.lineTo(W, state.topLine - 20);
  ctx.stroke();
  ctx.setLineDash([]);

  for (let r = 0; r < ROWS; r++) {
    for (let l = 0; l < LANES; l++) drawGateSlot(r, l);
  }

  // 플레이어 저지선
  ctx.strokeStyle = "rgba(94,198,255,0.35)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, state.bottomLine + 16);
  ctx.lineTo(W, state.bottomLine + 16);
  ctx.stroke();
  ctx.setLineDash([]);

  // particles
  for (const p of state.particles) {
    const a = p.life / p.maxLife;
    ctx.fillStyle = `rgba(${p.color}, ${a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4 + (1 - a) * 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // 적 그리기
  for (const e of state.enemies) {
    if (e.kind === "boss") drawBoss(laneCenterX(e.lane), e.y, e.hp, e.maxHp);
    else drawMob(laneCenterX(e.lane), e.y);
  }

  // 총알 그리기
  for (const b of state.bullets) {
    drawBullet(laneCenterX(b.lane), b.y, b.count, b.dmg);
  }

  // 플레이어
  drawPlayer(laneCenterX(state.currentLane), state.bottomLine + 16);

  // float texts
  for (const f of state.floatTexts) {
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.font = (f.big ? "bold 16px " : "bold 13px ") + "system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }

  if (state.phase === "battle") {
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.textAlign = "center";
    const label = state.bossSpawned
      ? (state.bossAlive ? "보스 접근 중!" : "")
      : `적 ${state.mobsSpawned}/${state.mobsToSpawn}`;
    ctx.fillText(label, W / 2, state.topLine - 28);
  }
}

/* ===================== 루프 ===================== */
function loop(now) {
  let dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (state.phase === "battle") dt *= state.speedMultiplier;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

/* ===================== 초기화 ===================== */
window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", () => setTimeout(resizeCanvas, 200));

function init() {
  resizeCanvas();
  requestAnimationFrame(() => { resizeCanvas(); });
  updateHud();
  openDiffModal();
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

init();
