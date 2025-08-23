import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppearanceStore } from "../src/store/useAppearance";
import { useRouter } from "expo-router";

const COLORS = {
  bg: "#000000",
  white: "#FFFFFF",
  gray: "#888",
};

const PALETTE = [
  "#00FFFF", // neon blue
  "#FF00FF", // neon pink
  "#AA00FF", // purple
  "#FFD400", // yellow
  "#00FF7F", // spring green
  "#FF6B6B", // coral red
  "#7CFC00", // lawn green
  "#1E90FF", // dodger blue
  "#FF8C00", // dark orange
  "#FFFFFF", // white
];

function ColorRow({
  title,
  selected,
  onSelect,
}: { title: string; selected: string; onSelect: (c: string) => void }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.swatchRow}>
        {PALETTE.map((c) => {
          const active = selected.toLowerCase() === c.toLowerCase();
          return (
            <Pressable
              key={c}
              onPress={() => onSelect(c)}
              style={({ pressed }) => [
                styles.swatch,
                {
                  backgroundColor: c,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                  borderColor: active ? "#fff" : "#333",
                  borderWidth: active ? 3 : 1,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function Customize() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    colorFull,
    colorQuarter,
    colorCore,
    setColorFull,
    setColorQuarter,
    setColorCore,
    reset,
  } = useAppearanceStore();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}> 
      <View style={styles.headerRow}>
        <Text style={styles.title}>Customization</Text>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <Text style={styles.headerBtnText}>Back</Text>
        </Pressable>
      </View>

      {/* Preview */}
      <View style={styles.previewBox}>
        <Text style={styles.previewLabel}>Preview</Text>
        <View style={styles.previewCircleWrap}>
          <View style={[styles.previewCore, { backgroundColor: colorCore }]} />
          <View style={[styles.previewRing, { borderColor: colorQuarter }]} />
          <View style={[styles.previewRingBig, { borderColor: colorFull }]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <ColorRow title="Full Wave Color" selected={colorFull} onSelect={setColorFull} />
        <ColorRow title="Quadrant Wave Color" selected={colorQuarter} onSelect={setColorQuarter} />
        <ColorRow title="Core Color" selected={colorCore} onSelect={setColorCore} />

        <Pressable style={[styles.resetBtn]} onPress={reset}>
          <Text style={styles.resetBtnText}>Reset to Defaults</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: "800",
  },
  headerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#444",
  },
  headerBtnText: {
    color: COLORS.white,
    fontWeight: "700",
  },
  previewBox: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 12,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    marginBottom: 16,
  },
  previewLabel: {
    color: COLORS.gray,
    marginBottom: 8,
  },
  previewCircleWrap: {
    height: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  previewCore: {
    width: 20,
    height: 20,
    borderRadius: 10,
    position: "absolute",
  },
  previewRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
  },
  previewRingBig: {
    width: 120,
    height: 120,
    borderRadius: 60,
    position: "absolute",
    borderWidth: 2,
  },
  sectionTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  swatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  swatch: {
    width: 38,
    height: 38,
    borderRadius: 8,
  },
  resetBtn: {
    marginTop: 8,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#555",
  },
  resetBtnText: {
    color: COLORS.white,
    fontWeight: "700",
  },
});