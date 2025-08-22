import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Rect, G, Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";

const COLORS = {
  bg: "#000000",
  neonBlue: "#00FFFF",
  neonPink: "#FF00FF",
  neonPurple: "#AA00FF",
  white: "#FFFFFF",
};

const CORE_RADIUS = 16; // center orb radius px
const MAX_RIPPLE_RADIUS = 600; // max ripple radius
const RIPPLE_SPEED = 400; // px per second
const RIPPLE_THICKNESS = 16;

const BASE_OBSTACLE_SPEED = 70; // px/s initial
const BASE_SPAWN_INTERVAL = 1200; // ms initial
const DIFFICULTY_RAMP = 0.995; // per second multiplier for interval and 1.003 for speed

interface Ripple {
  id: number;
  radius: number;
}

type Shape = "circle" | "square";
interface Obstacle {
  id: number;
  angle: number; // radians from center
  radius: number; // distance from center
  speed: number; // inward speed px/s
  size: number; // visual size
  shape: Shape;
}

export default function Game() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
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
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);

  const lastTime = useRef<number | null>(null);
  const spawnTimer = useRef(0);
  const spawnInterval = useRef(BASE_SPAWN_INTERVAL);
  const speedMultiplier = useRef(1);
  const rafId = useRef<number | null>(null);

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
    lastTime.current = null;
    spawnTimer.current = 0;
    spawnInterval.current = BASE_SPAWN_INTERVAL;
    speedMultiplier.current = 1;
    setGameOver(false);
    setPaused(false);
  }, []);

  const onTap = useCallback(() => {
    if (pausedRef.current || gameOverRef.current) return;
    ripples.current.push({ id: nextId.current++, radius: CORE_RADIUS });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const spawnObstacle = () => {
    const angle = Math.random() * Math.PI * 2;
    const radius = maxRadiusRef.current;
    const size = 10 + Math.random() * 12;
    const shape: Shape = Math.random() > 0.5 ? "circle" : "square";
    obstacles.current.push({ id: nextId.current++, angle, radius, size, shape, speed: BASE_OBSTACLE_SPEED * speedMultiplier.current });
  };

  const updateLoop = useCallback((t: number) => {
    // Single, stable RAF loop. Always schedule next frame via ref.
    rafId.current = requestAnimationFrame(updateLoop);

    if (pausedRef.current || gameOverRef.current) {
      // Freeze delta to avoid big dt spikes on resume
      lastTime.current = t;
      return;
    }

    if (lastTime.current == null) lastTime.current = t;
    const dt = Math.min(64, t - lastTime.current) / 1000; // seconds, clamp
    lastTime.current = t;

    // Difficulty ramp
    spawnInterval.current = Math.max(350, spawnInterval.current * Math.pow(DIFFICULTY_RAMP, dt * 60));
    speedMultiplier.current = Math.min(2.5, speedMultiplier.current * Math.pow(1.003, dt * 60));

    // Update score
    scoreRef.current += dt;
    setScore(scoreRef.current);

    // Update ripples
    ripples.current.forEach((r) => {
      r.radius += RIPPLE_SPEED * dt;
    });
    ripples.current = ripples.current.filter((r) => r.radius < MAX_RIPPLE_RADIUS);

    // Spawn obstacles
    spawnTimer.current += dt * 1000;
    if (spawnTimer.current >= spawnInterval.current) {
      spawnTimer.current = 0;
      spawnObstacle();
    }

    // Update obstacles movement and collisions
    const rippleArr = ripples.current;
    let hitCore = false;
    obstacles.current.forEach((o) => {
      // Inward movement
      o.radius -= o.speed * dt;
      // Ripple interaction
      for (let i = 0; i < rippleArr.length; i++) {
        const r = rippleArr[i];
        const diff = Math.abs(o.radius - r.radius);
        if (diff < RIPPLE_THICKNESS) {
          const strength = 1 - diff / RIPPLE_THICKNESS; // 0..1
          o.radius += 140 * strength * dt; // pushback
        }
      }
      // Check core collision
      if (o.radius <= CORE_RADIUS + o.size * 0.5) hitCore = true;
    });

    obstacles.current = obstacles.current.filter((o) => o.radius > 0 && o.radius < maxRadiusRef.current + 40);

    if (hitCore) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
    rafId.current = requestAnimationFrame(updateLoop);
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, [updateLoop]);

  const finalScore = Math.floor(score);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {/* HUD */}
      <View style={styles.hud}>
        <Text style={styles.score}>Score: {finalScore}</Text>
        <Pressable accessibilityRole="button" onPress={() => setPaused((p) => !p)} style={styles.pauseBtn}>
          <Text style={styles.pauseText}>{paused ? "Resume" : "Pause"}</Text>
        </Pressable>
      </View>

      {/* Tap Layer */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onTap}>
        <Svg width={size.w} height={size.h}>
          {/* Ripples */}
          {ripples.current.map((r) => (
            <Circle key={r.id} cx={center.x} cy={center.y} r={r.radius} stroke={COLORS.neonBlue} strokeOpacity={0.7} strokeWidth={2} fill="none" />
          ))}

          {/* Core */}
          <Circle cx={center.x} cy={center.y} r={CORE_RADIUS} fill={COLORS.neonPink} />

          {/* Obstacles */}
          <G>
            {obstacles.current.map((o) => {
              const x = center.x + Math.cos(o.angle) * o.radius;
              const y = center.y + Math.sin(o.angle) * o.radius;
              if (o.shape === "circle") {
                return <Circle key={o.id} cx={x} cy={y} r={o.size} fill={COLORS.neonPurple} />;
              }
              return <Rect key={o.id} x={x - o.size} y={y - o.size} width={o.size * 2} height={o.size * 2} fill={COLORS.neonBlue} />;
            })}
          </G>
        </Svg>
      </Pressable>

      {/* Overlays */}
      {paused && !gameOver && (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>Paused</Text>
          <View style={styles.overlayButtons}>
            <Pressable style={[styles.overlayBtn, { borderColor: COLORS.neonBlue }]} onPress={() => setPaused(false)}>
              <Text style={styles.overlayBtnText}>Resume</Text>
            </Pressable>
            <Pressable style={[styles.overlayBtn, { borderColor: COLORS.neonPink }]} onPress={reset}>
              <Text style={styles.overlayBtnText}>Restart</Text>
            </Pressable>
            <Pressable style={[styles.overlayBtn, { borderColor: "#666" }]} onPress={() => router.replace("/") }>
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
    top: 12,
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  score: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "700",
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
    width: "100%",
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