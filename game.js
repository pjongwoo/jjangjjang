"use strict";

/* ===================== 설정값 ===================== */
const LANES = 5;
const ROWS = 6;
const MAX_COUNT = 999999999;
const BASE_BOSS_HP = 260;
const BOSS_GROWTH = 1.32;
const DPS_CONST = 1.0;

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
    desc: (t) => `통과하는 무리 수를 ×${t.factor} 로 만듭니다`,
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
    desc: (t) => `무리에 몹 ${t.amount}마리를 추가합니다`,
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
    desc: (t) => `무리의 공격력을 ×${t.factor} 로 만듭니다`,
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
    desc: (t) => `무리가 지날 때마다 코인 ${t.amount}개 획득`,
    label: (t) => `$${t.amount}`,
  },
};

/* ===================== 상태 ===================== */
const state = {
  W: 480, H: 800,
  laneCenters: [], rowY: [], trackTop: 0, trackBottom: 0, spawnY: 0, bossTop: 0, bossBottom: 0,
  coins: 100,
  wave: 1,
  gates: {},   // gates[row][lane] = { type, level, spent }
  hazards: {}, // hazards[row][lane] = true
  packets: [],
  floatTexts: [],
  particles: [],
  boss: { hp: BASE_BOSS_HP, maxHp: BASE_BOSS_HP },
  totalArmyPower: 0,
  currentLane: Math.floor(LANES / 2),
  phase: "build", // build | battle | victory | defeat
  spawnedCount: 0,
  spawnTarget: 12,
  spawnInterval: 0.4,
  spawnTimer: 0,
  battleElapsed: 0,
  battleTimeLimit: 22,
  speedMultiplier: 1,
  rivals: { a: { p: 0, speed: 0 }, b: { p: 0, speed: 0 } },
  shopTarget: null,
};

/* ===================== DOM refs ===================== */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const coinValueEl = document.getElementById("coinValue");
const waveValueEl = document.getElementById("waveValue");
const speedBtn = document.getElementById("speedBtn");
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

function spawnHitParticle(lane) {
  state.particles.push({ x: laneCenterX(lane) + (Math.random() * 20 - 10), y: state.bossTop + 6, life: 0.4, maxLife: 0.4 });
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

  state.trackTop = H * 0.13;
  state.bossBottom = H - 6;
  state.bossTop = H * 0.82;
  state.trackBottom = state.bossTop;
  state.spawnY = state.trackTop - 14;

  const rowGap = (state.trackBottom - state.trackTop) / ROWS;
  state.rowGap = rowGap;
  state.rowY = [];
  for (let r = 0; r < ROWS; r++) state.rowY.push(state.trackTop + rowGap * (r + 0.5));
}

