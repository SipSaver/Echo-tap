import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import Index from './index';
import { useRouter } from 'expo-router';

// Mock expo router
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

// Mock navigation hooks
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: any) => cb(() => {}),
}));

// Mock native modules with minimal implementations
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: {
      createAsync: jest.fn(() => Promise.resolve({ sound: { unloadAsync: jest.fn(), playAsync: jest.fn(), stopAsync: jest.fn(), replayAsync: jest.fn() } })),
    },
  },
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../src/store/useAudio', () => ({
  useAudioStore: jest.fn(() => ({ musicEnabled: false, sfxEnabled: false })),
}));

// Reanimated mock
jest.mock('react-native-reanimated', () => ({
  useSharedValue: () => ({ value: 0 }),
  useAnimatedStyle: () => ({}),
  withRepeat: jest.fn(),
  withTiming: jest.fn(),
  interpolateColor: jest.fn(),
  Easing: { linear: jest.fn(), inOut: jest.fn(() => jest.fn()) },
}));

// SVG mock
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Circle: 'Circle',
  G: 'G',
  Rect: 'Rect',
}));

describe('Index navigation', () => {
  it('navigates to game screen when Play is pressed', () => {
    const push = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push });

    const { getByText } = render(<Index />);
    fireEvent.press(getByText('Play'));
    expect(push).toHaveBeenCalledWith('/game');
  });
});
