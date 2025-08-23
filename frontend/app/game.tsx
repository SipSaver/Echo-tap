import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions, GestureResponderEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Rect, G, Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import { useRouter } from "expo-router";
import { useAppearanceStore } from "../src/store/useAppearance";
import { useAudioStore } from "../src/store/useAudio";

const COLORS = {
  bg: "#000000",
  neonBlue: "#00FFFF",
  neonPink: "#FF00FF",
  neonPurple: "#AA00FF",
  white: "#FFFFFF",
  gray: "#888888",
  energyBg: "#1a1a1a",
  energyFill: "#00E5FF",
  hpBg: "#2a2a2a",
  hpLow: "#FF4D6D",
  hpMid: "#FF00FF",
  hpHigh: "#00FFFF",
  powerYellow: "#FFD400",
};

const CORE_RADIUS = 16; // center orb radius px
const MAX_RIPPLE_RADIUS = 900; // zoomed out
const RIPPLE_SPEED = 480; // px per second
const RIPPLE_THICKNESS = 22; // collision thickness window

const BASE_OBSTACLE_SPEED = 70; // px/s initial
const BASE_SPAWN_INTERVAL = 1200; // ms initial (base spawn cadence for regular enemies)
const DIFFICULTY_RAMP = 0.995; // per second multiplier for interval and 1.003 for speed

// Energy system
const ENERGY_MAX = 100;
const ENERGY_REGEN_PER_SEC = 6.5; // %/sec
const COST_QUAD = 8; // %
const COST_FULL = 40; // %
const CENTER_TAP_RADIUS = 56; // px around core that triggers full wave
const COOLDOWN_QUAD_MS = 120;
const COOLDOWN_FULL_MS = 320;

// Pushback tuning (tough get extra pushback); 3-HP stronger than 2-HP
const PUSHBACK_FULL = 320; // px/s base
const PUSHBACK_QUAD = 260; // px/s base
const TOUGH_PUSH_MULT = 1.25; // base for HP>=2
const PUSH_MULT_HP3 = 1.15; // extra for 3-HP specifically

// HP bar render
const HP_BAR_W = 22;
const HP_BAR_H = 3;
const HP_BAR_OFFSET = 10;

// Blink Stalker tuning
const BLINK_HP = 12;
const BLINK_SPEED_MULT = 0.7; // ~70% of normal (slightly faster)
const BLINK_TELEPORT_COOLDOWN_MS = 2000; // strict 2.0s
const BLINK_SCREEN_MARGIN_PCT = 0.08; // 8%
const BLINK_CENTER_SAFE_PCT = 0.18; // 18%
const BLINK_PLAYER_SAFE_PCT = 0.22; // 22%
const BLINK_PRE_TELE_MS = 300;
const BLINK_POST_SPAWN_MS = 150;
const BLINK_DEATH_MS = 220;

// Audio: keep shot SFX as remote (existing), new local SFX for click/explosion/failed, and looped game BGM
const SFX_FULL_URI = "https://customer-assets.emergentagent.com/job_wavepusher/artifacts/qmvyqr21_laser-shoot-38126.mp3";
const SFX_QUAD_URI = "https://customer-assets.emergentagent.com/job_wavepusher/artifacts/myfr5ilv_retro-laser-1-236669.mp3";

// Types


type Quadrant = "TL" | "TR" | "BL" | "BR";

interface Ripple {
  id: number;
  radius: number;
  type: "full" | "quarter";
  quadrant?: Quadrant;
  startAngle?: number;
  endAngle?: number;
}

