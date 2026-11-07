import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, LineChip, Press, SectionHeader, T } from '@/components/ui';
import { hm } from '@/lib/format';
import { DIR_TIMINGS, getStation, lineById, lineLabel, linesOf } from '@/lib/network';
import { isNormal, useStatus } from '@/store/status';
import { radius, useTheme } from '@/theme';

export default function LineScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const line = lineById.get(id);
  const status = useStatus((s) => s.lines[id]);
  if (!line) return null;
  const seq = line.stations;
  const first = seq[0];
  const last = seq[seq.length - 1];
  const fwd = DIR_TIMINGS[`${first}|${seq[1]}`];
  const bwd = DIR_TIMINGS[`${last}|${seq[seq.length - 2]}`];
  const count = new Set([...seq, ...line.branches.flat()]).size;
  const ok = isNormal(status);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: insets.bottom + 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: line.color }} />
          <View style={{ flex: 1 }}>
            <T v="title">{lineLabel(line)}</T>
            <T v="label" dim>
              {count} stations
            </T>
          </View>
        </View>
        {!ok ? (
          <View style={{ marginTop: 14, backgroundColor: c.dangerSoft, borderRadius: radius.md, padding: 12 }}>
            <T v="label" color={c.danger}>
              {status}
            </T>
          </View>
        ) : null}

        <Card pad={0} style={{ paddingHorizontal: 14, marginTop: 20 }}>
          <View style={{ flexDirection: 'row', paddingTop: 12, paddingBottom: 2 }}>
            <T v="micro" faint style={{ flex: 1 }}>
              From
            </T>
            <T v="micro" faint style={{ width: 54, textAlign: 'right' }}>
              First
            </T>
            <T v="micro" faint style={{ width: 54, textAlign: 'right' }}>
              Last
            </T>
          </View>
          {[
            { from: first, t: fwd },
            { from: last, t: bwd },
          ].map(({ from, t }) => (
            <View key={from} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}>
              <T v="body" numberOfLines={1} style={{ flex: 1 }}>
                {getStation(from).name}
              </T>
              <T v="mono" dim style={{ width: 54, textAlign: 'right' }}>
                {hm(t?.first)}
              </T>
              <T v="mono" style={{ width: 54, textAlign: 'right' }}>
                {hm(t?.last)}
              </T>
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
