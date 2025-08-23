import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AudioState {
  musicEnabled: boolean;
  sfxEnabled: boolean;
  setMusicEnabled: (v: boolean) => void;
  setSfxEnabled: (v: boolean) => void;
  toggleMusic: () => void;
  toggleSfx: () => void;
}

export const useAudioStore = create<AudioState>()(
  persist(
    (set, get) => ({
      musicEnabled: true,
      sfxEnabled: true,
      setMusicEnabled: (v) => set({ musicEnabled: v }),
      setSfxEnabled: (v) => set({ sfxEnabled: v }),
      toggleMusic: () => set({ musicEnabled: !get().musicEnabled }),
      toggleSfx: () => set({ sfxEnabled: !get().sfxEnabled }),
    }),
    {
      name: 'audio_prefs',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ musicEnabled: state.musicEnabled, sfxEnabled: state.sfxEnabled }),
    }
  )
);
