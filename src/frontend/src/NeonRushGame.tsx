import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useActor } from "./hooks/useActor";

// ===========================
// TYPES
// ===========================
type GameState = "start" | "playing" | "gameover";
type ObstacleType = "HIGH" | "LOW" | "LANE";
type PowerType = "SHIELD" | "MAGNET" | "SPEED";
type CollectType = "COIN" | PowerType;

interface Obstacle {
  id: number;
  lane: number;
  type: ObstacleType;
  z: number;
  checked: boolean;
}

interface Collectible {
  id: number;
  lane: number;
  type: CollectType;
  z: number;
  collected: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface GameData {
  playerLane: number;
  playerVisualX: number;
  jumpY: number;
  jumpVel: number;
  isJumping: boolean;
  slideFrames: number;
  obstacles: Obstacle[];
  collectibles: Collectible[];
  particles: Particle[];
  score: number;
  coins: number;
  lives: number;
  speed: number;
  frame: number;
  invincible: number;
  shield: number;
  magnet: number;
  spawnCooldown: number;
  gridOffset: number;
  nextId: number;
}

interface ScoreRow {
  username: string;
  score: number;
}

// ===========================
// CONSTANTS
// ===========================
const CW = 800;
const CH = 500;
const VPX = CW / 2;
const VPY = CH * 0.27;
const GROUND_Y = CH * 0.8;
const LANE_BOTTOM_X = [CW * 0.21, CW * 0.5, CW * 0.79];

// Canvas colors (literal — CSS vars not available in Canvas API)
const COL = {
  bg1: "#04040d",
  bg2: "#0c0525",
  floorA: "#080620",
  floorB: "#0a0320",
  laneEdge: "rgba(0, 238, 255, 0.35)",
  laneGlow: "#00ffff",
  player: "#00eeff",
  playerGlow: "#00ffff",
  obstacle: "#ff0077",
  obstacleGlow: "#ff44aa",
  coin: "#ffd700",
  coinGlow: "#ffaa00",
  shield: "#00ff88",
  shieldGlow: "#00ff88",
  magnet: "#ff00cc",
  magnetGlow: "#ff44dd",
  boost: "#ff8800",
  boostGlow: "#ffaa00",
  hud: "#00eeff",
  heart: "#ff2255",
  heartEmpty: "#280010",
  horizon: "rgba(100, 0, 200, 0.8)",
};

const JUMP_V = -22;
const GRAVITY = 1.5;
const SLIDE_DUR = 34;
const INVINC_DUR = 90;
const BASE_SPEED = 0.013;
const SPEED_INC = 0.0000038;
const MAX_SPEED = 0.038;
const LANE_LERP = 0.2;

// ===========================
// GEOMETRY HELPERS
// ===========================
function lx(lane: number, z: number): number {
  return VPX + (LANE_BOTTOM_X[lane] - VPX) * z;
}
function iy(z: number): number {
  return VPY + (GROUND_Y - VPY) * z;
}
function sz(z: number): number {
  return Math.max(0.05, z * 0.93 + 0.05);
}

// ===========================
// PRE-GENERATED STATIC SCENE
// ===========================
const makeRand = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
const rng = makeRand(0xdeadbeef);

const STARS = Array.from({ length: 90 }, () => ({
  x: rng() * CW,
  y: rng() * VPY * 0.95,
  radius: rng() * 1.6 + 0.3,
  alpha: rng() * 0.65 + 0.25,
}));

type BuildingWin = { wx: number; wy: number; cyan: boolean };
type Building = { x: number; w: number; h: number; wins: BuildingWin[] };

const BUILDINGS: Building[] = (() => {
  const blds: Building[] = [];
  const addSide = (startX: number, endX: number) => {
    let bx = startX;
    while (bx < endX) {
      const w = 22 + rng() * 48;
      const h = 28 + rng() * 90;
      const top = VPY - h;
      const wins: BuildingWin[] = [];
      for (let wx = bx + 4; wx < bx + w - 8; wx += 9) {
        for (let wy = top + 6; wy < VPY - 4; wy += 11) {
          wins.push({ wx, wy, cyan: rng() < 0.48 });
        }
      }
      blds.push({ x: bx, w, h, wins });
      bx += w + rng() * 8;
    }
  };
  addSide(0, CW * 0.34);
  addSide(CW * 0.66, CW + 20);
  return blds;
})();

// ===========================
// GAME STATE INIT
// ===========================
function initGame(): GameData {
  return {
    playerLane: 1,
    playerVisualX: LANE_BOTTOM_X[1],
    jumpY: 0,
    jumpVel: 0,
    isJumping: false,
    slideFrames: 0,
    obstacles: [],
    collectibles: [],
    particles: [],
    score: 0,
    coins: 0,
    lives: 3,
    speed: BASE_SPEED,
    frame: 0,
    invincible: 0,
    shield: 0,
    magnet: 0,
    spawnCooldown: 80,
    gridOffset: 0,
    nextId: 0,
  };
}

// ===========================
// SPAWN LOGIC
// ===========================
function spawnWave(g: GameData): void {
  const rnd = Math.random();
  const nextId = () => g.nextId++;

  if (rnd < 0.52) {
    const obsLane = Math.floor(Math.random() * 3);
    const types: ObstacleType[] = ["HIGH", "LOW", "LANE"];
    const obsType = types[Math.floor(Math.random() * 3)];
    g.obstacles.push({
      id: nextId(),
      lane: obsLane,
      type: obsType,
      z: 0,
      checked: false,
    });
    for (let l = 0; l < 3; l++) {
      if (l !== obsLane) {
        const cnt = 2 + Math.floor(Math.random() * 3);
        for (let zi = 0; zi < cnt; zi++) {
          g.collectibles.push({
            id: nextId(),
            lane: l,
            type: "COIN",
            z: -zi * 0.07,
            collected: false,
          });
        }
      }
    }
  } else if (rnd < 0.76) {
    const lane = Math.floor(Math.random() * 3);
    const cnt = 4 + Math.floor(Math.random() * 4);
    for (let zi = 0; zi < cnt; zi++) {
      g.collectibles.push({
        id: nextId(),
        lane,
        type: "COIN",
        z: -zi * 0.065,
        collected: false,
      });
    }
  } else if (rnd < 0.9) {
    const freeLane = Math.floor(Math.random() * 3);
    const types: ObstacleType[] = ["HIGH", "LOW", "LANE"];
    for (let l = 0; l < 3; l++) {
      if (l !== freeLane) {
        g.obstacles.push({
          id: nextId(),
          lane: l,
          type: types[Math.floor(Math.random() * 3)],
          z: 0,
          checked: false,
        });
      }
    }
    for (let zi = 0; zi < 3; zi++) {
      g.collectibles.push({
        id: nextId(),
        lane: freeLane,
        type: "COIN",
        z: -zi * 0.07,
        collected: false,
      });
    }
  } else {
    const ptypes: PowerType[] = ["SHIELD", "MAGNET", "SPEED"];
    const pt = ptypes[Math.floor(Math.random() * 3)];
    g.collectibles.push({
      id: nextId(),
      lane: Math.floor(Math.random() * 3),
      type: pt,
      z: 0,
      collected: false,
    });
  }
}

// ===========================
// UPDATE LOGIC
// ===========================
function updateGame(g: GameData): boolean {
  g.frame++;
  g.speed = Math.min(MAX_SPEED, g.speed + SPEED_INC);
  g.gridOffset = (g.gridOffset + g.speed * 0.38) % 1;
  g.score += g.speed * 95;

  const tgt = lx(g.playerLane, 1);
  g.playerVisualX += (tgt - g.playerVisualX) * LANE_LERP;

  if (g.isJumping) {
    g.jumpVel += GRAVITY;
    g.jumpY += g.jumpVel;
    if (g.jumpY >= 0) {
      g.jumpY = 0;
      g.jumpVel = 0;
      g.isJumping = false;
    }
  }

  if (g.slideFrames > 0) g.slideFrames--;
  if (g.invincible > 0) g.invincible--;
  if (g.shield > 0) g.shield--;
  if (g.magnet > 0) g.magnet--;

  g.spawnCooldown--;
  if (g.spawnCooldown <= 0) {
    spawnWave(g);
    g.spawnCooldown = Math.max(42, Math.round(108 - g.frame * 0.028));
  }

  g.obstacles = g.obstacles.filter((o) => {
    o.z += g.speed;
    if (o.z > 1.12) return false;
    if (!o.checked && o.z >= 0.88) {
      o.checked = true;
      if (o.lane === g.playerLane) {
        let hit = false;
        if (o.type === "HIGH") hit = g.jumpY > -38;
        else if (o.type === "LOW") hit = g.slideFrames === 0;
        else hit = true;
        if (hit && g.invincible === 0 && g.shield === 0) {
          g.lives--;
          g.invincible = INVINC_DUR;
          const px = g.playerVisualX;
          const py = GROUND_Y + g.jumpY;
          for (let i = 0; i < 14; i++) {
            const ang = (Math.PI * 2 * i) / 14;
            const spd = 3 + Math.random() * 5;
            g.particles.push({
              x: px,
              y: py,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd - 2,
              life: 28 + Math.floor(Math.random() * 22),
              maxLife: 50,
              color: COL.obstacle,
              size: 3 + Math.random() * 3,
            });
          }
        }
      }
    }
    return true;
  });

  g.collectibles = g.collectibles.filter((c) => {
    c.z += g.speed;
    if (c.z > 1.12 || c.collected) return false;
    if (c.z <= 0) return true;
    const cx = lx(c.lane, c.z);
    const cy = iy(c.z);
    const s = sz(c.z);
    const threshold = c.type === "COIN" && g.magnet > 0 ? 110 : 28 * s;
    const dx = cx - g.playerVisualX;
    const dy = cy - (GROUND_Y + g.jumpY);
    if (dx * dx + dy * dy < threshold * threshold) {
      c.collected = true;
      if (c.type === "COIN") {
        g.coins++;
        g.score += 10;
        g.particles.push({
          x: cx,
          y: cy,
          vx: (Math.random() - 0.5) * 5,
          vy: -3 - Math.random() * 3,
          life: 22,
          maxLife: 22,
          color: COL.coin,
          size: 5,
        });
      } else if (c.type === "SHIELD") {
        g.shield = 300;
      } else if (c.type === "MAGNET") {
        g.magnet = 360;
      } else if (c.type === "SPEED") {
        g.score += 250;
        g.speed = Math.min(MAX_SPEED, g.speed * 1.25);
      }
    }
    return true;
  });

  g.particles = g.particles.filter((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.18;
    p.life--;
    return p.life > 0;
  });

  return g.lives > 0;
}

// ===========================
// DRAW FUNCTIONS
// ===========================
function drawBackground(
  ctx: CanvasRenderingContext2D,
  gridOffset: number,
): void {
  const sky = ctx.createLinearGradient(0, 0, 0, VPY + 40);
  sky.addColorStop(0, COL.bg1);
  sky.addColorStop(1, COL.bg2);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CW, CH);