type Shape = "circle" | "square";
interface Obstacle {
  id: number;
  angle: number; // radians from center
  radius: number; // distance from center
  speed: number; // inward speed px/s
  size: number; // visual size
  shape: Shape;
  hp: number; // current
  maxHp: number; // max for bar
  tough: boolean;
  hitBy: Set<number>; // ripple ids that already dealt damage
  isPower?: boolean; // yellow 3-HP energy orb
  // Blink Stalker special flags
  isBlink?: boolean;
  _teleportCdMs?: number;
  _preTeleMs?: number; // during this time, no collision
  _postSpawnMs?: number; // visual fade-in only
  _lastQuadrant?: Quadrant;
  _failedTp?: number; // last attempt failures count
  _pendingTeleport?: boolean;
  _dyingMs?: number;
  _exploded?: boolean;
  _slowTimer?: number;
  _origSpeed?: number;
  _rewarded?: boolean;
}

export default function Game() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useAppearanceStore();

  const [size, setSize] = useState({ w: Dimensions.get("window").width, h: Dimensions.get("window").height });

  const center = useMemo(() => ({ x: size.w / 2, y: size.h / 2 }), [size]);
  const maxRadius = useMemo(() => Math.max(center.x, center.y) + 60, [center]);

  const centerRef = useRef(center);
  const maxRadiusRef = useRef(maxRadius);
  useEffect(() => {
    centerRef.current = center;
    maxRadiusRef.current = maxRadius;
  }, [center, maxRadius]);

  const ripples = useRef<Ripple[]>([]);
  const obstacles = useRef<Obstacle[]>([]);
  const nextId = useRef(1);

  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [best, setBest] = useState<number>(0);
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const pausedRef = useRef(false);
  const gameOverRef = useRef(false);
  const musicEnabled = useAudioStore((s) => s.musicEnabled);
  const sfxEnabled = useAudioStore((s) => s.sfxEnabled);

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);

  const [energy, setEnergy] = useState(ENERGY_MAX);
  const energyRef = useRef(ENERGY_MAX);
  const cooldownRef = useRef(0); // ms remaining (tap)
  const next2HpCooldownRef = useRef(0); // ms until next 2-HP allowed
  const next3HpCooldownRef = useRef(0); // ms until next 3-HP allowed

  const lastTime = useRef<number | null>(null);
  const spawnTimer = useRef(0);
  const spawnInterval = useRef(BASE_SPAWN_INTERVAL);
  const speedMultiplier = useRef(1);
  const rafId = useRef<number | null>(null);
  const powerCooldownRef = useRef(0); // 7s cadence for yellow orb

  // Blink Stalker lifecycle flags
  const blinkSpawnedRef = useRef(false);
  const blinkAliveRef = useRef(false);

  // audio
  const fullSoundRef = useRef<Audio.Sound | null>(null);
  const quadSoundRef = useRef<Audio.Sound | null>(null);
  const clickSoundRef = useRef<Audio.Sound | null>(null);
  const explosionRef = useRef<Audio.Sound | null>(null);
  const failedRef = useRef<Audio.Sound | null>(null);
  const gameBgmRef = useRef<Audio.Sound | null>(null);
  const playClick = () => { try { clickSoundRef.current?.replayAsync(); } catch {} };

  // Persistence: best score
  const loadBest = useCallback(async () => {
    try {
      const mod = await import("@react-native-async-storage/async-storage");
      const v = await mod.default.getItem("echo_best");
      if (v) setBest(parseInt(v, 10));
    } catch {}
  }, []);

  const saveBest = useCallback(async (n: number) => {
    try {
      const mod = await import("@react-native-async-storage/async-storage");
      await mod.default.setItem("echo_best", String(n));
    } catch {}
  }, []);

  useEffect(() => {
    loadBest();
  }, [loadBest]);

  const reset = useCallback(() => {
    ripples.current = [];
    obstacles.current = [];
    nextId.current = 1;
    scoreRef.current = 0;
    setScore(0);
    energyRef.current = ENERGY_MAX;
    setEnergy(ENERGY_MAX);
    lastTime.current = null;
    spawnTimer.current = 0;
    spawnInterval.current = BASE_SPAWN_INTERVAL;
    speedMultiplier.current = 1;
    powerCooldownRef.current = 0;
    next2HpCooldownRef.current = 0;
    next3HpCooldownRef.current = 0;
    blinkSpawnedRef.current = false;
    blinkAliveRef.current = false;
    setGameOver(false);
    setPaused(false);
  }, []);

  const getQuadrantFromPoint = (x: number, y: number): Quadrant => {
    const c = centerRef.current;
    const left = x < c.x;
    const top = y < c.y;
    if (left && top) return "TL";
    if (!left && top) return "TR";
    if (left && !top) return "BL";
    return "BR";
  };

  const getAnglesForQuadrant = (q: Quadrant) => {
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

  // Keep spawns away from quadrant borders to avoid ambiguity
  const ANGLE_MARGIN_DEG = 6; // a "couple" of degrees
  const ANGLE_MARGIN = (ANGLE_MARGIN_DEG * Math.PI) / 180;
  const randomAngleWithin = (start: number, end: number, margin: number = ANGLE_MARGIN) => {
    const width = end - start;
    const innerStart = start + margin;
    const innerEnd = end - margin;
    if (innerEnd <= innerStart) return start + width / 2; // fallback safety
    return innerStart + Math.random() * (innerEnd - innerStart);
  };

  const arcStrokePath = (cx: number, cy: number, r: number, start: number, end: number) => {
    const x0 = cx + r * Math.cos(start);
    const y0 = cy + r * Math.sin(start);
    const x1 = cx + r * Math.cos(end);
    const y1 = cy + r * Math.sin(end);
    const largeArc = end - start > Math.PI ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1}`;
  };

  const trySpendEnergy = (cost: number) => {
    if (energyRef.current < cost) return false;
    energyRef.current = Math.max(0, energyRef.current - cost);
    setEnergy(energyRef.current);
    return true;
  };

  const onTap = useCallback((x: number, y: number) => {
    if (pausedRef.current || gameOverRef.current) return;
    if (cooldownRef.current > 0) return;

    const c = centerRef.current;
    const dx = x - c.x;
    const dy = y - c.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= CENTER_TAP_RADIUS) {
      // Full wave
      if (!trySpendEnergy(COST_FULL)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      ripples.current.push({ id: nextId.current++, radius: CORE_RADIUS, type: "full" });
      cooldownRef.current = COOLDOWN_FULL_MS;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try { fullSoundRef.current?.replayAsync(); } catch {}
    } else {
      // Quadrant
      if (!trySpendEnergy(COST_QUAD)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      const q = getQuadrantFromPoint(x, y);
      const { start, end } = getAnglesForQuadrant(q);
      ripples.current.push({ id: nextId.current++, radius: CORE_RADIUS, type: "quarter", quadrant: q, startAngle: start, endAngle: end });
      cooldownRef.current = COOLDOWN_QUAD_MS;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try { quadSoundRef.current?.replayAsync(); } catch {}
    }
  }, []);

  const spawnObstacle = () => {
    // Choose a quadrant evenly
    const r = Math.random();
    const quadrant: Quadrant = r < 0.25 ? "TL" : r < 0.5 ? "TR" : r < 0.75 ? "BL" : "BR";
    const { start, end } = getAnglesForQuadrant(quadrant);
    const angle = randomAngleWithin(start, end);
    const radius = maxRadiusRef.current + 80; // further out for reaction time
    const size = 10 + Math.random() * 12;

    // Decide hp tier with per-tier cooldowns
    const canSpawn2 = next2HpCooldownRef.current <= 0;
    const canSpawn3 = next3HpCooldownRef.current <= 0;

    let hp = 1;
    if (canSpawn3 && Math.random() < 0.8) {
      hp = 3;
      next3HpCooldownRef.current = 4000 + Math.random() * 1000; // 4-5s
    } else if (canSpawn2 && Math.random() < 0.7) {
      hp = 2;
      next2HpCooldownRef.current = 2000 + Math.random() * 1000; // 2-3s
    }

    const tough = hp > 1;
    const shape: Shape = hp === 2 ? "square" : "circle";

    obstacles.current.push({ id: nextId.current++, angle, radius, size, shape, speed: BASE_OBSTACLE_SPEED * speedMultiplier.current, hp, maxHp: hp, tough, hitBy: new Set<number>() });
  };

  // Create Blink Stalker at a safe initial spot (spawns outside and moves inward slowly)
  const createBlinkStalker = (): Obstacle | null => {
    // Start like other enemies from an edge but slower and tankier
    const r = Math.random();
    const q: Quadrant = r < 0.25 ? "TL" : r < 0.5 ? "TR" : r < 0.75 ? "BL" : "BR";
    const { start, end } = getAnglesForQuadrant(q);
    const angle = randomAngleWithin(start, end);
    const radius = maxRadiusRef.current + 80;
    const size = 16;

    const o: Obstacle = {
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
    return o;
  };

  // Attempt to teleport the blink stalker to a safe spot
  const attemptBlinkTeleport = (o: Obstacle): boolean => {
    if (!o.isBlink) return false;
    const c = centerRef.current;
    const w = Math.max(1, Dimensions.get("window").width);
    const h = Math.max(1, Dimensions.get("window").height);
    const minDim = Math.min(w, h);
    const marginX = w * BLINK_SCREEN_MARGIN_PCT;
    const marginY = h * BLINK_SCREEN_MARGIN_PCT;
    const centerSafe = minDim * BLINK_CENTER_SAFE_PCT;
    const playerSafe = minDim * BLINK_PLAYER_SAFE_PCT;

    const playerX = c.x;
    const playerY = c.y;

    const currentQ = o._lastQuadrant || getQuadrantFromPoint(c.x + Math.cos(o.angle) * o.radius, c.y + Math.sin(o.angle) * o.radius);
    const choices: Quadrant[] = ["TL", "TR", "BL", "BR"].filter((q) => q !== currentQ) as Quadrant[];
    const targetQ = choices[Math.floor(Math.random() * choices.length)];

    let best: { x: number; y: number; angle: number; radius: number; d: number } | null = null;
    let found = false;

    for (let i = 0; i < 10; i++) {
      // sample within margins
      const x = marginX + Math.random() * (w - marginX * 2);
      const y = marginY + Math.random() * (h - marginY * 2);
      const qq = getQuadrantFromPoint(x, y);
      if (qq !== targetQ) continue;

      const dx = x - c.x;
      const dy = y - c.y;
      const rad = Math.hypot(dx, dy);
      if (rad < centerSafe) continue; // too close to center
      const distToPlayer = Math.hypot(x - playerX, y - playerY);
      if (distToPlayer < playerSafe) continue; // too close to player

      const ang = Math.atan2(dy, dx);
      const d = distToPlayer;
      if (!best || d > best.d) best = { x, y, angle: ang, radius: rad, d };
      found = true;
      break; // accept first valid to keep perf bounded
    }

    if (!found && best) {
      found = true;
    }

    if (!found || !best) {
      o._failedTp = (o._failedTp || 0) + 1;
      return false; // stay put; try next cooldown
    }

    o.angle = best.angle;
    o.radius = best.radius;
    o._lastQuadrant = targetQ;
    return true;
  };

  const updateLoop = useCallback((t: number) => {
    rafId.current = requestAnimationFrame(updateLoop);

    // Cooldowns always tick
    if (lastTime.current == null) lastTime.current = t;
    const dtMs = Math.min(64, t - lastTime.current);
    const dt = dtMs / 1000;

    cooldownRef.current = Math.max(0, cooldownRef.current - dtMs);
    next2HpCooldownRef.current = Math.max(0, next2HpCooldownRef.current - dtMs);
    next3HpCooldownRef.current = Math.max(0, next3HpCooldownRef.current - dtMs);
    powerCooldownRef.current = Math.max(0, powerCooldownRef.current - dtMs);

    if (pausedRef.current || gameOverRef.current) {
      lastTime.current = t;
      return;
    }

    lastTime.current = t;

    // Energy regen
    energyRef.current = Math.min(ENERGY_MAX, energyRef.current + ENERGY_REGEN_PER_SEC * dt);
    setEnergy(energyRef.current);

    // Difficulty ramp
    spawnInterval.current = Math.max(350, spawnInterval.current * Math.pow(DIFFICULTY_RAMP, dt * 60));
    speedMultiplier.current = Math.min(2.7, speedMultiplier.current * Math.pow(1.003, dt * 60));

    // Update score
    scoreRef.current += dt;
    setScore(scoreRef.current);

    // Update ripples
    ripples.current.forEach((r) => {
      r.radius += RIPPLE_SPEED * dt;
    });
    ripples.current = ripples.current.filter((r) => r.radius < MAX_RIPPLE_RADIUS);

    // Blink Stalker gate: spawn once at score >= 27
    if (!blinkSpawnedRef.current && scoreRef.current >= 15) {
      blinkSpawnedRef.current = true;
      const o = createBlinkStalker();
      if (o) {
        obstacles.current.push(o);
        blinkAliveRef.current = true;
      }
    }

    // Spawn obstacles on interval (paused when blink alive)
    spawnTimer.current += dt * 1000;
    if (spawnTimer.current >= spawnInterval.current) {
      spawnTimer.current = 0;
      if (!blinkAliveRef.current) {
        const cluster = Math.random() < 0.25 ? 2 + Math.floor(Math.random() * 2) : 1;
        for (let i = 0; i < cluster; i++) spawnObstacle();

        // Power orb cadence (every 7s)
        if (powerCooldownRef.current <= 0) {
          const r = Math.random();
          const quadrant: Quadrant = r < 0.25 ? "TL" : r < 0.5 ? "TR" : r < 0.75 ? "BL" : "BR";
          const { start, end } = getAnglesForQuadrant(quadrant);
          const angle = randomAngleWithin(start, end);
          const radius = maxRadiusRef.current + 80;
          const size = 12 + Math.random() * 10;
          obstacles.current.push({
            id: nextId.current++,
            angle,
            radius,
            size,
            shape: "circle",
            speed: BASE_OBSTACLE_SPEED * speedMultiplier.current,
            hp: 3,
            maxHp: 3,
            tough: true,
            hitBy: new Set<number>(),
            isPower: true,
          });
          powerCooldownRef.current = 7000; // 7 seconds
        }
      }
    }

    // Update obstacles movement, blink logic and collisions
    const rippleArr = ripples.current;
    let hitCore = false;
    const c = centerRef.current;

    obstacles.current.forEach((o) => {
      // If blink stalker is in death phase, only tick death timer and skip all interactions
      if (o.isBlink && (o._dyingMs || 0) > 0) {
        o._dyingMs = Math.max(0, (o._dyingMs || 0) - dtMs);
        return;
      }
      // Inward movement with brief slow after hit
      const slow = o._slowTimer || 0;
      if (slow > 0) o._slowTimer = Math.max(0, slow - dt);
      const speedNow = o.speed * (o._slowTimer && o._slowTimer > 0 ? 0.55 : 1);
      o.radius -= speedNow * dt;

      // Ensure hitBy set exists (handles HMR/old references)
      if (!o.hitBy) o.hitBy = new Set<number>();

      // Blink stalker timers and teleport
      if (o.isBlink) {
        o._postSpawnMs = Math.max(0, (o._postSpawnMs || 0) - dtMs);
        if (!o._pendingTeleport) {
          o._teleportCdMs = Math.max(0, (o._teleportCdMs || 0) - dtMs);
        } else {
          o._preTeleMs = Math.max(0, (o._preTeleMs || 0) - dtMs);
          if ((o._preTeleMs || 0) <= 0) {
            const ok = attemptBlinkTeleport(o);
            if (ok) {
              o._pendingTeleport = false;
              o._postSpawnMs = BLINK_POST_SPAWN_MS;
              o._teleportCdMs = BLINK_TELEPORT_COOLDOWN_MS; // strict cooldown
            } else {
              o._pendingTeleport = false;
              o._teleportCdMs = BLINK_TELEPORT_COOLDOWN_MS;
            }
          }
        }
        if ((o._teleportCdMs || 0) <= 0 && !o._pendingTeleport) {
          o._pendingTeleport = true;
          o._preTeleMs = BLINK_PRE_TELE_MS; // telegraph
        }
      }

      // Position for quadrant checks
      const x = c.x + Math.cos(o.angle) * o.radius;
      const y = c.y + Math.sin(o.angle) * o.radius;
      const qNow = getQuadrantFromPoint(x, y);

      let damagedThisFrame = false;

      // Ripple interaction
      for (let i = 0; i < rippleArr.length; i++) {
        const r = rippleArr[i];
        const radialDiff = Math.abs(o.radius - r.radius);
        if (radialDiff < RIPPLE_THICKNESS) {
          const strength = 1 - radialDiff / RIPPLE_THICKNESS; // 0..1
          const active = r.type === "full" || (r.type === "quarter" && r.quadrant === qNow);
          if (active) {
            let pushBase = r.type === "full" ? PUSHBACK_FULL : PUSHBACK_QUAD;
            if (o.tough) pushBase *= (o.maxHp === 3 ? TOUGH_PUSH_MULT * PUSH_MULT_HP3 : TOUGH_PUSH_MULT);
            const push = pushBase * strength * dt;
            o.radius += push;

            if (!damagedThisFrame && !o.hitBy.has(r.id)) {
              o.hp -= 1;
              o.hitBy.add(r.id);
              damagedThisFrame = true;
              // Apply slow
              o._slowTimer = 0.5; // seconds
              o._origSpeed = o._origSpeed || o.speed;

              // On-kill effects
              if (o.hp <= 0) {
                if (o.isPower && !o._rewarded) {
                  energyRef.current = ENERGY_MAX;
                  setEnergy(energyRef.current);
                  o._rewarded = true;
                }
                if (o.isBlink && !o._exploded) {
                  o._exploded = true;
                  o._dyingMs = BLINK_DEATH_MS;
                  try { explosionRef.current?.replayAsync(); } catch {}
                }
              }
            }
          }
        }
      }

      // Core collision (disabled during blink pre-telegraph)
      const noCollisionNow = (o._preTeleMs || 0) > 0;
      if (!noCollisionNow && o.radius <= CORE_RADIUS + o.size * 0.5) {
        if (o.isPower) {
          energyRef.current = Math.max(0, energyRef.current - 5);
          setEnergy(energyRef.current);
          o.hp = 0; // remove
        } else {
          hitCore = true;
        }
      }
    });

    // Remove destroyed or out-of-bounds
    const beforeHadBlink = blinkAliveRef.current;
    obstacles.current = obstacles.current.filter((o) => o.radius > 0 && o.radius < maxRadiusRef.current + 200 && (o.hp > 0 || (o.isBlink && (o._dyingMs || 0) > 0)));
    const hasBlinkAlive = obstacles.current.some((o) => o.isBlink && o.hp > 0);
    blinkAliveRef.current = hasBlinkAlive ? true : false;

    if (hitCore) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      try { failedRef.current?.replayAsync(); } catch {}
      try { gameBgmRef.current?.stopAsync(); } catch {}
      setGameOver(true);
      setPaused(true);
      const final = Math.floor(scoreRef.current);
      if (final > best) {
        setBest(final);
        saveBest(final);
      }
    }
  }, [best, saveBest]);

  useEffect(() => {
    // audio init + RAF
    (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const full = await Audio.Sound.createAsync({ uri: SFX_FULL_URI }, { shouldPlay: false, volume: sfxEnabled ? 0.9 : 0 });
        const quad = await Audio.Sound.createAsync({ uri: SFX_QUAD_URI }, { shouldPlay: false, volume: sfxEnabled ? 0.7 : 0 });
        const click = await Audio.Sound.createAsync(require("../assets/audio/button-click.mp3"), { shouldPlay: false, volume: sfxEnabled ? 0.8 : 0 });
        const explosion = await Audio.Sound.createAsync(require("../assets/audio/explosion.mp3"), { shouldPlay: false, volume: sfxEnabled ? 0.9 : 0 });
        const failed = await Audio.Sound.createAsync(require("../assets/audio/failed.mp3"), { shouldPlay: false, volume: sfxEnabled ? 0.9 : 0 });
        const bgm = await Audio.Sound.createAsync(require("../assets/audio/game-bgm.mp3"), { shouldPlay: musicEnabled, isLooping: true, volume: musicEnabled ? 0.55 : 0 });
        fullSoundRef.current = full.sound;
        quadSoundRef.current = quad.sound;
        clickSoundRef.current = click.sound;
        explosionRef.current = explosion.sound;
        failedRef.current = failed.sound;
        gameBgmRef.current = bgm.sound;
      } catch {}
    })();

    rafId.current = requestAnimationFrame(updateLoop);
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
      try { fullSoundRef.current?.unloadAsync(); } catch {}
      try { quadSoundRef.current?.unloadAsync(); } catch {}
      fullSoundRef.current = null;
      quadSoundRef.current = null;
    };
  }, [updateLoop]);

  const onPress = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    onTap(locationX, locationY);
  };

  const finalScore = Math.floor(score);
  const energyPct = Math.round(energy);

  const hpColor = (ratio: number) => {
    if (ratio < 0.34) return COLORS.hpLow;
    if (ratio < 0.67) return COLORS.hpMid;
    return COLORS.hpHigh;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {/* HUD */}
      <View style={[styles.hud, { top: insets.top + 10 }]}>
        <Text style={styles.score}>Score: {finalScore}</Text>
        <View style={styles.energyWrap}>
          <Text style={styles.energyLabel}>Energy</Text>
          <View style={styles.energyBar}>
            <View style={[styles.energyFill, { width: `${energyPct}%` }]} />
          </View>
          <Text style={styles.energyPct}>{energyPct}%</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => { playClick(); setPaused((p) => !p); }} style={styles.pauseBtn}>
          <Text style={styles.pauseText}>{paused ? "Resume" : "Pause"}</Text>
        </Pressable>
      </View>

      {/* Tap Layer */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onPress}>
        <Svg width={size.w} height={size.h}>
          {/* Ripples */}
          {ripples.current.map((r) => {
            if (r.type === "full") {
              return (
                <Circle key={r.id} cx={center.x} cy={center.y} r={r.radius} stroke={settings.colorFull} strokeOpacity={0.7} strokeWidth={2} fill="none" />
              );
            } else {
              const path = arcStrokePath(center.x, center.y, r.radius, r.startAngle || 0, r.endAngle || 0);
              return <Path key={r.id} d={path} stroke={settings.colorQuarter} strokeOpacity={0.8} strokeWidth={3} fill="none" />;
            }
          })}

          {/* Core */}
          <Circle cx={center.x} cy={center.y} r={CORE_RADIUS} fill={settings.colorCore} />

          {/* Obstacles */}
          <G>
            {obstacles.current.map((o) => {
              const x = center.x + Math.cos(o.angle) * o.radius;
              const y = center.y + Math.sin(o.angle) * o.radius;
              const color = o.isPower ? COLORS.powerYellow : (o.tough ? COLORS.neonPurple : COLORS.neonBlue);

              // Blink death FX: ring that fades while _dyingMs > 0
              if (o.isBlink && (o._dyingMs || 0) > 0) {
                const t = 1 - Math.max(0, Math.min(1, (o._dyingMs || 0) / BLINK_DEATH_MS));
                const ringR = o.size + 12 + t * 22; // grow a bit
                const strokeOp = 1 - t;
                return (
                  <G key={o.id}>
                    <Circle cx={x} cy={y} r={ringR} stroke={COLORS.neonPurple} strokeWidth={3} strokeOpacity={strokeOp} fill="none" />
                  </G>
                );
              }

              const elems: any[] = [];
              const pre = o._preTeleMs || 0;
              const post = o._postSpawnMs || 0;
              const fillOpacity = o.isBlink ? (pre > 0 ? 0.4 : post > 0 ? 0.7 : 1) : 1;

              if (o.shape === "circle") {
                elems.push(<Circle key={`s-${o.id}`} cx={x} cy={y} r={o.size} fill={color} fillOpacity={fillOpacity} />);
              } else {
                elems.push(<Rect key={`s-${o.id}`} x={x - o.size} y={y - o.size} width={o.size * 2} height={o.size * 2} fill={color} fillOpacity={fillOpacity} />);
              }
              if (o.tough && o.hp < o.maxHp) {
                const ratio = Math.max(0, o.hp / o.maxHp);
                const barX = x - HP_BAR_W / 2;
                const barY = y - o.size - HP_BAR_OFFSET;
                elems.push(
                  <G key={`hp-${o.id}`}>
                    <Rect x={barX} y={barY} width={HP_BAR_W} height={HP_BAR_H} fill={COLORS.hpBg} rx={2} />
                    <Rect x={barX} y={barY} width={HP_BAR_W * ratio} height={HP_BAR_H} fill={hpColor(ratio)} rx={2} />
                  </G>
                );
              }
              return <G key={o.id}>{elems}</G>;
            })}
          </G>
        </Svg>
      </Pressable>

      {/* Overlays */}
      {paused && !gameOver && (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>Paused</Text>
          <View style={styles.overlayButtons}>
            <Pressable style={[styles.overlayBtn, { borderColor: COLORS.neonBlue }]} onPress={() => { playClick(); setPaused(false); }}>
              <Text style={styles.overlayBtnText}>Resume</Text>
            </Pressable>
            <Pressable style={[styles.overlayBtn, { borderColor: COLORS.neonPink }]} onPress={() => { playClick(); reset(); }}>
              <Text style={styles.overlayBtnText}>Restart</Text>
            </Pressable>
            <Pressable style={[styles.overlayBtn, { borderColor: "#666" }]} onPress={() => { playClick(); router.replace("/"); }}>
              <Text style={styles.overlayBtnText}>Main Menu</Text>
            </Pressable>
          </View>
        </View>
      )}

      {gameOver && (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>Game Over</Text>
          <Text style={styles.overlaySub}>Score: {finalScore}  •  Best: {best}</Text>
          <View style={styles.overlayButtons}>
            <Pressable style={[styles.overlayBtn, { borderColor: COLORS.neonBlue }]} onPress={reset}>
              <Text style={styles.overlayBtnText}>Retry</Text>
            </Pressable>
            <Pressable style={[styles.overlayBtn, { borderColor: "#666" }]} onPress={() => router.replace("/") }>
              <Text style={styles.overlayBtnText}>Main Menu</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  hud: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  score: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "700",
    minWidth: 110,
  },
  energyWrap: {
    flex: 1,
    alignItems: "center",
  },
  energyLabel: {
    color: COLORS.gray,
    fontSize: 12,
    marginBottom: 4,
  },
  energyBar: {
    width: "80%",
    height: 10,
    borderRadius: 6,
    backgroundColor: COLORS.energyBg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#333",
  },
  energyFill: {
    height: "100%",
    backgroundColor: COLORS.energyFill,
  },
  energyPct: {
    color: COLORS.gray,
    fontSize: 12,
    marginTop: 4,
  },
  pauseBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#444",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  pauseText: {
    color: COLORS.white,
    fontWeight: "700",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  overlayTitle: {
    color: COLORS.white,
    fontSize: 28,
    fontWeight: "800",
    textShadowColor: COLORS.neonPink,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  overlaySub: {
    color: COLORS.neonBlue,
    marginTop: 8,
    marginBottom: 16,
  },
  overlayButtons: {
    marginTop: 16,
    width: "86%",
    gap: 12,
  },
  overlayBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
  },
  overlayBtnText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "700",
  },
});