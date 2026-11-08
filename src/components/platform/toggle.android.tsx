import { useEffect, useState } from 'react';
import { Animated, Pressable } from 'react-native';

import { useTheme } from '@/theme';

const W = 51;
const H = 31;
const KNOB = 27;

/** Android: an iOS-style switch (the stock Switch is Material). */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string; scheme: 'light' | 'dark' }) {
  const { dark } = useTheme();
  const [anim] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    Animated.spring(anim, { toValue: value ? 1 : 0, useNativeDriver: false, bounciness: 4, speed: 18 }).start();
  }, [value, anim]);
  const off = dark ? '#39393D' : '#E9E9EA';
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      hitSlop={8}>
      <Animated.View
        style={{
          width: W,
          height: H,
          borderRadius: H / 2,
          padding: 2,
          backgroundColor: anim.interpolate({ inputRange: [0, 1], outputRange: [off, '#34C759'] }),
        }}>
        <Animated.View
          style={{
            width: KNOB,
            height: KNOB,
            borderRadius: KNOB / 2,
            backgroundColor: '#FFFFFF',
            elevation: 2,
            transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, W - KNOB - 4] }) }],
          }}
        />
      </Animated.View>
    </Pressable>
  );
}
