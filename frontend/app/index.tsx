import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const COLORS = {
  bg: "#000000",
  neonBlue: "#00FFFF",
  neonPink: "#FF00FF",
  neonPurple: "#AA00FF",
  white: "#FFFFFF",
};

export default function Index() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // Potential splash or intro hooks
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <StatusBar style="light" />

      <Text style={styles.title}>Echo Tap</Text>
      <Text style={styles.subtitle}>Push the echoes. Survive the wave.</Text>

      <View style={styles.buttons}>
        <Pressable accessibilityRole="button" onPress={() => router.push("/game")}
          style={({ pressed }) => [styles.button, { borderColor: COLORS.neonBlue, opacity: pressed ? 0.8 : 1 }]}>
          <Text style={styles.buttonText}>Play</Text>
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => router.push("/settings")}
          style={({ pressed }) => [styles.button, { borderColor: COLORS.neonPink, opacity: pressed ? 0.8 : 1 }]}>
          <Text style={styles.buttonText}>Settings</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>One-tap to ripple • {Platform.OS.toUpperCase()}</Text>
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
  title: {
    marginTop: 48,
    color: COLORS.white,
    fontSize: 48,
    fontWeight: "800",
    textShadowColor: COLORS.neonBlue,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
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
  button: {
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "700",
  },
  footer: {
    color: "#888",
    marginBottom: 24,
  },
});