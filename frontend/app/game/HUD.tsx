import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { COLORS } from "./constants";

interface Props {
  top: number;
  score: number;
  energyPct: number;
  paused: boolean;
  onPause: () => void;
  playClick: () => void;
}

export default function HUD({ top, score, energyPct, paused, onPause, playClick }: Props) {
  return (
    <View style={[styles.hud, { top: top + 10 }]}>
      <Text style={styles.score}>Score: {score}</Text>
      <View style={styles.energyWrap}>
        <Text style={styles.energyLabel}>Energy</Text>
        <View style={styles.energyBar}>
          <View style={[styles.energyFill, { width: `${energyPct}%` }]} />
        </View>
        <Text style={styles.energyPct}>{energyPct}%</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() => { playClick(); onPause(); }} style={styles.pauseBtn}>
        <Text style={styles.pauseText}>{paused ? "Resume" : "Pause"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
