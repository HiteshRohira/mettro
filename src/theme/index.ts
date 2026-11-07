import { useColorScheme } from 'react-native';
import { useSettings } from '@/store/settings';

export const palette = {
  light: {
    bg: '#F4F5F7',
    surface: '#FFFFFF',
    surface2: '#F0F1F4',
    border: '#E3E5EA',
    text: '#0E1116',
    text2: '#5B6270',
    text3: '#8A909C',
    accent: '#2A5BD7',
    accentSoft: '#E8EEFC',
    success: '#1F9D55',
    successSoft: '#E6F6EC',
    warn: '#C27803',
    warnSoft: '#FDF3E1',
    danger: '#D92D20',
    dangerSoft: '#FDECEA',
    ink: '#0E1116',
    onInk: '#FFFFFF',
  },
  dark: {
    bg: '#0A0C10',
    surface: '#14171D',
    surface2: '#1C2027',
    border: '#262B34',
    text: '#F3F4F6',
    text2: '#A3A9B5',
    text3: '#6E7584',
    accent: '#6C93FF',
    accentSoft: '#18213A',
    success: '#3CCB7F',
    successSoft: '#10281C',
    warn: '#F0B44C',
    warnSoft: '#2C220F',
    danger: '#FF6B5E',
    dangerSoft: '#2E1513',
    ink: '#F3F4F6',
    onInk: '#0A0C10',
  },
};

export type Colors = typeof palette.light;

export function useTheme() {
  const system = useColorScheme();
  const pref = useSettings((s) => s.appearance);
  const scheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  return { c: palette[scheme], scheme, dark: scheme === 'dark' } as const;
}

export const font = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
  heavy: 'Inter-ExtraBold',
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
export const space = (n: number) => n * 4;