/* ===================== 웨이브 설정 ===================== */
function setupWave(newHazards) {
  state.phase = "build";
  state.boss.maxHp = Math.round(BASE_BOSS_HP * Math.pow(BOSS_GROWTH, state.wave - 1));
  state.boss.hp = state.boss.maxHp;
  state.packets = [];
  state.floatTexts = [];
  state.particles = [];
  state.totalArmyPower = 0;
  state.spawnedCount = 0;
  state.spawnTarget = Math.min(46, 12 + state.wave * 2);
  state.spawnInterval = Math.max(0.16, 0.42 - state.wave * 0.008);
  state.spawnTimer = 0;
  state.battleElapsed = 0;
  state.battleTimeLimit = 20 + state.wave * 0.6;
  state.currentLane = Math.floor(LANES / 2);
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
    const timeBonus = Math.max(0, Math.round((state.battleTimeLimit - state.battleElapsed) * 3));
    const reward = base + timeBonus;
    state.coins += reward;
    updateHud();
    showBanner("승리! 🎉", `보스를 처치했습니다! 코인 +${formatNum(reward)}`, "다음 웨이브", () => {
      state.wave += 1;
      setupWave(true);
    });
  } else {
    state.phase = "defeat";
    showBanner("실패...", "제한 시간 안에 보스를 처치하지 못했습니다. 게이트를 보강해보세요!", "다시 도전", () => {
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
    info.innerHTML = `<div class="shop-icon">☠</div><div class="shop-info"><div class="shop-name">위험 지대</div><div class="shop-desc">이 칸을 지나가면 무리 수가 절반으로 줄어듭니다. 레인을 옮겨 피하세요!</div></div>`;
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
  if (y < state.trackTop || y > state.trackBottom) return;
  const l = Math.floor(x / (state.W / LANES));
  const r = Math.floor((y - state.trackTop) / state.rowGap);
  if (l < 0 || l >= LANES || r < 0 || r >= ROWS) return;
  openShop(r, l);
});

/* ===================== HUD ===================== */
function updateHud() {
  coinValueEl.textContent = formatNum(state.coins);
  waveValueEl.textContent = state.wave;
}

function updateRivals() {
  const youPct = Math.min(100, Math.round((1 - state.boss.hp / state.boss.maxHp) * 100));
  youFill.style.width = youPct + "%";
  botAFill.style.width = Math.min(100, Math.round(state.rivals.a.p * 100)) + "%";
  botBFill.style.width = Math.min(100, Math.round(state.rivals.b.p * 100)) + "%";
}

/* ===================== 게임 루프 ===================== */
let lastTime = performance.now();

function applyRow(packet, row) {
  const l = packet.lane;
  if (state.hazards[row] && state.hazards[row][l]) {
    packet.count = Math.max(1, Math.floor(packet.count / 2));
    spawnFloatText(laneCenterX(l), state.rowY[row], "-50%", "#ff5d6c");
    return;
  }
  const g = state.gates[row] && state.gates[row][l];
  if (!g) return;
  const def = GATE_TYPES[g.type];
  const tier = def.tiers[g.level];
  switch (g.type) {
    case "mult":
      packet.count = Math.min(MAX_COUNT, Math.round(packet.count * tier.factor));
      spawnFloatText(laneCenterX(l), state.rowY[row], def.label(tier), def.color, true);
      break;
    case "add":
      packet.count = Math.min(MAX_COUNT, packet.count + tier.amount);
      spawnFloatText(laneCenterX(l), state.rowY[row], def.label(tier), def.color);
      break;
    case "power":
      packet.power *= tier.factor;
      spawnFloatText(laneCenterX(l), state.rowY[row], def.label(tier), def.color);
      break;
    case "coin":
      state.coins += tier.amount;
      updateHud();
      spawnFloatText(laneCenterX(l), state.rowY[row], "🪙+" + tier.amount, def.color);
      break;
  }
}

function update(dt) {
  // float texts & particles always animate
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

  state.battleElapsed += dt;

  state.rivals.a.p = Math.min(1, state.rivals.a.p + state.rivals.a.speed * dt);
  state.rivals.b.p = Math.min(1, state.rivals.b.p + state.rivals.b.speed * dt);

  if (state.spawnedCount < state.spawnTarget) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = state.spawnInterval;
      state.spawnedCount++;
      state.packets.push({ lane: state.currentLane, y: state.spawnY, count: 1, power: 1, nextRow: 0 });
    }
  }

  const speed = (state.trackBottom - state.spawnY) / 2.4;

  for (let i = state.packets.length - 1; i >= 0; i--) {
    const p = state.packets[i];
    p.y += speed * dt;
    while (p.nextRow < ROWS && p.y >= state.rowY[p.nextRow]) {
      applyRow(p, p.nextRow);
      p.nextRow++;
    }
    if (p.y >= state.trackBottom) {
      state.totalArmyPower += p.count * p.power;
      spawnHitParticle(p.lane);
      state.packets.splice(i, 1);
    }
  }

  if (state.totalArmyPower > 0 && state.boss.hp > 0) {
    state.boss.hp -= state.totalArmyPower * DPS_CONST * dt;
    if (state.boss.hp <= 0) {
      state.boss.hp = 0;
      endBattle(true);
      return;
    }
  }

  if (state.battleElapsed >= state.battleTimeLimit && state.boss.hp > 0) {
    endBattle(false);
    return;
  }

  updateRivals();
}

