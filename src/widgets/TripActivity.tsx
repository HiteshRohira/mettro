import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  background,
  font,
  foregroundStyle,
  frame,
  labelsHidden,
  lineLimit,
  monospacedDigit,
  padding,
  shapes,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type TripActivityProps = {
  lineColor: string;
  lineText: string; // text colour on line chip
  lineName: string; // "Yellow Line"
  towards: string;
  current: string;
  next: string;
  nextAt: number; // epoch ms
  dest: string;
  eta: number; // epoch ms
  start: number; // epoch ms
  stopsLeft: number;
  progress: number; // 0..1
  action: string; // "Change at Rajiv Chowk for Blue Line" / "Get off at Patel Chowk"
  phase: 'riding' | 'transfer' | 'arriving' | 'arrived';
};

const TripActivity = (p: TripActivityProps, env: LiveActivityEnvironment) => {
  'widget';
  const dim = env.isLuminanceReduced;
  const accent = dim ? '#FFFFFF' : p.lineColor;
  const now = Date.now();
  const etaDate = new Date(Math.max(p.eta, now + 1000));
  const nextDate = new Date(Math.max(p.nextAt, now + 1000));
  const startDate = new Date(Math.min(p.start, now));
  const arrived = p.phase === 'arrived';
  const pad2 = (n: number) => (n < 10 ? '0' + n : '' + n);
  const etaD = new Date(p.eta);
  const etaClock = pad2(etaD.getHours()) + ':' + pad2(etaD.getMinutes());
  const stopsLabel = p.stopsLeft === 1 ? '1 stop' : p.stopsLeft + ' stops';
  const headline = arrived ? 'Arrived at ' + p.dest : p.phase === 'arriving' ? 'Next: ' + p.next + ' — get off' : 'Next: ' + p.next;

  const chip = (
    <Text
      modifiers={[
        font({ size: 12, weight: 'bold' }),
        foregroundStyle(dim ? '#000000' : p.lineText),
        padding({ horizontal: 8, vertical: 3 }),
        background(accent, shapes.capsule()),
      ]}>
      {p.lineName}
    </Text>
  );

  return {
    banner: (
      <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 16 }), activityBackgroundTint(dim ? null : '#0E1116')]}>
        <HStack spacing={8}>
          {chip}
          <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle('#A3A9B5'), lineLimit(1)]}>{'towards ' + p.towards}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle('#FFFFFF'), monospacedDigit()]}>
            {arrived ? 'Done' : 'Arrive ' + etaClock}
          </Text>
        </HStack>
        <HStack spacing={6}>
          <Text modifiers={[font({ size: 20, weight: 'bold' }), foregroundStyle('#FFFFFF'), lineLimit(1)]}>{headline}</Text>
          <Spacer />
          {arrived ? null : (
            <Text
              timerInterval={{ lower: new Date(Math.min(now, p.nextAt - 1000)), upper: nextDate }}
              countsDown
              modifiers={[font({ size: 17, weight: 'semibold' }), foregroundStyle(accent), monospacedDigit(), frame({ width: 64, alignment: 'trailing' })]}
            />
          )}
        </HStack>
        {arrived ? (
          <ProgressView value={1} modifiers={[tint(accent)]} />
        ) : (
          <ProgressView timerInterval={{ lower: startDate, upper: etaDate }} countsDown={false} modifiers={[tint(accent), labelsHidden()]} />
        )}
        <HStack spacing={6}>
          <Image systemName={p.phase === 'transfer' ? 'arrow.triangle.swap' : 'mappin.and.ellipse'} size={12} color="#A3A9B5" />
          <Text modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle('#D5D9E0'), lineLimit(1)]}>{p.action}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle('#A3A9B5')]}>{arrived ? '' : stopsLabel}</Text>
        </HStack>
      </VStack>
    ),
    compactLeading: (
      <HStack spacing={4}>
        <Image systemName="tram.fill" color={accent} size={14} />
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), lineLimit(1), frame({ maxWidth: 70 })]}>{arrived ? 'Arrived' : p.next}</Text>
      </HStack>
    ),
    compactTrailing: arrived ? (
      <Image systemName="checkmark.circle.fill" color={accent} size={14} />
    ) : (
      <Text
        timerInterval={{ lower: new Date(Math.min(now, p.eta - 1000)), upper: etaDate }}
        countsDown
        modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(accent), monospacedDigit(), frame({ width: 44 })]}
      />
    ),
    minimal: <Image systemName="tram.fill" color={accent} size={14} />,
    expandedLeading: (
      <VStack alignment="leading" spacing={4} modifiers={[padding({ leading: 4, top: 4 })]}>
        {chip}
        <Text modifiers={[font({ size: 11 }), foregroundStyle('#A3A9B5'), lineLimit(1)]}>{'→ ' + p.towards}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={2} modifiers={[padding({ trailing: 4, top: 4 })]}>
        <Text modifiers={[font({ size: 11 }), foregroundStyle('#A3A9B5')]}>Arrive</Text>
        <Text modifiers={[font({ size: 18, weight: 'bold' }), monospacedDigit()]}>{etaClock}</Text>
      </VStack>
    ),
    expandedCenter: <Text modifiers={[font({ size: 16, weight: 'bold' }), lineLimit(1)]}>{headline}</Text>,
    expandedBottom: (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ horizontal: 8, bottom: 6 })]}>
        {arrived ? (
          <ProgressView value={1} modifiers={[tint(accent)]} />
        ) : (
          <ProgressView timerInterval={{ lower: startDate, upper: etaDate }} countsDown={false} modifiers={[tint(accent), labelsHidden()]} />
        )}
        <HStack>
          <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle('#D5D9E0'), lineLimit(1)]}>{p.action}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 12 }), foregroundStyle('#A3A9B5')]}>{arrived ? '' : stopsLabel}</Text>
        </HStack>
      </VStack>
    ),
  };
};

export default createLiveActivity('TripActivity', TripActivity);
