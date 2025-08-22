import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Dimensions, Image } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, G, Rect } from "react-native-svg";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, interpolateColor, Easing } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

const COLORS = {
  bg: "#000000",
  neonBlue: "#00FFFF",
  neonPink: "#FF00FF",
  neonPurple: "#AA00FF",
  white: "#FFFFFF",
};

type Particle = {
  id: number;
  angle: number; // radians
  radius: number; // distance from center
  speed: number; // inward px/s
  size: number;
  shape: "circle" | "square";
  color: string;
  opacity: number;
};

type Ripple = { id: number; x: number; y: number; r: number; maxR: number; alpha: number; grow: number };

export default function Index() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ w: Dimensions.get("window").width, h: Dimensions.get("window").height });
  const center = useMemo(() => ({ x: size.w / 2, y: size.h / 2 }), [size]);
  const maxR = useMemo(() => Math.hypot(center.x, center.y), [center]);

  // Background particles and ripples
  const raf = useRef<number | null>(null);
  const particles = useRef<Particle[]>([]);
  const ripples = useRef<Ripple[]>([]);
  const nid = useRef(1);
  const last = useRef<number | null>(null);
  const drawAccum = useRef(0); // ms accumulator for re-render throttling
  const centerRippleTimer = useRef(0);
  const [, setTick] = useState(0);

  const addRipple = useCallback(
    (x: number, y: number, small = false) => {
      ripples.current.push({ id: nid.current++, x, y, r: 0, maxR: small ? 120 : Math.max(size.w, size.h), alpha: small ? 0.5 : 0.25, grow: small ? 420 : 280 });
      if (ripples.current.length > 10) ripples.current.shift();
    },
    [size.w, size.h]
  );

  const ensureParticles = useCallback(() => {
    const CAP = 24; // increased density
    if (particles.current.length >= CAP) return;
    const need = CAP - particles.current.length;
    for (let i = 0; i < need; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = maxR + 60 + Math.random() * 80;
      const sizePx = 4 + Math.random() * 8;
      const shape = Math.random() > 0.5 ? "circle" : "square";
      const color = Math.random() > 0.5 ? COLORS.neonBlue : COLORS.neonPurple;
      const speed = 24 + Math.random() * 22; // faster background drift
      const opacity = 0.15 + Math.random() * 0.1;
      particles.current.push({ id: nid.current++, angle, radius, size: sizePx, shape, color, speed, opacity });
    }
  }, [maxR]);

  const loop = useCallback(
    (ts: number) => {
      raf.current = requestAnimationFrame(loop);
      if (last.current == null) last.current = ts;
      const dtMs = Math.min(64, ts - last.current);
      const dt = dtMs / 1000;
      last.current = ts;

      // periodic center ripple
      centerRippleTimer.current += dt;
      if (centerRippleTimer.current >= 2.2) {
        centerRippleTimer.current = 0;
        addRipple(center.x, center.y, false);
      }

      // update ripples
      ripples.current.forEach((r) => {
        r.r += r.grow * dt;
        r.alpha = Math.max(0, r.alpha - dt * 0.25);
      });
      ripples.current = ripples.current.filter((r) => r.r < r.maxR && r.alpha > 0.02);

      // update particles
      ensureParticles();
      particles.current.forEach((p) => {
        p.radius -= p.speed * dt;
        if (p.radius < 20) {
          // respawn outward
          p.angle = Math.random() * Math.PI * 2;
          p.radius = maxR + 60 + Math.random() * 80;
          p.size = 4 + Math.random() * 8;
          p.shape = Math.random() > 0.5 ? "circle" : "square";
          p.color = Math.random() > 0.5 ? COLORS.neonBlue : COLORS.neonPurple;
          p.speed = 24 + Math.random() * 22; // keep fast on respawn
          p.opacity = 0.15 + Math.random() * 0.1;
        }
      });

      // throttle re-render ~30fps to update SVG
      drawAccum.current += dtMs;
      if (drawAccum.current >= 33) {
        drawAccum.current = 0;
        setTick((v) => (v + 1) % 1000000);
      }
    },
    [addRipple, center.x, center.y, ensureParticles, maxR]
  );

  // Run the animation loop only when this screen is focused
  useFocusEffect(
    useCallback(() => {
      raf.current = requestAnimationFrame(loop);
      return () => {
        if (raf.current) cancelAnimationFrame(raf.current);
        raf.current = null;
        last.current = null; // reset timing to avoid huge dt on resume
      };
    }, [loop])
  );

  // Title: Color Cycling + Breathing Glow (no textShadow props on native)
  const colorPhase = useSharedValue(0);
  const breathe = useSharedValue(0);
  useEffect(() => {
    colorPhase.value = withRepeat(withTiming(1, { duration: 12000, easing: Easing.linear }), -1, false);
    breathe.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [colorPhase, breathe]);

  const colorStyle = useAnimatedStyle(() => {
    const c = interpolateColor(colorPhase.value, [0, 0.33, 0.66, 1], [COLORS.neonBlue, COLORS.neonPink, COLORS.neonPurple, COLORS.neonBlue]);
    return { color: c } as any;
  });

  // Glow layer behind (native: scale/opacity pulse; web: CSS textShadow)
  const glowStyle = useAnimatedStyle(() => {
    const c = interpolateColor(colorPhase.value, [0, 0.33, 0.66, 1], [COLORS.neonBlue, COLORS.neonPink, COLORS.neonPurple, COLORS.neonBlue]);
    const intensity = 0.4 + 0.4 * breathe.value; // 0.4..0.8
    if (Platform.OS === "web") {
      const radius = 8 + 12 * breathe.value; // 8..20px
      return { color: c, opacity: 1, textShadow: `0px 0px ${radius}px ${c}` } as any;
    }
    // Native: duplicate text behind, scaled & translucent as glow
    const scale = 1 + 0.04 * breathe.value;
    return { color: c, opacity: intensity, transform: [{ scale }] } as any;
  });

  // Play button ripple
  const playBtnLayout = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const onPlayPress = useCallback(() => {
    const l = playBtnLayout.current;
    if (l) {
      addRipple(l.x + l.w / 2, l.y + l.h / 2, true);
      setTimeout(() => router.push("/game"), 120);
    } else {
      router.push("/game");
    }
  }, [router, addRipple]);

  // Background tap reaction (small ripple)
  const onBgPress = useCallback(
    (evt: any) => {
      if (!evt?.nativeEvent) return;
      const { locationX, locationY } = evt.nativeEvent;
      addRipple(locationX, locationY, true);
    },
    [addRipple]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <StatusBar style="light" />

      {/* Background Animated Canvas */}
      <Pressable onPress={onBgPress} style={StyleSheet.absoluteFill}>
        <Svg width={size.w} height={size.h}>
          {/* expanding ripples */}
          <G>
            {ripples.current.map((r) => (
              <Circle key={r.id} cx={r.x} cy={r.y} r={r.r} stroke={COLORS.neonBlue} strokeOpacity={r.alpha} strokeWidth={2} fill="none" />
            ))}
          </G>
          {/* subtle floating particles */}
          <G opacity={0.9}>
            {particles.current.map((p) => {
              const x = center.x + Math.cos(p.angle) * p.radius;
              const y = center.y + Math.sin(p.angle) * p.radius;
              if (p.shape === "circle") return <Circle key={p.id} cx={x} cy={y} r={p.size} fill={p.color} opacity={p.opacity} />;
              return <Rect key={p.id} x={x - p.size} y={y - p.size} width={p.size * 2} height={p.size * 2} fill={p.color} opacity={p.opacity} />;
            })}
          </G>
        </Svg>
      </Pressable>

      {/* Animated Title */}
      <View style={styles.titleWrap}>
        {/* Glow layer behind (positioned absolutely) */}
        <Animated.Text pointerEvents="none" style={[styles.title, styles.titleGlow, glowStyle]}>Echo Tap</Animated.Text>
        {/* Main colored text */}
        <Animated.Text style={[styles.title, colorStyle]}>Echo Tap</Animated.Text>
      </View>

      <Text style={styles.subtitle}>Push the echoes. Survive the wave.</Text>

      <View style={styles.buttons}>
        {/* Primary Play button (full width) */}
        <Pressable
          accessibilityRole="button"
          onPress={onPlayPress}
          onLayout={(e) => (playBtnLayout.current = e.nativeEvent.layout)}
          style={({ pressed }) => [
            styles.button,
            {
              borderColor: COLORS.neonBlue,
              transform: [{ scale: pressed ? 0.98 : 1 }],
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
            },
          ]}
        >
          <Image source={require("../assets/icons/play.png")} style={styles.icon} resizeMode="contain" />
          <Text style={styles.buttonText}>Play</Text>
        </Pressable>

        {/* Secondary buttons side-by-side */}
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/customize")}
            style={({ pressed }) => [
              styles.smallButton,
              {
                borderColor: COLORS.neonPurple,
                transform: [{ scale: pressed ? 0.98 : 1 }],
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Image source={require("../assets/icons/edit.png")} style={styles.icon} resizeMode="contain" />
            <Text style={styles.buttonText}>Customization</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/settings")}
            style={({ pressed }) => [
              styles.smallButton,
              {
                borderColor: COLORS.neonPink,
                transform: [{ scale: pressed ? 0.98 : 1 }],
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Image source={require("../assets/icons/settings.png")} style={styles.icon} resizeMode="contain" />
            <Text style={styles.buttonText}>Settings</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.footer}>Tap anywhere to preview ripples • {Platform.OS.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleWrap: {
    marginTop: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 48,
    fontWeight: "800",
  },
  titleGlow: {
    position: "absolute",
  },
  subtitle: {
    color: COLORS.neonPurple,
    fontSize: 16,
    marginTop: 8,
  },
  buttons: {
    width: "100%",
    paddingHorizontal: 24,
    gap: 16,
  },
  row: {
    flexDirection: "row",
    gap: 16,
    marginTop: 4,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  smallButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "700",
  },
  icon: {
    width: 24,
    height: 24,
    marginRight: 8,
    tintColor: COLORS.white,
  },
  footer: {
    color: "#888",
    marginBottom: 24,
  },
});