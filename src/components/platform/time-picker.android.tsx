import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { T } from '@/components/ui';
import { font, radius, useTheme } from '@/theme';

/** Times in the app are Delhi time (IST, UTC+5:30, no DST). */
const IST = 330 * 60e3;
const DAY = 86400e3;
const ITEM = 40;
const VISIBLE = 5;
const DAYS = 7;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Start of the IST day containing `ms`, as an epoch. */
const dayStart = (ms: number) => Math.floor((ms + IST) / DAY) * DAY - IST;

/** Android: an iOS-style wheel (day · hour · minute) in place of the SwiftUI date picker. */
export function TimePicker({ value, now, onChange }: { value: number | null; now: number; onChange: (ms: number) => void; scheme: 'light' | 'dark' }) {
  const { c } = useTheme();
  const min = now - 3600e3;
  const at = Math.max(value ?? now, min);
  const today = dayStart(now);
  const dayIdx = Math.min(DAYS - 1, Math.max(0, Math.round((dayStart(at) - today) / DAY)));
  const hour = Math.floor((at - dayStart(at)) / 3600e3);
  const minute = Math.floor((at - dayStart(at)) / 60e3) % 60;

  const days = useMemo(
    () =>
      Array.from({ length: DAYS }, (_, i) => {
        if (i === 0) return 'Today';
        if (i === 1) return 'Tomorrow';
        const d = new Date(today + i * DAY + IST);
        return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
      }),
    [today],
  );

  const set = (d: number, h: number, m: number) => {
    const next = Math.max(min, today + d * DAY + h * 3600e3 + m * 60e3);
    if (next !== at) onChange(next);
  };

  return (
    <View style={{ width: '100%', height: ITEM * VISIBLE, flexDirection: 'row' }}>
      {/* selection band, like the iOS wheel */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, top: ITEM * 2, height: ITEM, borderRadius: radius.sm, backgroundColor: c.surface2 }}
      />
      <Wheel items={days} index={dayIdx} onIndex={(i) => set(i, hour, minute)} flex={1.6} align="flex-end" />
      <Wheel items={HOURS} index={hour} onIndex={(i) => set(dayIdx, i, minute)} flex={0.8} align="flex-end" />
      <Wheel items={MINUTES} index={minute} onIndex={(i) => set(dayIdx, hour, i)} flex={0.8} align="flex-start" />
    </View>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));

function Wheel({ items, index, onIndex, flex, align }: { items: string[]; index: number; onIndex: (i: number) => void; flex: number; align: 'flex-start' | 'flex-end' }) {
  const { c } = useTheme();
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const shown = useRef(index);
  const settled = useRef(true);

  // follow external changes (e.g. clamped to the earliest allowed time)
  useEffect(() => {
    if (settled.current && shown.current !== index) {
      shown.current = index;
      ref.current?.scrollTo({ y: index * ITEM, animated: true });
    }
  }, [index]);

  const end = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    settled.current = true;
    const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM)));
    if (i !== shown.current) {
      shown.current = i;
      Haptics.selectionAsync().catch(() => {});
      onIndex(i);
    }
  };

  return (
    <ScrollView
      ref={ref}
      style={{ flex }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM}
      decelerationRate="fast"
      nestedScrollEnabled
      onLayout={() => ref.current?.scrollTo({ y: index * ITEM, animated: false })}
      onScrollBeginDrag={() => (settled.current = false)}
      onMomentumScrollEnd={end}
      contentContainerStyle={{ paddingVertical: ITEM * 2 }}>
      {items.map((label, i) => (
        <View key={i} style={{ height: ITEM, justifyContent: 'center', alignItems: align, paddingHorizontal: 10 }}>
          <T
            v="body"
            color={i === index ? c.text : c.text3}
            style={{ fontFamily: i === index ? font.semibold : font.regular, fontVariant: ['tabular-nums'] }}>
            {label}
          </T>
        </View>
      ))}
    </ScrollView>
  );
}
