import { router } from 'expo-router';
import { View } from 'react-native';

import { Icon, Press, T } from '@/components/ui';
import { lineLabel } from '@/lib/network';
import { disruptedLines, useStatus } from '@/store/status';
import { radius, useTheme } from '@/theme';

/**
 * Line disruptions, and only line disruptions. Renders nothing while every line
 * is running normally — "all good" is not worth a card.
 */
export function ServiceAlerts({ style }: { style?: object }) {
  const { c } = useTheme();
  const lines = useStatus((s) => s.lines);
  const bad = disruptedLines(lines);
  if (!bad.length) return null;
  return (
    <View style={[{ backgroundColor: c.dangerSoft, borderRadius: radius.md, paddingHorizontal: 14 }, style]}>
      {bad.map((l, i) => (
        <Press
          key={l.id}
          onPress={() => router.push({ pathname: '/line/[id]', params: { id: l.id } })}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 12,
            borderTopWidth: i ? 0.5 : 0,
            borderTopColor: c.danger + '33',
          }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: l.color }} />
          <T v="bodyStrong" color={c.danger} style={{ flex: 1 }} numberOfLines={1}>
            {lineLabel(l)}
          </T>
          <T v="label" color={c.danger} numberOfLines={1} style={{ maxWidth: '50%' }}>
            {lines[l.id]}
          </T>
          <Icon name="chevron.right" size={11} color={c.danger} />
        </Press>
      ))}
    </View>
  );
}
