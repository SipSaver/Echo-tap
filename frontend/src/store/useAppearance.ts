import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type AppearanceState = {
  colorFull: string;
  colorQuarter: string;
  colorCore: string;
  setColorFull: (c: string) => void;
  setColorQuarter: (c: string) => void;
  setColorCore: (c: string) => void;
  reset: () => void;
};

const DEFAULTS = {
  colorFull: "#00FFFF", // neon blue
  colorQuarter: "#00FFFF",
  colorCore: "#FF00FF", // neon pink
};

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setColorFull: (c) => set({ colorFull: c }),
      setColorQuarter: (c) => set({ colorQuarter: c }),
      setColorCore: (c) => set({ colorCore: c }),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: "echo_appearance",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    }
  )
);