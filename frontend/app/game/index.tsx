import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions, GestureResponderEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Rect, G, Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import { useRouter } from "expo-router";
import { useAppearanceStore } from "../../src/store/useAppearance";
import { useAudioStore } from "../../src/store/useAudio";
import HUD from "./HUD";
import {
  COLORS,
  CORE_RADIUS,
  ENERGY_MAX,
  COST_QUAD,
  COST_FULL,
  CENTER_TAP_RADIUS,
  COOLDOWN_QUAD_MS,
  COOLDOWN_FULL_MS,
  BASE_SPAWN_INTERVAL,
  SFX_FULL_URI,
  SFX_QUAD_URI,
  HP_BAR_W,
  HP_BAR_H,
  HP_BAR_OFFSET,
  BLINK_DEATH_MS,
} from "./constants";
import {
  Quadrant,
  Obstacle,
  getQuadrantFromPoint,
  getAnglesForQuadrant,
} from "./obstacles";
import { useGameLoop } from "./loop";

interface Ripple {
  id: number;
  radius: number;
  type: "full" | "quarter";
  quadrant?: Quadrant;
  startAngle?: number;
  endAngle?: number;
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
  const playClick = () => { if (!sfxEnabled) return; try { clickSoundRef.current?.replayAsync(); } catch {} };

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

  useGameLoop({
    centerRef,
    maxRadiusRef,
    ripples,
    obstacles,
    nextId,
    scoreRef,
    setScore,
    best,
    setBest,
    saveBest,
    energyRef,
    setEnergy,
    pausedRef,
    gameOverRef,
    cooldownRef,
    next2HpCooldownRef,
    next3HpCooldownRef,
    powerCooldownRef,
    spawnTimer,
    spawnInterval,
    speedMultiplier,
    blinkSpawnedRef,
    blinkAliveRef,
    setGameOver,
    setPaused,
    lastTime,
    rafId,
    explosionRef,
    failedRef,
    gameBgmRef,
  });


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
      const q = getQuadrantFromPoint(centerRef.current, x, y);
      const { start, end } = getAnglesForQuadrant(q);
      ripples.current.push({ id: nextId.current++, radius: CORE_RADIUS, type: "quarter", quadrant: q, startAngle: start, endAngle: end });
      cooldownRef.current = COOLDOWN_QUAD_MS;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try { quadSoundRef.current?.replayAsync(); } catch {}
    }
  }, []);


  useEffect(() => {
    (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const full = await Audio.Sound.createAsync({ uri: SFX_FULL_URI }, { shouldPlay: false, volume: sfxEnabled ? 0.9 : 0 });
        const quad = await Audio.Sound.createAsync({ uri: SFX_QUAD_URI }, { shouldPlay: false, volume: sfxEnabled ? 0.7 : 0 });
        const click = await Audio.Sound.createAsync(require("../../assets/audio/button-click.mp3"), { shouldPlay: false, volume: sfxEnabled ? 0.8 : 0 });
        const explosion = await Audio.Sound.createAsync(require("../../assets/audio/explosion.mp3"), { shouldPlay: false, volume: sfxEnabled ? 0.9 : 0 });
        const failed = await Audio.Sound.createAsync(require("../../assets/audio/failed.mp3"), { shouldPlay: false, volume: sfxEnabled ? 0.9 : 0 });
        const bgm = await Audio.Sound.createAsync(require("../../assets/audio/game-bgm.mp3"), { shouldPlay: musicEnabled, isLooping: true, volume: musicEnabled ? 0.55 : 0 });
        fullSoundRef.current = full.sound;
        quadSoundRef.current = quad.sound;
        clickSoundRef.current = click.sound;
        explosionRef.current = explosion.sound;
        failedRef.current = failed.sound;
        gameBgmRef.current = bgm.sound;
      } catch {}
    })();

    return () => {
      try { fullSoundRef.current?.unloadAsync(); } catch {}
      try { quadSoundRef.current?.unloadAsync(); } catch {}
      try { clickSoundRef.current?.unloadAsync(); } catch {}
      try { explosionRef.current?.unloadAsync(); } catch {}
      try { failedRef.current?.unloadAsync(); } catch {}
      try { gameBgmRef.current?.stopAsync(); } catch {}
      try { gameBgmRef.current?.unloadAsync(); } catch {}
      fullSoundRef.current = null;
      quadSoundRef.current = null;
      clickSoundRef.current = null;
      explosionRef.current = null;
      failedRef.current = null;
      gameBgmRef.current = null;
    };
  }, [musicEnabled, sfxEnabled]);

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
      <HUD
        top={insets.top}
        score={finalScore}
        energyPct={energyPct}
        paused={paused}
        onPause={() => setPaused((p) => !p)}
        playClick={playClick}
      />

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