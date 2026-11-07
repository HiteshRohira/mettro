import { router } from 'expo-router';
import { View } from 'react-native';

import { Card, Divider, Icon, Press, T } from '@/components/ui';
import { ago } from '@/lib/format';
import { LINES, lineLabel } from '@/lib/network';
import { isNormal, useStatus } from '@/store/status';
import { useTheme } from '@/theme';

export function StatusSummary({ compact }: { compact?: boolean }) {
  const { c } = useTheme();
  const { lines, checkedAt, error, loading } = useStatus();
  const bad = LINES.filter((l) => !isNormal(lines[l.id]));
  const show = compact ? (bad.length ? bad : []) : LINES;
  return (
    <Card pad={0} style={{ paddingHorizontal: 14 }}>
      {compact && !bad.length ? (
        <View style={{ paddingVertical: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="checkmark.seal.fill" size={20} color={c.success} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">All {LINES.length} lines running normally</T>
              <T v="caption" dim>
                {error && !checkedAt ? 'Offline — showing last known status' : `Updated ${ago(checkedAt)} from DMRC`}
                {loading ? ' · refreshing…' : ''}
              </T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {LINES.map((l) => (
              <Press key={l.id} onPress={() => router.push({ pathname: '/line/[id]', params: { id: l.id } })}>
                <View style={{ height: 6, width: 22, borderRadius: 3, backgroundColor: l.color }} />
              </Press>
            ))}
          </View>
        </View>
      ) : (
        show.map((l, i) => {
          const s = lines[l.id] ?? 'Unknown';
          const ok = isNormal(s);
          return (
            <View key={l.id}>
              {i > 0 ? <Divider inset={20} /> : null}
              <Press
                onPress={() => router.push({ pathname: '/line/[id]', params: { id: l.id } })}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 }}>
                <View style={{ width: 8, height: 26, borderRadius: 4, backgroundColor: l.color }} />
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong">{lineLabel(l)}</T>
                  <T v="caption" dim numberOfLines={1}>
                    {l.start} ↔ {l.end}
                  </T>
                </View>
                <T v="label" color={ok ? c.success : c.danger}>
                  {s}
                </T>
              </Press>
            </View>
          );
        })
      )}
    </Card>
  );
}
