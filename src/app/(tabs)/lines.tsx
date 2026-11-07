import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Divider, Icon, Press, T } from '@/components/ui';
import { ago } from '@/lib/format';
import { LINES, lineLabel } from '@/lib/network';
import { isNormal, useStatus } from '@/store/status';
import { useTheme } from '@/theme';

export default function LinesScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { lines, checkedAt, error, refresh } = useStatus();
  const [refreshing, setRefreshing] = useState(false);
  const bad = LINES.filter((l) => !isNormal(lines[l.id]));
  const total = new Set(LINES.flatMap((l) => [...l.stations, ...l.branches.flat()])).size;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refresh();
              setRefreshing(false);
            }}
          />
        }>
        <T v="caption" dim>
          {LINES.length} lines · {total} stations
        </T>
        <T v="display">Lines</T>

        <Card
          style={{
            marginTop: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            backgroundColor: bad.length ? c.dangerSoft : c.successSoft,
            borderColor: 'transparent',
          }}>
          <Icon name={bad.length ? 'exclamationmark.triangle.fill' : 'checkmark.seal.fill'} size={22} color={bad.length ? c.danger : c.success} />
          <View style={{ flex: 1 }}>
            <T v="bodyStrong" color={bad.length ? c.danger : c.success}>
              {bad.length ? `${bad.length} line${bad.length > 1 ? 's' : ''} with disruptions` : 'Normal service on all lines'}
            </T>
            <T v="caption" dim>
              {checkedAt ? `Live from DMRC · updated ${ago(checkedAt)}` : error ? 'Offline — pull to retry' : 'Checking…'}
            </T>
          </View>
        </Card>

        <Card pad={0} style={{ marginTop: 14, paddingHorizontal: 14 }}>
          {LINES.map((l, i) => {
            const st = lines[l.id] ?? 'Unknown';
            const ok = isNormal(st);
            const count = new Set([...l.stations, ...l.branches.flat()]).size;
            return (
              <View key={l.id}>
                {i > 0 ? <Divider inset={22} /> : null}
                <Press
                  onPress={() => router.push({ pathname: '/line/[id]', params: { id: l.id } })}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 }}>
                  <View style={{ width: 10, height: 40, borderRadius: 5, backgroundColor: l.color }} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <T v="h3">{lineLabel(l)}</T>
                      <T v="caption" faint>
                        {l.name}
                      </T>
                    </View>
                    <T v="caption" dim numberOfLines={1}>
                      {l.start} ↔ {l.end}
                    </T>
                    <T v="caption" color={ok ? c.text3 : c.danger}>
                      {count} stations · {st}
                    </T>
                  </View>
                  <Icon name="chevron.right" size={12} color={c.text3} />
                </Press>
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </View>
  );
}