/* ===================== 렌더링 ===================== */
function drawBlob(x, y, count, power) {
  const r = Math.min(26, 10 + Math.log10(count + 1) * 6);
  const hue = Math.max(190, 260 - (power - 1) * 40);
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
  grad.addColorStop(0, `hsl(${hue}, 90%, 72%)`);
  grad.addColorStop(1, `hsl(${hue}, 80%, 48%)`);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(x - r * 0.32, y - r * 0.05, r * 0.16, 0, Math.PI * 2);
  ctx.arc(x + r * 0.32, y - r * 0.05, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#12213a";
  ctx.beginPath();
  ctx.arc(x - r * 0.32, y - r * 0.02, r * 0.08, 0, Math.PI * 2);
  ctx.arc(x + r * 0.32, y - r * 0.02, r * 0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "bold 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.strokeText(formatNum(count), x, y - r - 6);
  ctx.fillStyle = "#fff";
  ctx.fillText(formatNum(count), x, y - r - 6);
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
  for (let i = 0; i < LANES; i++) {
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.0)";
    ctx.fillRect(i * laneWidth, state.trackTop, laneWidth, state.trackBottom - state.trackTop);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= LANES; i++) {
    ctx.beginPath();
    ctx.moveTo(i * laneWidth, state.trackTop);
    ctx.lineTo(i * laneWidth, state.trackBottom);
    ctx.stroke();
  }

  for (let r = 0; r < ROWS; r++) {
    for (let l = 0; l < LANES; l++) drawGateSlot(r, l);
  }

  // spawn indicator
  const sx = laneCenterX(state.currentLane);
  ctx.fillStyle = "#5ec6ff";
  ctx.beginPath();
  ctx.moveTo(sx - 9, state.spawnY - 10);
  ctx.lineTo(sx + 9, state.spawnY - 10);
  ctx.lineTo(sx, state.spawnY);
  ctx.closePath();
  ctx.fill();

  // boss zone
  const bossH = state.bossBottom - state.bossTop;
  const bossGrad = ctx.createLinearGradient(0, state.bossTop, 0, state.bossBottom);
  bossGrad.addColorStop(0, "rgba(120, 20, 40, 0.35)");
  bossGrad.addColorStop(1, "rgba(60, 10, 20, 0.15)");
  ctx.fillStyle = bossGrad;
  ctx.fillRect(0, state.bossTop, W, bossH);

  const bossCx = W / 2, bossCy = state.bossTop + bossH * 0.62;
  const bossR = Math.min(46, bossH * 0.55);
  ctx.fillStyle = "#7a1f3d";
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const rr = i % 2 === 0 ? bossR : bossR * 0.72;
    const px = bossCx + Math.cos(ang) * rr;
    const py = bossCy + Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffdc5e";
  ctx.beginPath();
  ctx.arc(bossCx - bossR * 0.3, bossCy - bossR * 0.1, bossR * 0.14, 0, Math.PI * 2);
  ctx.arc(bossCx + bossR * 0.3, bossCy - bossR * 0.1, bossR * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a0a12";
  ctx.beginPath();
  ctx.arc(bossCx - bossR * 0.3, bossCy - bossR * 0.1, bossR * 0.06, 0, Math.PI * 2);
  ctx.arc(bossCx + bossR * 0.3, bossCy - bossR * 0.1, bossR * 0.06, 0, Math.PI * 2);
  ctx.fill();

  // boss hp bar
  const barW = Math.min(260, W * 0.7), barX = W / 2 - barW / 2, barY = state.bossTop + 6, barH = 12;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  roundRect(barX, barY, barW, barH, 6);
  ctx.fill();
  const pct = Math.max(0, state.boss.hp / state.boss.maxHp);
  const hpGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  hpGrad.addColorStop(0, "#ff5d6c");
  hpGrad.addColorStop(1, "#ffb15e");
  ctx.fillStyle = hpGrad;
  roundRect(barX, barY, barW * pct, barH, 6);
  ctx.fill();
  ctx.font = "bold 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.fillText(`BOSS  ${formatNum(state.boss.hp)} / ${formatNum(state.boss.maxHp)}`, W / 2, barY + barH + 12);

  if (state.phase === "battle") {
    const remain = Math.max(0, state.battleTimeLimit - state.battleElapsed);
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.fillStyle = remain < 5 ? "#ff5d6c" : "rgba(255,255,255,0.75)";
    ctx.fillText(`남은 시간 ${remain.toFixed(1)}s`, W / 2, barY - 6);
  }

  // particles
  for (const p of state.particles) {
    const a = p.life / p.maxLife;
    ctx.fillStyle = `rgba(255, 210, 100, ${a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4 + (1 - a) * 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // packets
  for (const p of state.packets) {
    drawBlob(laneCenterX(p.lane), p.y, p.count, p.power);
  }

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
  setupWave(true);
  updateHud();
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

init();
