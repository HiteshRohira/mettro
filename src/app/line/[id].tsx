import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, LineChip, Pill, Press, SectionHeader, T } from '@/components/ui';
import { hm } from '@/lib/format';
import { dirTiming, getStation, lineById, lineLabel, linesOf, onLineColor } from '@/lib/network';
import { isNormal, useStatus } from '@/store/status';
import { radius, useTheme } from '@/theme';

export default function LineScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const line = lineById.get(id);
  const status = useStatus((s) => s.lines[id]);
  if (!line) return null;
  const fg = onLineColor(line.color);
  const seq = line.stations;
  const first = seq[0];
  const last = seq[seq.length - 1];
  const fwd = dirTiming(first, seq[1], line.id);
  const bwd = dirTiming(last, seq[seq.length - 2], line.id);
  const count = new Set([...seq, ...line.branches.flat()]).size;
  const ok = isNormal(status);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: lineLabel(line) }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        <View style={{ backgroundColor: line.color, borderRadius: radius.xl, padding: 18, gap: 6 }}>
          <T v="micro" color={fg} style={{ opacity: 0.8 }}>
            {line.name} · {count} stations
          </T>
          <T v="title" color={fg}>
            {lineLabel(line)}
          </T>
          <T v="body" color={fg} style={{ opacity: 0.9 }}>
            {line.start} ↔ {line.end}
          </T>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Pill text={status ?? 'Unknown'} tone={ok ? 'success' : 'danger'} icon={ok ? 'checkmark.circle.fill' : 'exclamationmark.triangle.fill'} />
        </View>

        <SectionHeader title="From the terminals" />
        <Card style={{ gap: 12 }}>
          {[
            { from: first, t: fwd },
            { from: last, t: bwd },
          ].map(({ from, t }) => (
            <View key={from} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <T v="bodyStrong" numberOfLines={1}>
                  {getStation(from).name}
                </T>
                <T v="caption" dim>
                  First {hm(t?.first)} · Last {hm(t?.last)}
                </T>
              </View>
            </View>
          ))}
        </Card>

        <SectionHeader title="Stations" />
        <Card pad={12}>
          {seq.map((code, i) => (
            <StationStop key={code} code={code} color={line.color} lineId={line.id} first={i === 0} last={i === seq.length - 1} />
          ))}
        </Card>

        {line.branches.map((br, bi) => (
          <View key={bi}>
            <SectionHeader title={`Branch from ${getStation(br[0]).name}`} />
            <Card pad={12}>
              {br.map((code, i) => (
                <StationStop key={code} code={code} color={line.color} lineId={line.id} first={i === 0} last={i === br.length - 1} />
              ))}
            </Card>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function StationStop({ code, color, lineId, first, last }: { code: string; color: string; lineId: string; first: boolean; last: boolean }) {
  const { c } = useTheme();
  const s = getStation(code);
  const others = linesOf(s).filter((l) => l.id !== lineId && l.color !== color);
  const big = first || last || s.interchange;
  return (
    <Press onPress={() => router.push({ pathname: '/station/[code]', params: { code } })} style={{ flexDirection: 'row', minHeight: 44 }}>
      <View style={{ width: 26, alignItems: 'center' }}>
        <View style={{ position: 'absolute', top: first ? 18 : 0, bottom: last ? 26 : 0, width: 6, backgroundColor: color }} />
        <View
          style={{
            marginTop: 12,
            width: big ? 16 : 10,
            height: big ? 16 : 10,
            borderRadius: 8,
            backgroundColor: big ? c.surface : color,
            borderWidth: big ? 3.5 : 2,
            borderColor: big ? c.text : c.surface,
          }}
        />
      </View>
      <View style={{ flex: 1, paddingLeft: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T v={big ? 'bodyStrong' : 'body'} numberOfLines={1} style={{ flexShrink: 1 }}>
          {s.name}
        </T>
        {others.length ? (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {others.map((l) => (
              <LineChip key={l.id} line={l} small />
            ))}
          </View>
        ) : null}
      </View>
    </Press>
  );
}