  for (const s of STARS) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200, 180, 255, ${s.alpha})`;
    ctx.fill();
  }

  for (const b of BUILDINGS) {
    const top = VPY - b.h;
    ctx.fillStyle = "#05030e";
    ctx.fillRect(b.x, top, b.w, b.h);
    for (const w of b.wins) {
      ctx.fillStyle = w.cyan
        ? "rgba(0, 200, 255, 0.55)"
        : "rgba(140, 0, 255, 0.45)";
      ctx.fillRect(w.wx, w.wy, 5, 7);
    }
  }

  ctx.save();
  ctx.shadowBlur = 28;
  ctx.shadowColor = "#7700ff";
  ctx.strokeStyle = COL.horizon;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, VPY);
  ctx.lineTo(CW, VPY);
  ctx.stroke();
  ctx.restore();

  const floor = ctx.createLinearGradient(0, VPY, 0, CH);
  floor.addColorStop(0, COL.floorA);
  floor.addColorStop(1, COL.floorB);
  ctx.fillStyle = floor;
  ctx.fillRect(0, VPY, CW, CH - VPY);

  for (let i = 0; i < 20; i++) {
    const t = (i / 20 + gridOffset) % 1;
    const y = VPY + (CH - VPY) * (t * t);
    const alpha = t * 0.65 + 0.04;
    ctx.strokeStyle = `rgba(38, 8, 95, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CW, y);
    ctx.stroke();
  }

  for (let i = 0; i <= 14; i++) {
    const bx = (i / 14) * CW;
    ctx.strokeStyle = "rgba(22, 5, 65, 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(VPX, VPY);
    ctx.lineTo(bx, CH);
    ctx.stroke();
  }

  const laneEdgesX = [CW * 0.065, CW * 0.355, CW * 0.645, CW * 0.935];
  for (const bx of laneEdgesX) {
    ctx.save();
    ctx.shadowBlur = 6;
    ctx.shadowColor = COL.laneGlow;
    ctx.strokeStyle = COL.laneEdge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(VPX, VPY);
    ctx.lineTo(bx, CH);
    ctx.stroke();
    ctx.restore();
  }
}

function drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle): void {
  if (o.z <= 0.02) return;
  const x = lx(o.lane, o.z);
  const y = iy(o.z);
  const s = sz(o.z);
  const w = 52 * s;
  const h = 72 * s;

  ctx.save();
  ctx.shadowBlur = 16 * s;
  ctx.shadowColor = COL.obstacleGlow;
  ctx.fillStyle = "rgba(255, 0, 100, 0.15)";
  ctx.strokeStyle = COL.obstacle;
  ctx.lineWidth = 2;

  if (o.type === "HIGH") {
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.strokeRect(x - w / 2, y - h, w, h);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#ff88bb";
    ctx.beginPath();
    ctx.moveTo(x - 9 * s, y - h - 14 * s);
    ctx.lineTo(x, y - h - 22 * s);
    ctx.lineTo(x + 9 * s, y - h - 14 * s);
    ctx.stroke();
  } else if (o.type === "LOW") {
    const bh = h * 0.28;
    const bw = w * 1.3;
    ctx.fillRect(x - bw / 2, y - bh, bw, bh);
    ctx.strokeRect(x - bw / 2, y - bh, bw, bh);
    ctx.setLineDash([3 * s, 3 * s]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#ff88bb";
    ctx.beginPath();
    ctx.moveTo(x - bw / 2, y - bh * 0.5);
    ctx.lineTo(x + bw / 2, y - bh * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.fillRect(x - w * 0.72, y - h, w * 1.44, h);
    ctx.strokeRect(x - w * 0.72, y - h, w * 1.44, h);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.32, y - h * 0.72);
    ctx.lineTo(x + w * 0.32, y - h * 0.28);
    ctx.moveTo(x + w * 0.32, y - h * 0.72);
    ctx.lineTo(x - w * 0.32, y - h * 0.28);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCollectible(
  ctx: CanvasRenderingContext2D,
  c: Collectible,
  frame: number,
): void {
  if (c.z <= 0.02 || c.collected) return;
  const x = lx(c.lane, c.z);
  const y = iy(c.z);
  const s = sz(c.z);
  const rv = 8 * s;

  ctx.save();
  if (c.type === "COIN") {
    const pulse = Math.sin(frame * 0.12 + c.id * 0.9) * 0.25 + 0.75;
    ctx.shadowBlur = 10 * s;
    ctx.shadowColor = COL.coinGlow;
    ctx.fillStyle = COL.coin;
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(x, y - rv, rv, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 248, 180, 0.8)";
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    let col = COL.shield;
    let glowCol = COL.shieldGlow;
    let label = "S";
    if (c.type === "MAGNET") {
      col = COL.magnet;
      glowCol = COL.magnetGlow;
      label = "M";
    }
    if (c.type === "SPEED") {
      col = COL.boost;
      glowCol = COL.boostGlow;
      label = "⚡";
    }
    const spin = frame * 0.04 + c.id;
    ctx.shadowBlur = 18 * s;
    ctx.shadowColor = glowCol;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.save();
    ctx.translate(x, y - rv * 1.3);
    ctx.rotate(spin);
    const rr = rv * 1.4;
    ctx.beginPath();
    ctx.moveTo(rr, 0);
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(
        rr * Math.cos((i * Math.PI * 2) / 6),
        rr * Math.sin((i * Math.PI * 2) / 6),
      );
    }
    ctx.closePath();
    ctx.fillStyle = `${col}22`;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = col;
    ctx.font = `bold ${Math.max(8, Math.round(11 * s))}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y - rv * 1.3);
  }
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, g: GameData): void {
  const px = g.playerVisualX;
  const py = GROUND_Y + g.jumpY;
  const isSliding = g.slideFrames > 0;

  if (g.invincible > 0 && g.shield === 0 && Math.floor(g.frame / 4) % 2 === 1)
    return;

  ctx.save();

  if (g.shield > 0) {
    const shieldPulse = Math.sin(g.frame * 0.15) * 5;
    ctx.shadowBlur = 28 + shieldPulse;
    ctx.shadowColor = COL.shieldGlow;
    ctx.strokeStyle = `${COL.shield}88`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(px, py - 25, 38 + shieldPulse * 0.3, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (g.magnet > 0 && Math.floor(g.frame / 6) % 2 === 0) {
    ctx.strokeStyle = `${COL.magnet}44`;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(px, py - 20, 55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.shadowBlur = 22;
  ctx.shadowColor = COL.playerGlow;
  ctx.fillStyle = COL.player;

  if (isSliding) {
    ctx.beginPath();
    ctx.ellipse(px, py - 10, 24, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.ellipse(px - 18, py - 10, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.ellipse(px - 32, py - 10, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const legSwing = Math.sin(g.frame * 0.22) * 9;
    ctx.fillRect(px - 9, py - 16, 8, 17 + legSwing);
    ctx.fillRect(px + 1, py - 16, 8, 17 - legSwing);
    ctx.fillRect(px - 11, py - 44, 22, 28);
    ctx.beginPath();
    ctx.arc(px, py - 51, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(px + 4, py - 52, 3, 0, Math.PI * 2);
    ctx.fill();
    if (g.isJumping && g.jumpY < -20) {
      const trailA = Math.min(1, Math.abs(g.jumpY) / 100);
      for (let ti = 1; ti <= 5; ti++) {
        ctx.globalAlpha = trailA * (0.25 - ti * 0.04);
        ctx.fillStyle = COL.player;
        ctx.beginPath();
        ctx.arc(px, py + 14 * ti, Math.max(1, 11 - ti * 2), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
): void {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 8;
    ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, p.size * alpha), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawHUD(ctx: CanvasRenderingContext2D, g: GameData): void {
  ctx.save();
  ctx.font = "bold 15px 'JetBrains Mono', monospace";
  ctx.textBaseline = "top";

  ctx.shadowBlur = 10;
  ctx.shadowColor = COL.hud;
  ctx.fillStyle = COL.hud;
  ctx.textAlign = "left";
  ctx.fillText(`${Math.floor(g.score).toString().padStart(8, "0")}`, 16, 14);

  ctx.font = "12px 'JetBrains Mono', monospace";
  ctx.fillStyle = COL.coin;
  ctx.shadowColor = COL.coinGlow;
  ctx.fillText(`◈ ${g.coins}`, 16, 36);

  const pct = Math.round(
    ((g.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED)) * 100,
  );
  ctx.fillStyle = "rgba(0, 238, 255, 0.45)";
  ctx.shadowBlur = 0;
  ctx.textAlign = "right";
  ctx.fillText(`SPD ${pct}%`, CW - 14, 36);

  for (let i = 2; i >= 0; i--) {
    const alive = i < g.lives;
    ctx.font = "16px serif";
    ctx.fillStyle = alive ? COL.heart : COL.heartEmpty;
    ctx.shadowColor = alive ? COL.heart : "transparent";
    ctx.shadowBlur = alive ? 10 : 0;
    ctx.fillText("♥", CW - 16 - (2 - i) * 22, 12);
  }

  let pRow = 0;
  if (g.shield > 0) {
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.fillStyle = COL.shield;
    ctx.shadowColor = COL.shieldGlow;
    ctx.shadowBlur = 8;
    ctx.textAlign = "center";
    ctx.fillText(
      `◈ SHIELD ${Math.ceil(g.shield / 60)}s`,
      CW / 2 + pRow * 110 - 55,
      14,
    );
    pRow++;
  }
  if (g.magnet > 0) {
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.fillStyle = COL.magnet;
    ctx.shadowColor = COL.magnetGlow;
    ctx.shadowBlur = 8;
    ctx.textAlign = "center";
    ctx.fillText(
      `⊕ MAGNET ${Math.ceil(g.magnet / 60)}s`,
      CW / 2 + pRow * 110 - 55,
      14,
    );
  }

  ctx.restore();
}

function drawScene(ctx: CanvasRenderingContext2D, g: GameData): void {
  drawBackground(ctx, g.gridOffset);

  type SortItem = { z: number; kind: "obs" | "coll"; idx: number };
  const items: SortItem[] = [
    ...g.obstacles.map((_, idx) => ({
      z: g.obstacles[idx].z,
      kind: "obs" as const,
      idx,
    })),
    ...g.collectibles.map((_, idx) => ({
      z: g.collectibles[idx].z,
      kind: "coll" as const,
      idx,
    })),
  ];
  items.sort((a, b) => a.z - b.z);

  for (const item of items) {
    if (item.kind === "obs") drawObstacle(ctx, g.obstacles[item.idx]);
    else drawCollectible(ctx, g.collectibles[item.idx], g.frame);
  }

  drawPlayer(ctx, g);
  drawParticles(ctx, g.particles);
  drawHUD(ctx, g);
}

// ===========================
// COMPONENT
// ===========================
export default function NeonRushGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gRef = useRef<GameData>(initGame());
  const gsRef = useRef<GameState>("start");
  const rafRef = useRef<number | null>(null);
  const bgFrameRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const { actor } = useActor();

  const [gameState, setGameState] = useState<GameState>("start");
  const [finalScore, setFinalScore] = useState(0);
  const [finalCoins, setFinalCoins] = useState(0);
  const [username, setUsername] = useState("");
  const [topScores, setTopScores] = useState<ScoreRow[]>([]);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");

  const changeState = useCallback((s: GameState) => {
    gsRef.current = s;
    setGameState(s);
  }, []);

  const fetchScores = useCallback(async () => {
    if (!actor) return;
    try {
      const raw = await actor.getTopScores();
      setTopScores(
        [...raw]
          .sort((a, b) => Number(b.score) - Number(a.score))
          .slice(0, 10)
          .map((e) => ({ username: e.username, score: Number(e.score) })),
      );
    } catch {
      // ignore
    }
  }, [actor]);

  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  const doAction = useCallback(
    (action: "left" | "right" | "jump" | "slide") => {
      if (gsRef.current !== "playing") return;
      const g = gRef.current;
      if (action === "left" && g.playerLane > 0) g.playerLane--;
      else if (action === "right" && g.playerLane < 2) g.playerLane++;
      else if (action === "jump" && !g.isJumping) {
        g.isJumping = true;
        g.jumpVel = JUMP_V;
      } else if (action === "slide" && !g.isJumping && g.slideFrames === 0) {
        g.slideFrames = SLIDE_DUR;
      }
    },
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const controlled = [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Space",
      ];
      if (controlled.includes(e.code)) e.preventDefault();
      switch (e.code) {
        case "ArrowLeft":
        case "KeyA":
          doAction("left");
          break;
        case "ArrowRight":
        case "KeyD":
          doAction("right");
          break;
        case "ArrowUp":
        case "KeyW":
        case "Space":
          doAction("jump");
          break;
        case "ArrowDown":
        case "KeyS":
          doAction("slide");
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doAction]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    };
    const onEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (!touchStartRef.current) return;
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      touchStartRef.current = null;
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      if (Math.abs(dx) > Math.abs(dy)) doAction(dx < 0 ? "left" : "right");
      else doAction(dy < 0 ? "jump" : "slide");
    };
    canvas.addEventListener("touchstart", onStart, { passive: false });
    canvas.addEventListener("touchend", onEnd, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchend", onEnd);
    };
  }, [doAction]);

  // Main RAF loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const loop = () => {
      if (gsRef.current === "playing") {
        const alive = updateGame(gRef.current);
        drawScene(ctx, gRef.current);
        if (!alive) {
          setFinalScore(Math.floor(gRef.current.score));
          setFinalCoins(gRef.current.coins);
          changeState("gameover");
          if (actor) {
            actor
              .getTopScores()
              .then((raw) =>
                setTopScores(
                  [...raw]
                    .sort((a, b) => Number(b.score) - Number(a.score))
                    .slice(0, 10)
                    .map((e) => ({
                      username: e.username,
                      score: Number(e.score),
                    })),
                ),
              )
              .catch(() => {});
          }
        }
      } else {
        bgFrameRef.current++;
        const bf = bgFrameRef.current;
        drawBackground(ctx, (bf * 0.0025) % 1);
        const t = bf * 0.018;
        ctx.save();
        for (let i = 0; i < 7; i++) {
          const ox = VPX + Math.sin(t * 0.65 + i * 0.95) * (70 + i * 38);
          const oy =
            VPY +
            (CH - VPY) * (0.18 + i * 0.09) +
            Math.cos(t * 0.9 + i * 0.7) * 25;
          const alpha = 0.18 + Math.sin(t + i) * 0.1;
          const cyan = i % 2 === 0;
          ctx.globalAlpha = alpha;
          ctx.shadowBlur = 14;
          ctx.shadowColor = cyan ? COL.laneGlow : "#aa00ff";
          ctx.fillStyle = cyan ? COL.laneGlow : "#aa00ff";
          ctx.beginPath();
          ctx.arc(ox, oy, 4 + Math.sin(t * 1.3 + i) * 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor, changeState]);

  const startGame = useCallback(() => {
    gRef.current = initGame();
    setSubmitStatus("idle");
    changeState("playing");
  }, [changeState]);

  const submitScore = useCallback(async () => {
    if (!username.trim() || !actor) return;
    setSubmitStatus("loading");
    try {
      await actor.submitScore(username.trim(), BigInt(finalScore));
      setSubmitStatus("done");
      fetchScores();
    } catch {
      setSubmitStatus("error");
    }
  }, [username, finalScore, actor, fetchScores]);

  // ===========================
  // JSX
  // ===========================
  const panelStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(4, 4, 14, 0.80)",
    backdropFilter: "blur(2px)",
  };

  const neonBtn = (extra?: CSSProperties): CSSProperties => ({
    background: "transparent",
    border: "2px solid #00eeff",
    color: "#00eeff",
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
    letterSpacing: "0.18em",
    boxShadow:
      "0 0 18px rgba(0,238,255,0.35), inset 0 0 18px rgba(0,238,255,0.08)",
    transition: "box-shadow 0.15s, background 0.15s",
    ...extra,
  });

  const CONTROLS: [string, string][] = [
    ["← A", "Move Left"],
    ["→ D", "Move Right"],
    ["↑ W Space", "Jump"],
    ["↓ S", "Slide"],
    ["Swipe", "Mobile"],
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#04040d",
      }}
    >
      <div style={{ position: "relative", width: "100%", maxWidth: "800px" }}>
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          style={{ width: "100%", height: "auto", display: "block" }}
          tabIndex={0}
        />

        {/* START SCREEN */}
        {gameState === "start" && (
          <div style={panelStyle}>
            <h1
              style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                fontSize: "clamp(2rem, 7vw, 3.8rem)",
                fontWeight: 900,
                color: "#00eeff",
                margin: "0 0 4px",
                letterSpacing: "0.18em",
                textShadow:
                  "0 0 18px #00ffff, 0 0 40px #00ffff, 0 0 80px #0066ff",
                lineHeight: 1,
              }}
            >
              NEON
            </h1>
            <h1
              style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                fontSize: "clamp(2rem, 7vw, 3.8rem)",
                fontWeight: 900,
                color: "#ff0077",
                margin: "0 0 6px",
                letterSpacing: "0.18em",
                textShadow: "0 0 18px #ff0077, 0 0 40px #ff0077",
                lineHeight: 1,
              }}
            >
              RUSH
            </h1>
            <p
              style={{
                color: "#5500aa",
                fontSize: "0.72rem",
                letterSpacing: "0.35em",
                margin: "0 0 22px",
              }}
            >
              ENDLESS RUNNER
            </p>

            <div
              style={{
                background: "rgba(0,0,0,0.55)",
                border: "1px solid rgba(40,10,100,0.8)",
                borderRadius: "6px",
                padding: "14px 22px",
                marginBottom: "20px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "5px 20px",
                fontSize: "0.7rem",
                maxWidth: "300px",
                width: "88%",
              }}
            >
              {CONTROLS.map(([key, desc]) => (
                <>
                  <span key={`k-${key}`} style={{ color: "#6633aa" }}>
                    {key}
                  </span>
                  <span key={`d-${key}`} style={{ color: "#00eeff" }}>
                    {desc}
                  </span>
                </>
              ))}
            </div>

            <button
              type="button"
              data-ocid="game.start_button"
              onClick={startGame}
              style={{
                ...neonBtn({
                  fontSize: "1.05rem",
                  padding: "12px 52px",
                  marginBottom: "22px",
                }),
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(0,238,255,0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              PLAY
            </button>

            {topScores.length > 0 && (
              <div
                style={{
                  background: "rgba(0,0,0,0.55)",
                  border: "1px solid rgba(40,10,100,0.8)",
                  borderRadius: "6px",
                  padding: "10px 18px",
                  maxWidth: "270px",
                  width: "88%",
                }}
              >
                <div
                  style={{
                    color: "#5500aa",
                    fontSize: "0.62rem",
                    letterSpacing: "0.3em",
                    textAlign: "center",
                    marginBottom: "8px",
                  }}
                >
                  TOP SCORES
                </div>
                {topScores.slice(0, 5).map((s) => (
                  <div
                    key={`${s.username}-${s.score}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.72rem",
                      padding: "2px 0",
                      color: topScores.indexOf(s) === 0 ? "#ffd700" : "#7744aa",
                    }}
                  >
                    <span>
                      {topScores.indexOf(s) + 1}. {s.username}
                    </span>
                    <span>{s.score.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* GAME OVER SCREEN */}
        {gameState === "gameover" && (
          <div style={panelStyle}>
            <h2
              style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                fontSize: "clamp(1.6rem, 5.5vw, 2.8rem)",
                fontWeight: 900,
                color: "#ff0077",
                margin: "0 0 10px",
                letterSpacing: "0.15em",
                textShadow: "0 0 20px #ff0077, 0 0 40px #ff0077",
              }}
            >
              GAME OVER
            </h2>

            <div style={{ textAlign: "center", marginBottom: "18px" }}>
              <div
                style={{
                  color: "#00eeff",
                  fontSize: "clamp(1.1rem, 3vw, 1.5rem)",
                  fontWeight: 700,
                  textShadow: "0 0 12px #00eeff",
                }}
              >
                {finalScore.toLocaleString()}
              </div>
              <div
                style={{
                  color: "#5500aa",
                  fontSize: "0.65rem",
                  letterSpacing: "0.25em",
                }}
              >
                FINAL SCORE
              </div>
              <div
                style={{
                  color: COL.coin,
                  fontSize: "0.8rem",
                  marginTop: "4px",
                }}
              >
                ◈ {finalCoins} coins
              </div>
            </div>

            {submitStatus !== "done" && (
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  marginBottom: "14px",
                  maxWidth: "280px",
                  width: "88%",
                }}
              >
                <input
                  data-ocid="game.username_input"
                  type="text"
                  placeholder="ENTER NAME"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitScore();
                  }}
                  maxLength={16}
                  style={{
                    flex: 1,
                    background: "rgba(0,0,0,0.6)",
                    border: "1px solid rgba(40,10,100,0.9)",
                    borderRadius: "4px",
                    color: "#00eeff",
                    padding: "8px 12px",
                    fontSize: "0.82rem",
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: "0.1em",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  data-ocid="game.submit_button"
                  onClick={submitScore}
                  disabled={submitStatus === "loading" || !username.trim()}
                  style={{
                    ...neonBtn({
                      fontSize: "0.78rem",
                      padding: "8px 16px",
                      opacity:
                        !username.trim() || submitStatus === "loading"
                          ? 0.45
                          : 1,
                    }),
                  }}
                >
                  {submitStatus === "loading" ? "..." : "SUBMIT"}
                </button>
              </div>
            )}

            {submitStatus === "done" && (
              <div
                style={{
                  color: COL.shield,
                  fontSize: "0.76rem",
                  marginBottom: "12px",
                  letterSpacing: "0.15em",
                }}
              >
                ✓ SCORE SAVED
              </div>
            )}
            {submitStatus === "error" && (
              <div
                style={{
                  color: COL.obstacle,
                  fontSize: "0.76rem",
                  marginBottom: "12px",
                }}
              >
                Failed to submit. Try again.
              </div>
            )}

            <button
              type="button"
              data-ocid="game.play_again_button"
              onClick={startGame}
              style={{
                ...neonBtn({
                  fontSize: "0.95rem",
                  padding: "10px 42px",
                  marginBottom: "18px",
                }),
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(0,238,255,0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              PLAY AGAIN
            </button>

            <div
              data-ocid="game.leaderboard_tab"
              style={{
                background: "rgba(0,0,0,0.55)",
                border: "1px solid rgba(40,10,100,0.8)",
                borderRadius: "6px",
                padding: "10px 18px",
                maxWidth: "270px",
                width: "88%",
                maxHeight: "160px",
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  color: "#5500aa",
                  fontSize: "0.62rem",
                  letterSpacing: "0.3em",
                  textAlign: "center",
                  marginBottom: "8px",
                }}
              >
                TOP 10
              </div>
              {topScores.length === 0 ? (
                <div
                  style={{
                    color: "#2a0050",
                    fontSize: "0.7rem",
                    textAlign: "center",
                  }}
                >
                  No scores yet
                </div>
              ) : (
                topScores.map((s) => (
                  <div
                    key={`${s.username}-${s.score}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.72rem",
                      padding: "2px 0",
                      color: topScores.indexOf(s) === 0 ? "#ffd700" : "#7744aa",
                    }}
                  >
                    <span>
                      {topScores.indexOf(s) + 1}. {s.username}
                    </span>
                    <span>{s.score.toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <footer
        style={{
          marginTop: "14px",
          fontSize: "0.65rem",
          color: "#2a0050",
          letterSpacing: "0.1em",
          paddingBottom: "12px",
        }}
      >
        © {new Date().getFullYear()}. Built with ♥ using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          style={{ color: "#5500aa", textDecoration: "none" }}
          target="_blank"
          rel="noreferrer"
        >
          caffeine.ai
        </a>
      </footer>
    </div>
  );
}
