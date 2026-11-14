import { HStack, Image, ProgressView, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  background,
  fixedSize,
  font,
  foregroundStyle,
  labelsHidden,
  lineLimit,
  monospacedDigit,
  padding,
  progressViewStyle,
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
  dest: string;
  eta: number; // epoch ms
  start: number; // epoch ms
  stopsLeft: number;
  progress: number; // 0..1
  action: string; // "Change at Rajiv Chowk for Blue Line" / "Get off at Patel Chowk"
  phase: 'waiting' | 'riding' | 'transfer' | 'arriving' | 'arrived';
  title: string; // headline, composed by the app
  etaText: string; // arrival clock (IST), formatted by the app
  etaShort: string; // collapsed island: time left ("23m"), or the arrival clock when the app can't keep it fresh
  departText: string; // first departure clock (IST)
};

const TripActivity = (p: TripActivityProps, env: LiveActivityEnvironment) => {
  'widget';
  const dim = env.isLuminanceReduced;
  const accent = dim ? '#FFFFFF' : p.lineColor;
  const now = Date.now();
  const etaDate = new Date(Math.max(p.eta, now + 1000));
  const startDate = new Date(Math.min(p.start, now));
  const arrived = p.phase === 'arrived';
  const etaClock = p.etaText;
  const stopsLabel = p.stopsLeft === 1 ? '1 stop' : p.stopsLeft + ' stops';
  const headline = p.title;

  const chip = (
    <Text
      modifiers={[
        font({ size: 12, weight: 'bold' }),
        foregroundStyle(dim ? '#000000' : p.lineText),
        lineLimit(1),
        fixedSize(),
        padding({ horizontal: 8, vertical: 3 }),
        background(accent, shapes.capsule()),
      ]}>
      {p.lineName}
    </Text>
  );

  // The system draws the island's outline, so trip progress can't run around the pill itself.
  // a timed circular ProgressView prints its own countdown in the middle: shrink it away, the icon goes there
  const ringStyle = [progressViewStyle('circular'), tint(accent), labelsHidden(), font({ size: 1 }), foregroundStyle('#00000000')];
  const ring = (
    <ZStack>
      {arrived ? (
        <ProgressView value={1} modifiers={ringStyle} />
      ) : (
        <ProgressView
          timerInterval={{ lower: startDate, upper: etaDate }}
          countsDown={false}
          modifiers={ringStyle}
        />
      )}
      <Image systemName="tram.fill" color={accent} size={9} />
    </ZStack>
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
    // Collapsed: just the train (inside a ring that fills over the trip) and the time left to the destination.
    compactLeading: ring,
    compactTrailing: arrived ? (
      <Image systemName="checkmark.circle.fill" color={accent} size={14} />
    ) : (
      <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(accent), monospacedDigit(), lineLimit(1), fixedSize()]}>{p.etaShort}</Text>
    ),
    minimal: ring,
    expandedLeading: (
      <VStack alignment="leading" spacing={4} modifiers={[padding({ leading: 4, top: 4 })]}>
        {chip}
        <Text modifiers={[font({ size: 11 }), foregroundStyle('#A3A9B5'), lineLimit(1)]}>{'→ ' + p.towards}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={2} modifiers={[padding({ trailing: 4, top: 4 })]}>
        <Text modifiers={[font({ size: 11 }), foregroundStyle('#A3A9B5')]}>{arrived ? 'Arrived' : 'Arrive'}</Text>
        <Text modifiers={[font({ size: 18, weight: 'bold' }), monospacedDigit(), lineLimit(1), fixedSize()]}>{etaClock}</Text>
      </VStack>
    ),
    expandedBottom: (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ horizontal: 8, bottom: 6 })]}>
        <Text modifiers={[font({ size: 17, weight: 'bold' }), lineLimit(1)]}>{headline}</Text>
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
