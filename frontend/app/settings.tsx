import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Audio } from "expo-av";

const COLORS = {
  bg: "#000000",
  neonBlue: "#00FFFF",
  neonPink: "#FF00FF",
  neonPurple: "#AA00FF",
  white: "#FFFFFF",
};

export default function Settings() {
  const insets = useSafeAreaInsets();
  const click = useRef<Audio.Sound | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const s = await Audio.Sound.createAsync(require("../assets/audio/button-click.mp3"), { shouldPlay: false, volume: 0.8 });
        if (!mounted) { await s.sound.unloadAsync(); return; }
        click.current = s.sound;
      } catch {}
    })();
    return () => {
      try { click.current?.unloadAsync(); } catch {}
      click.current = null;
    };
  }, []);

  const router = useRouter();
  const [best, setBest] = useState<number>(0);

  const loadBest = useCallback(async () => {
    try {
      const mod = await import("@react-native-async-storage/async-storage");
      const v = await mod.default.getItem("echo_best");
      setBest(v ? parseInt(v, 10) : 0);
    } catch {}
  }, []);

  useEffect(() => {
    loadBest();
  }, [loadBest]);

  const resetHighScore = useCallback(async () => {
    try {
      const mod = await import("@react-native-async-storage/async-storage");
      await mod.default.removeItem("echo_best");
      setBest(0);
      Alert.alert("Reset", "High score cleared.");
    } catch (e) {
      Alert.alert("Error", "Could not reset high score.");
    }
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}> 
      <Text style={styles.header}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Best Score</Text>
        <Text style={styles.value}>{best}</Text>
      </View>

      <Pressable style={[styles.button, { borderColor: COLORS.neonPink }]} onPress={() => { try { click.current?.replayAsync(); } catch {}; resetHighScore(); }}>
        <Text style={styles.buttonText}>Reset High Score</Text>
      </Pressable>

      <Pressable style={[styles.button, { borderColor: COLORS.neonBlue }]} onPress={() => router.back()}>
        <Text style={styles.buttonText}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 20,
    gap: 16,
  },
  header: {
    color: COLORS.white,
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  card: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 12,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  label: {
    color: COLORS.neonPurple,
    fontSize: 14,
  },
  value: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: "700",
    marginTop: 4,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "700",
  },
});