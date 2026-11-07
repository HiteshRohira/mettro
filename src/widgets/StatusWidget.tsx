import { Circle, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, frame, lineLimit, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

// Imported so the build-time layout registry also embeds the Live Activity layout
// (lets it render without an App Group, e.g. when sideloaded with a free Apple ID).
import './TripActivity';

export type StatusWidgetProps = {
  checkedAt: number;
  issues: number;
  headline: string; // "All lines running normally"
  lines: { n: string; c: string; ok: boolean }[];
  first: string; // "First 05:30 · Last 23:12"
  station: string; // home/nearest station
};

const MetroStatusWidget = (p: StatusWidgetProps, env: WidgetEnvironment) => {
  'widget';
  const dark = env.colorScheme === 'dark';
  const bg = dark ? '#14171D' : '#FFFFFF';
  const fg = dark ? '#F3F4F6' : '#0E1116';
  const fg2 = dark ? '#A3A9B5' : '#5B6270';
  const ok = p.issues === 0;
  const statusColor = ok ? '#1F9D55' : '#D92D20';
  const d = new Date(p.checkedAt);
  const pad2 = (n: number) => (n < 10 ? '0' + n : '' + n);
  const checked = p.checkedAt ? 'Checked ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) : 'Open app to refresh';

  if (env.widgetFamily === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={2} modifiers={[containerBackground('#00000000', 'widget')]}>
        <HStack spacing={4}>
          <Image systemName="tram.fill" size={12} />
          <Text modifiers={[font({ size: 13, weight: 'bold' })]}>{ok ? 'Metro normal' : p.issues + ' line issue' + (p.issues > 1 ? 's' : '')}</Text>
        </HStack>
        <Text modifiers={[font({ size: 12 }), lineLimit(1)]}>{p.station}</Text>
        <Text modifiers={[font({ size: 12 }), lineLimit(1)]}>{p.first}</Text>
      </VStack>
    );
  }

  const header = (
    <HStack spacing={6}>
      <Image systemName={ok ? 'checkmark.circle.fill' : 'exclamationmark.triangle.fill'} color={statusColor} size={14} />
      <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(fg), lineLimit(1)]}>{ok ? 'All normal' : p.issues + ' disrupted'}</Text>
      <Spacer />
    </HStack>
  );

  if (env.widgetFamily === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={6} modifiers={[containerBackground(bg, 'widget')]}>
        {header}
        <Text modifiers={[font({ size: 12 }), foregroundStyle(fg2), lineLimit(3)]}>{p.headline}</Text>
        <Spacer />
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(fg), lineLimit(1)]}>{p.station}</Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(fg2), lineLimit(1)]}>{p.first}</Text>
        <Text modifiers={[font({ size: 10 }), foregroundStyle(fg2)]}>{checked}</Text>
      </VStack>
    );
  }

  const half = Math.ceil(p.lines.length / 2);
  const col = (items: StatusWidgetProps['lines']) => (
    <VStack alignment="leading" spacing={3}>
      {items.map((l) => (
        <HStack spacing={5} key={l.n}>
          <Circle modifiers={[foregroundStyle(l.c), frame({ width: 8, height: 8 })]} />
          <Text modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(l.ok ? fg : '#D92D20'), lineLimit(1)]}>{l.n}</Text>
        </HStack>
      ))}
    </VStack>
  );
  return (
    <VStack alignment="leading" spacing={6} modifiers={[containerBackground(bg, 'widget')]}>
      <HStack>
        {header}
        <Text modifiers={[font({ size: 10 }), foregroundStyle(fg2)]}>{checked}</Text>
      </HStack>
      <HStack alignment="top" spacing={12}>
        {col(p.lines.slice(0, half))}
        {col(p.lines.slice(half))}
        <Spacer />
      </HStack>
      <Spacer />
      <Text modifiers={[font({ size: 11 }), foregroundStyle(fg2), lineLimit(1), padding({ top: 0 })]}>{p.station + ' · ' + p.first}</Text>
    </VStack>
  );
};

export default createWidget<StatusWidgetProps>('MetroStatusWidget', MetroStatusWidget, {
  checkedAt: 0,
  issues: 0,
  headline: 'Open Mettro to load live line status',
  lines: [],
  first: '',
  station: 'Delhi Metro',
});
