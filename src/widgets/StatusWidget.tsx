import { Circle, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, frame, lineLimit, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

// Imported so the build-time layout registry also embeds the Live Activity layout
// (lets it render without an App Group, e.g. when sideloaded with a free Apple ID).
import './TripActivity';

export type StatusWidgetProps = {
  checkedAt: number;
  issues: number;
  headline: string; // first disruption, e.g. "Blue Line: Delayed"; empty when all normal
  lines: { n: string; c: string; ok: boolean; s?: string }[]; // disrupted lines only
  trip: string; // most likely saved trip, e.g. "Office"; empty when none saved
  route: string; // "Rajiv Chowk → Noida Sector 18"
  url: string; // opens that trip, oriented by where you are when you tap
};

// Quiet by default: with normal service the widget is just your most likely trip.
// Line status appears only when something is actually wrong.
const MetroStatusWidget = (p: StatusWidgetProps, env: WidgetEnvironment) => {
  'widget';
  const dark = env.colorScheme === 'dark';
  const bg = dark ? '#14171D' : '#FFFFFF';
  const fg = dark ? '#F3F4F6' : '#0E1116';
  const fg2 = dark ? '#A3A9B5' : '#5B6270';
  const red = dark ? '#FF6B5E' : '#D92D20';
  const bad = p.issues > 0;
  const issueText = p.issues + ' line issue' + (p.issues > 1 ? 's' : '');
  const title = p.trip || 'Mettro';
  const sub = p.trip ? p.route : 'Save a trip to see it here';
  const link = widgetURL(p.url || 'mettro://');

  if (env.widgetFamily === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={2} modifiers={[containerBackground('#00000000', 'widget'), link]}>
        <HStack spacing={4}>
          <Image systemName={bad ? 'exclamationmark.triangle.fill' : 'tram.fill'} size={12} />
          <Text modifiers={[font({ size: 13, weight: 'bold' }), lineLimit(1)]}>{bad ? issueText : title}</Text>
        </HStack>
        {bad ? <Text modifiers={[font({ size: 12 }), lineLimit(1)]}>{p.headline}</Text> : null}
        <Text modifiers={[font({ size: 12 }), lineLimit(1)]}>{sub}</Text>
      </VStack>
    );
  }

  const alert = bad ? (
    <HStack spacing={5}>
      <Image systemName="exclamationmark.triangle.fill" color={red} size={12} />
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(red), lineLimit(1)]}>{issueText}</Text>
      <Spacer />
    </HStack>
  ) : null;

  const tripBlock = (
    <VStack alignment="leading" spacing={2}>
      <Text modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle(fg), lineLimit(2)]}>{title}</Text>
      <Text modifiers={[font({ size: 12 }), foregroundStyle(fg2), lineLimit(2)]}>{sub}</Text>
    </VStack>
  );

  if (env.widgetFamily === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={6} modifiers={[containerBackground(bg, 'widget'), link]}>
        <Image systemName="tram.fill" color={fg2} size={14} />
        {alert}
        {bad ? <Text modifiers={[font({ size: 12 }), foregroundStyle(fg2), lineLimit(2)]}>{p.headline}</Text> : null}
        <Spacer />
        {tripBlock}
      </VStack>
    );
  }

  return (
    <VStack alignment="leading" spacing={6} modifiers={[containerBackground(bg, 'widget'), link]}>
      <HStack>
        <Image systemName="tram.fill" color={fg2} size={14} />
        <Spacer />
      </HStack>
      {alert}
      {bad
        ? p.lines.slice(0, 3).map((l) => (
            <HStack spacing={6} key={l.n}>
              <Circle modifiers={[foregroundStyle(l.c), frame({ width: 8, height: 8 })]} />
              <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle(fg), lineLimit(1)]}>{l.n}</Text>
              <Text modifiers={[font({ size: 12 }), foregroundStyle(fg2), lineLimit(1)]}>{l.s ?? ''}</Text>
              <Spacer />
            </HStack>
          ))
        : null}
      <Spacer />
      {tripBlock}
    </VStack>
  );
};

export default createWidget<StatusWidgetProps>('MetroStatusWidget', MetroStatusWidget, {
  checkedAt: 0,
  issues: 0,
  headline: '',
  lines: [],
  trip: '',
  route: '',
  url: 'mettro://',
});
