import { useCallback, useEffect } from "react";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import {
  CORE_RADIUS,
  MAX_RIPPLE_RADIUS,
  RIPPLE_SPEED,
  ENERGY_MAX,
  ENERGY_REGEN_PER_SEC,
  DIFFICULTY_RAMP,
  PUSHBACK_FULL,
  PUSHBACK_QUAD,
  TOUGH_PUSH_MULT,
  PUSH_MULT_HP3,
  BLINK_DEATH_MS,
  BLINK_PRE_TELE_MS,
  BLINK_POST_SPAWN_MS,
  BLINK_TELEPORT_COOLDOWN_MS,
  BASE_OBSTACLE_SPEED,
  RIPPLE_THICKNESS,
} from "./constants";
import {
  Quadrant,
  Obstacle,
  spawnObstacle,
  createBlinkStalker,
  attemptBlinkTeleport,
  getAnglesForQuadrant,
  randomAngleWithin,
  getQuadrantFromPoint,
} from "./obstacles";

interface Ripple {
  id: number;
  radius: number;
  type: "full" | "quarter";
  quadrant?: Quadrant;
  startAngle?: number;
  endAngle?: number;
}

interface LoopParams {
  centerRef: React.MutableRefObject<{ x: number; y: number }>;
  maxRadiusRef: React.MutableRefObject<number>;
  ripples: React.MutableRefObject<Ripple[]>;
  obstacles: React.MutableRefObject<Obstacle[]>;
  nextId: React.MutableRefObject<number>;
  scoreRef: React.MutableRefObject<number>;
  setScore: (n: number) => void;
  best: number;
  setBest: (n: number) => void;
  saveBest: (n: number) => void;
  energyRef: React.MutableRefObject<number>;
  setEnergy: (n: number) => void;
  pausedRef: React.MutableRefObject<boolean>;
  gameOverRef: React.MutableRefObject<boolean>;
  cooldownRef: React.MutableRefObject<number>;
  next2HpCooldownRef: React.MutableRefObject<number>;
  next3HpCooldownRef: React.MutableRefObject<number>;
  powerCooldownRef: React.MutableRefObject<number>;
  spawnTimer: React.MutableRefObject<number>;
  spawnInterval: React.MutableRefObject<number>;
  speedMultiplier: React.MutableRefObject<number>;
  blinkSpawnedRef: React.MutableRefObject<boolean>;
  blinkAliveRef: React.MutableRefObject<boolean>;
  setGameOver: (v: boolean) => void;
  setPaused: (v: boolean) => void;
  lastTime: React.MutableRefObject<number | null>;
  rafId: React.MutableRefObject<number | null>;
  explosionRef: React.MutableRefObject<Audio.Sound | null>;
  failedRef: React.MutableRefObject<Audio.Sound | null>;
  gameBgmRef: React.MutableRefObject<Audio.Sound | null>;
}

