import { useColorScheme } from 'react-native';
import { useSettings } from '@/store/settings';

export const palette = {
  light: {
    bg: '#F6F5F1',
    surface: '#FFFFFF',
    surface2: '#EEEDE8',
    border: '#DDDED8',
    text: '#202724',
    text2: '#626B66',
    text3: '#646F66',
    accent: '#2A5BD7',
    accentSoft: '#E8EEFC',
    success: '#1F9D55',
    successSoft: '#E6F6EC',
    warn: '#C27803',
    warnSoft: '#FDF3E1',
    danger: '#D92D20',
    dangerSoft: '#FDECEA',
    ink: '#202724',
    onInk: '#FFFFFF',
  },
  dark: {
    bg: '#101412',
    surface: '#1A201D',
    surface2: '#252D28',
    border: '#333D36',
    text: '#F0F2ED',
    text2: '#A9B4AC',
    text3: '#87968B',
    accent: '#6C93FF',
    accentSoft: '#18213A',
    success: '#3CCB7F',
    successSoft: '#10281C',
    warn: '#F0B44C',
    warnSoft: '#2C220F',
    danger: '#FF6B5E',
    dangerSoft: '#2E1513',
    ink: '#F0F2ED',
    onInk: '#101412',
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
