import { Dimensions } from "react-native";
import {
  BASE_OBSTACLE_SPEED,
  BLINK_HP,
  BLINK_SPEED_MULT,
  BLINK_TELEPORT_COOLDOWN_MS,
  BLINK_SCREEN_MARGIN_PCT,
  BLINK_CENTER_SAFE_PCT,
  BLINK_PLAYER_SAFE_PCT,
} from "./constants";

export type Quadrant = "TL" | "TR" | "BL" | "BR";
export type Shape = "circle" | "square";

export interface Obstacle {
  id: number;
  angle: number;
  radius: number;
  speed: number;
  size: number;
  shape: Shape;
  hp: number;
  maxHp: number;
  tough: boolean;
  hitBy: Set<number>;
  isPower?: boolean;
  // Blink stalker flags
  isBlink?: boolean;
  _teleportCdMs?: number;
  _preTeleMs?: number;
  _postSpawnMs?: number;
  _lastQuadrant?: Quadrant;
  _failedTp?: number;
  _pendingTeleport?: boolean;
  _dyingMs?: number;
  _exploded?: boolean;
  _slowTimer?: number;
  _origSpeed?: number;
  _rewarded?: boolean;
}

const ANGLE_MARGIN_DEG = 6;
const ANGLE_MARGIN = (ANGLE_MARGIN_DEG * Math.PI) / 180;

export const getQuadrantFromPoint = (center: { x: number; y: number }, x: number, y: number): Quadrant => {
  const left = x < center.x;
  const top = y < center.y;
  if (left && top) return "TL";
  if (!left && top) return "TR";
  if (left && !top) return "BL";
  return "BR";
};

export const getAnglesForQuadrant = (q: Quadrant) => {
  switch (q) {
    case "TL":
      return { start: -Math.PI, end: -Math.PI / 2 };
    case "TR":
      return { start: -Math.PI / 2, end: 0 };
    case "BR":
      return { start: 0, end: Math.PI / 2 };
    case "BL":
    default:
      return { start: Math.PI / 2, end: Math.PI };
  }
};

export const randomAngleWithin = (start: number, end: number, margin: number = ANGLE_MARGIN) => {
  const width = end - start;
  const innerStart = start + margin;
  const innerEnd = end - margin;
  if (innerEnd <= innerStart) return start + width / 2;
  return innerStart + Math.random() * (innerEnd - innerStart);
};

export const spawnObstacle = (
  nextId: React.MutableRefObject<number>,
  maxRadiusRef: React.MutableRefObject<number>,
  speedMultiplier: React.MutableRefObject<number>,
  next2HpCooldownRef: React.MutableRefObject<number>,
  next3HpCooldownRef: React.MutableRefObject<number>
): Obstacle => {
  const r = Math.random();
  const quadrant: Quadrant = r < 0.25 ? "TL" : r < 0.5 ? "TR" : r < 0.75 ? "BL" : "BR";
  const { start, end } = getAnglesForQuadrant(quadrant);
  const angle = randomAngleWithin(start, end);
  const radius = maxRadiusRef.current + 80;
  const size = 10 + Math.random() * 12;

  const canSpawn2 = next2HpCooldownRef.current <= 0;
  const canSpawn3 = next3HpCooldownRef.current <= 0;

  let hp = 1;
  if (canSpawn3 && Math.random() < 0.8) {
    hp = 3;
    next3HpCooldownRef.current = 4000 + Math.random() * 1000;
  } else if (canSpawn2 && Math.random() < 0.7) {
    hp = 2;
    next2HpCooldownRef.current = 2000 + Math.random() * 1000;
  }

  const tough = hp > 1;
  const shape: Shape = hp === 2 ? "square" : "circle";

  return {
    id: nextId.current++,
    angle,
    radius,
    size,
    shape,
    speed: BASE_OBSTACLE_SPEED * speedMultiplier.current,
    hp,
    maxHp: hp,
    tough,
    hitBy: new Set<number>(),
  };
};

export const createBlinkStalker = (
  nextId: React.MutableRefObject<number>,
  maxRadiusRef: React.MutableRefObject<number>,
  speedMultiplier: React.MutableRefObject<number>
): Obstacle => {
  const r = Math.random();
  const q: Quadrant = r < 0.25 ? "TL" : r < 0.5 ? "TR" : r < 0.75 ? "BL" : "BR";
  const { start, end } = getAnglesForQuadrant(q);
  const angle = randomAngleWithin(start, end);
  const radius = maxRadiusRef.current + 80;
  const size = 16;

  return {
    id: nextId.current++,
    angle,
    radius,
    size,
    shape: "circle",
    speed: BASE_OBSTACLE_SPEED * speedMultiplier.current * BLINK_SPEED_MULT,
    hp: BLINK_HP,
    maxHp: BLINK_HP,
    tough: true,
    hitBy: new Set<number>(),
    isBlink: true,
    _teleportCdMs: BLINK_TELEPORT_COOLDOWN_MS,
    _preTeleMs: 0,
    _postSpawnMs: 0,
    _lastQuadrant: q,
    _failedTp: 0,
    _pendingTeleport: false,
  };
};

export const attemptBlinkTeleport = (
  o: Obstacle,
  center: { x: number; y: number }
): boolean => {
  if (!o.isBlink) return false;
  const w = Math.max(1, Dimensions.get("window").width);
  const h = Math.max(1, Dimensions.get("window").height);
  const minDim = Math.min(w, h);
  const marginX = w * BLINK_SCREEN_MARGIN_PCT;
  const marginY = h * BLINK_SCREEN_MARGIN_PCT;
  const centerSafe = minDim * BLINK_CENTER_SAFE_PCT;
  const playerSafe = minDim * BLINK_PLAYER_SAFE_PCT;

  const playerX = center.x;
  const playerY = center.y;

  const currentQ = o._lastQuadrant || getQuadrantFromPoint(center, center.x + Math.cos(o.angle) * o.radius, center.y + Math.sin(o.angle) * o.radius);
  const choices: Quadrant[] = ["TL", "TR", "BL", "BR"].filter((q) => q !== currentQ) as Quadrant[];
  const targetQ = choices[Math.floor(Math.random() * choices.length)];

  let best: { x: number; y: number; angle: number; radius: number; d: number } | null = null;
  let found = false;

  for (let i = 0; i < 10; i++) {
    const x = marginX + Math.random() * (w - marginX * 2);
    const y = marginY + Math.random() * (h - marginY * 2);
    const qq = getQuadrantFromPoint(center, x, y);
    if (qq !== targetQ) continue;

    const dx = x - center.x;
    const dy = y - center.y;
    const rad = Math.hypot(dx, dy);
    if (rad < centerSafe) continue;
    const distToPlayer = Math.hypot(x - playerX, y - playerY);
    if (distToPlayer < playerSafe) continue;

    const ang = Math.atan2(dy, dx);
    const d = distToPlayer;
    if (!best || d > best.d) best = { x, y, angle: ang, radius: rad, d };
    found = true;
    break;
  }

  if (!found && best) {
    found = true;
  }

  if (!found || !best) {
    o._failedTp = (o._failedTp || 0) + 1;
    return false;
  }

  o.angle = best.angle;
  o.radius = best.radius;
  o._lastQuadrant = targetQ;
  return true;
};