export function useGameLoop(params: LoopParams) {
  const updateLoop = useCallback(
    (t: number) => {
      const {
        rafId,
        lastTime,
        cooldownRef,
        next2HpCooldownRef,
        next3HpCooldownRef,
        powerCooldownRef,
        pausedRef,
        gameOverRef,
        energyRef,
        setEnergy,
        spawnInterval,
        speedMultiplier,
        scoreRef,
        setScore,
        ripples,
        obstacles,
        blinkSpawnedRef,
        blinkAliveRef,
        spawnTimer,
        nextId,
        maxRadiusRef,
        centerRef,
        setGameOver,
        setPaused,
        best,
        setBest,
        saveBest,
        explosionRef,
        failedRef,
        gameBgmRef,
      } = params;
      rafId.current = requestAnimationFrame(updateLoop);

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

      energyRef.current = Math.min(ENERGY_MAX, energyRef.current + ENERGY_REGEN_PER_SEC * dt);
      setEnergy(energyRef.current);

      spawnInterval.current = Math.max(350, spawnInterval.current * Math.pow(DIFFICULTY_RAMP, dt * 60));
      speedMultiplier.current = Math.min(2.7, speedMultiplier.current * Math.pow(1.003, dt * 60));

      scoreRef.current += dt;
      setScore(scoreRef.current);

      ripples.current.forEach((r) => {
        r.radius += RIPPLE_SPEED * dt;
      });
      ripples.current = ripples.current.filter((r) => r.radius < MAX_RIPPLE_RADIUS);

      if (!blinkSpawnedRef.current && scoreRef.current >= 15) {
        blinkSpawnedRef.current = true;
        const o = createBlinkStalker(nextId, maxRadiusRef, speedMultiplier);
        if (o) {
          obstacles.current.push(o);
          blinkAliveRef.current = true;
        }
      }

      spawnTimer.current += dt * 1000;
      if (spawnTimer.current >= spawnInterval.current) {
        spawnTimer.current = 0;
        if (!blinkAliveRef.current) {
          const cluster = Math.random() < 0.25 ? 2 + Math.floor(Math.random() * 2) : 1;
          for (let i = 0; i < cluster; i++) {
            obstacles.current.push(
              spawnObstacle(nextId, maxRadiusRef, speedMultiplier, next2HpCooldownRef, next3HpCooldownRef)
            );
          }
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
            powerCooldownRef.current = 7000;
          }
        }
      }

      const rippleArr = ripples.current;
      let hitCore = false;
      const c = centerRef.current;

      obstacles.current.forEach((o) => {
        if (o.isBlink && (o._dyingMs || 0) > 0) {
          o._dyingMs = Math.max(0, (o._dyingMs || 0) - dtMs);
          return;
        }
        const slow = o._slowTimer || 0;
        if (slow > 0) o._slowTimer = Math.max(0, slow - dt);
        const speedNow = o.speed * (o._slowTimer && o._slowTimer > 0 ? 0.55 : 1);
        o.radius -= speedNow * dt;
        if (!o.hitBy) o.hitBy = new Set<number>();

        if (o.isBlink) {
          o._postSpawnMs = Math.max(0, (o._postSpawnMs || 0) - dtMs);
          if (!o._pendingTeleport) {
            o._teleportCdMs = Math.max(0, (o._teleportCdMs || 0) - dtMs);
          } else {
            o._preTeleMs = Math.max(0, (o._preTeleMs || 0) - dtMs);
            if ((o._preTeleMs || 0) <= 0) {
              const ok = attemptBlinkTeleport(o, c);
              if (ok) {
                o._pendingTeleport = false;
                o._postSpawnMs = BLINK_POST_SPAWN_MS;
                o._teleportCdMs = BLINK_TELEPORT_COOLDOWN_MS;
              } else {
                o._pendingTeleport = false;
                o._teleportCdMs = BLINK_TELEPORT_COOLDOWN_MS;
              }
            }
          }
          if ((o._teleportCdMs || 0) <= 0 && !o._pendingTeleport) {
            o._pendingTeleport = true;
            o._preTeleMs = BLINK_PRE_TELE_MS;
          }
        }

        const x = c.x + Math.cos(o.angle) * o.radius;
        const y = c.y + Math.sin(o.angle) * o.radius;
        const qNow = getQuadrantFromPoint(c, x, y);

        let damagedThisFrame = false;

        for (let i = 0; i < rippleArr.length; i++) {
          const r = rippleArr[i];
          const radialDiff = Math.abs(o.radius - r.radius);
          if (radialDiff < RIPPLE_THICKNESS) {
            const strength = 1 - radialDiff / RIPPLE_THICKNESS;
            const active = r.type === "full" || (r.type === "quarter" && r.quadrant === qNow);
            if (active) {
              let pushBase = r.type === "full" ? PUSHBACK_FULL : PUSHBACK_QUAD;
              if (o.tough) pushBase *= o.maxHp === 3 ? TOUGH_PUSH_MULT * PUSH_MULT_HP3 : TOUGH_PUSH_MULT;
              const push = pushBase * strength * dt;
              o.radius += push;

              if (!damagedThisFrame && !o.hitBy.has(r.id)) {
                o.hp -= 1;
                o.hitBy.add(r.id);
                damagedThisFrame = true;
                o._slowTimer = 0.5;
                o._origSpeed = o._origSpeed || o.speed;
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

        const noCollisionNow = (o._preTeleMs || 0) > 0;
        if (!noCollisionNow && o.radius <= CORE_RADIUS + o.size * 0.5) {
          if (o.isPower) {
            energyRef.current = Math.max(0, energyRef.current - 5);
            setEnergy(energyRef.current);
            o.hp = 0;
          } else {
            hitCore = true;
          }
        }
      });

      obstacles.current = obstacles.current.filter(
        (o) => o.radius > 0 && o.radius < maxRadiusRef.current + 200 && (o.hp > 0 || (o.isBlink && (o._dyingMs || 0) > 0))
      );
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
    },
    [params.best, params.saveBest]
  );

  useEffect(() => {
    params.rafId.current = requestAnimationFrame(updateLoop);
    return () => {
      if (params.rafId.current != null) cancelAnimationFrame(params.rafId.current);
    };
  }, [updateLoop]);
}
