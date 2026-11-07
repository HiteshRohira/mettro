import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Icon, LineChip, Press, T } from '@/components/ui';
import { fmtDuration, hm, shortPlatform } from '@/lib/format';
import { getLine, getStation, lineLabel } from '@/lib/network';
import type { Journey, Leg } from '@/lib/router';
import { useTheme } from '@/theme';

export function JourneyLegs({ j }: { j: Journey }) {
  return (
    <View>
      {j.legs.map((leg, i) => (
        <View key={i}>
          <LegBlock key={`${j.id}-${i}`} leg={leg} first={i === 0} last={i === j.legs.length - 1} />
          {i < j.legs.length - 1 ? <TransferBlock from={leg} to={j.legs[i + 1]} /> : null}
        </View>
      ))}
    </View>
  );
}

function StationNode({ code, color, big, time, sub }: { code: string; color: string; big?: boolean; time?: string | null; sub?: string }) {
  const { c } = useTheme();
  return (
    <Press onPress={() => router.push({ pathname: '/station/[code]', params: { code } })} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 30 }}>
      <View style={{ width: 52, alignItems: 'flex-end', paddingRight: 10 }}>
        {time ? (
          <T v="label" style={{ fontVariant: ['tabular-nums'] }}>
            {hm(time)}
          </T>
        ) : null}
      </View>
      <View style={{ width: 24, alignItems: 'center' }}>
        <View
          style={{
            width: big ? 16 : 10,
            height: big ? 16 : 10,
            borderRadius: 8,
            backgroundColor: big ? c.surface : color,
            borderWidth: big ? 4 : 0,
            borderColor: color,
          }}
        />
      </View>
      <View style={{ flex: 1, paddingLeft: 8, paddingVertical: big ? 4 : 2 }}>
        <T v={big ? 'h3' : 'body'} numberOfLines={2} dim={!big}>
          {getStation(code).name}
        </T>
        {sub ? (
          <T v="caption" dim numberOfLines={2}>
            {sub}
          </T>
        ) : null}
      </View>
    </Press>
  );
}

function LegBlock({ leg, first, last }: { leg: Leg; first: boolean; last: boolean }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const line = getLine(leg.lineId);
  const mids = leg.stations.slice(1, -1);
  const stops = leg.stations.length - 1;
  return (
    <View>
      {first ? <StationNode code={leg.stations[0]} color={line.color} big time={leg.depart} /> : null}
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 52 }} />
        <View style={{ width: 24, alignItems: 'center' }}>
          <View style={{ width: 3, flex: 1, backgroundColor: line.color, borderRadius: 3, marginVertical: -2 }} />
        </View>
        <View style={{ flex: 1, paddingLeft: 8, paddingVertical: 16, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <LineChip line={line} label={lineLabel(line)} />
            {leg.platform ? (
              <T v="label" dim>
                {shortPlatform(leg.platform)}
              </T>
            ) : null}
          </View>
          <T v="body">Towards {leg.towards}</T>
          <Press accessibilityState={{ expanded: open }} disabled={!mids.length} onPress={() => setOpen((v) => !v)} style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6 }} hitSlop={6}>
            <T v="caption" faint>
              {stops} stop{stops === 1 ? '' : 's'}{first && last ? '' : ` · ${fmtDuration(leg.durationS)}`}
            </T>
            {mids.length ? <Icon name={open ? 'chevron.up' : 'chevron.down'} size={10} color={c.text3} /> : null}
          </Press>
          {open
            ? mids.map((code) => (
                <Press key={code} onPress={() => router.push({ pathname: '/station/[code]', params: { code } })} style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: -26 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.surface, borderWidth: 2, borderColor: line.color }} />
                  <T v="caption" dim style={{ marginLeft: 14, flex: 1 }}>
                    {getStation(code).name}
                  </T>
                </Press>
              ))
            : null}
        </View>
      </View>
      {last ? <StationNode code={leg.stations[leg.stations.length - 1]} color={line.color} big time={leg.arrive} /> : null}
    </View>
  );
}

function TransferBlock({ from, to }: { from: Leg; to: Leg }) {
  const { c } = useTheme();
  const a = getLine(from.lineId);
  const b = getLine(to.lineId);
  const code = from.stations[from.stations.length - 1];
  return (
    <View>
      <StationNode code={code} color={a.color} big time={from.arrive} />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
        <View style={{ width: 52 }} />
        <View style={{ width: 24, alignItems: 'center', gap: 3 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.text3 }} />
          ))}
        </View>
        <View style={{ flex: 1, paddingLeft: 8, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="figure.walk" size={15} color={c.text2} />
          <T v="caption" dim style={{ flex: 1 }}>
            Change to {lineLabel(b)}{to.depart && from.arrive ? ` · departs ${hm(to.depart)}` : ''}
          </T>
        </View>
      </View>
    </View>
  );
}

export function JourneySummaryLine({ j }: { j: Journey }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {j.legs.map((l, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {i > 0 ? <Icon name="chevron.right" size={9} color="#8A909C" /> : null}
          <LineChip line={l.lineId} small />
        </View>
      ))}
    </View>
  );
}
