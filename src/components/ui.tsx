import * as Haptics from 'expo-haptics';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { getLine, lineShort, onLineColor, type Line } from '@/lib/network';
import { font, radius, useTheme } from '@/theme';

type Variant = 'display' | 'title' | 'h2' | 'h3' | 'body' | 'bodyStrong' | 'label' | 'caption' | 'micro' | 'mono';

const variants: Record<Variant, TextStyle> = {
  display: { fontFamily: font.semibold, fontSize: 34, letterSpacing: -1.2, lineHeight: 41 },
  title: { fontFamily: font.semibold, fontSize: 24, letterSpacing: -0.5, lineHeight: 30 },
  h2: { fontFamily: font.bold, fontSize: 19, letterSpacing: -0.3, lineHeight: 24 },
  h3: { fontFamily: font.semibold, fontSize: 16, letterSpacing: -0.2, lineHeight: 21 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: font.medium, fontSize: 13, lineHeight: 17 },
  caption: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 16 },
  micro: { fontFamily: font.semibold, fontSize: 11, letterSpacing: 0.4, lineHeight: 14, textTransform: 'uppercase' },
  mono: { fontFamily: font.semibold, fontSize: 15, fontVariant: ['tabular-nums'] },
};

export function T({ v = 'body', color, dim, faint, style, ...rest }: TextProps & { v?: Variant; color?: string; dim?: boolean; faint?: boolean }) {
  const { c } = useTheme();
  return <RNText {...rest} style={[variants[v], { color: color ?? (faint ? c.text3 : dim ? c.text2 : c.text) }, style]} maxFontSizeMultiplier={1.4} />;
}

const materialIcons: Record<string, NonNullable<Extract<SymbolViewProps['name'], object>['android']>> = {
  "arrow.right": "arrow_forward",
  "arrow.up.arrow.down": "swap_vert",
  "arrow.up.right": "north_east",
  "clock": "schedule",
  "location": "near_me",
  "location.fill": "near_me",
  "chevron.right": "chevron_right",
  "chevron.up": "expand_less",
  "chevron.down": "expand_more",
  "xmark": "close",
  "xmark.circle.fill": "cancel",
  "figure.walk": "directions_walk",
  "magnifyingglass": "search",
  "star": "star_outline",
  "star.fill": "star",
  "ellipsis.circle": "more_horiz",
  "phone": "call",
  "phone.fill": "call",
  "safari.fill": "open_in_browser",
  "tram": "tram",
  "house.fill": "home",
  "briefcase.fill": "work",
  "wifi.slash": "wifi_off",
  "moon.zzz.fill": "bedtime",
  "sunrise.fill": "wb_twilight",
  "exclamationmark.triangle.fill": "warning",
  "exclamationmark.octagon.fill": "error",
  "arrow.triangle.swap": "swap_horiz",
  "arrow.triangle.turn.up.right.diamond": "directions",
  "airplane.departure": "flight_takeoff",
  "figure.roll": "accessible",
  "creditcard.fill": "credit_card",
  "indianrupeesign.circle.fill": "currency_rupee",
  "arrow.up.arrow.down.square": "elevator",
  "bag.fill": "shopping_bag",
  "banknote.fill": "payments",
  "building.columns.fill": "account_balance",
  "cross.case.fill": "medical_services",
  "drop.fill": "water_drop",
  "figure.and.child.holdinghands": "family_restroom",
  "fork.knife": "restaurant",
  "info.circle": "info",
  "lock.fill": "lock",
  "shield.fill": "shield",
  "storefront.fill": "storefront",
  "ticket.fill": "confirmation_number",
  "toilet.fill": "wc",
  "line.3.horizontal.decrease": "filter_list",
  "line.3.horizontal.decrease.circle.fill": "filter_list",
  "arrow.up.left.and.arrow.down.right": "zoom_out_map"
};

export function Icon({ name, size = 18, color, style }: { name: SymbolViewProps['name']; size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <SymbolView name={typeof name === 'string' ? { ios: name, android: materialIcons[name] ?? 'circle' } : name} size={size} tintColor={color ?? c.text} style={[{ width: size, height: size }, style]} resizeMode="scaleAspectFit" />;
}

export function Card({ style, children, pad = 16, ...rest }: ViewProps & { pad?: number }) {
  const { c } = useTheme();
  return (
    <View {...rest} style={[{ backgroundColor: c.surface, borderRadius: radius.xl, padding: pad }, style]}>
      {children}
    </View>
  );
}

export function Press({ style, onPress, haptic = true, ...rest }: PressableProps & { haptic?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      onPress={(e) => {
        if (haptic) Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={({ pressed }) => [style, pressed && { opacity: 0.6 }]}
    />
  );
}

/** Real layout bounds keep adjacent icon targets separate; hitSlop alone cannot
 * expand beyond a small native toolbar parent. */
export function IconButton({ icon, size = 22, color, style, ...props }: Omit<React.ComponentProps<typeof Press>, 'children'> & {
  icon: SymbolViewProps['name']; size?: number; color?: string; accessibilityLabel: string;
}) {
  return (
    <Press {...props} style={[{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, style, { minWidth: 44, minHeight: 44 }]}>
      <Icon name={icon} size={size} color={color} />
    </Press>
  );
}

export function Button({
  title,
  onPress,
  icon,
  kind = 'primary',
  loading,
  disabled,
  style,
  color,
}: {
  title: string;
  onPress?: () => void;
  icon?: SymbolViewProps['name'];
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  color?: string;
}) {
  const { c } = useTheme();
  const off = disabled && kind === 'primary';
  const bg = off ? c.surface2 : kind === 'primary' ? (color ?? c.ink) : kind === 'secondary' ? c.surface2 : kind === 'danger' ? c.dangerSoft : 'transparent';
  const fg = off ? c.text3 : kind === 'primary' ? (color ? onLineColor(color) : c.onInk) : kind === 'danger' ? c.danger : c.text;
  return (
    <Press
      onPress={() => {
        if (kind === 'primary') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onPress?.();
      }}
      haptic={kind !== 'primary'}
      disabled={disabled || loading}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      accessibilityRole="button"
      style={[
        {
          height: 50,
          borderRadius: radius.md,
          backgroundColor: bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 18,
          opacity: disabled && !off ? 0.5 : 1,
        },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={17} color={fg} /> : null}
      <T v="bodyStrong" color={fg}>
        {title}
      </T>
    </Press>
  );
}

export function LineChip({ line, small, label }: { line: Line | string; small?: boolean; label?: string }) {
  const l = typeof line === 'string' ? getLine(line) : line;
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: small ? 5 : 7, alignSelf: 'flex-start', paddingVertical: small ? 2 : 4 }}>
      <View style={{ width: small ? 7 : 9, height: small ? 7 : 9, borderRadius: 5, backgroundColor: l.color }} />
      <RNText style={{ fontFamily: font.medium, fontSize: small ? 11.5 : 13, color: c.text2, flexShrink: 1 }} maxFontSizeMultiplier={1.4}>
        {label ?? lineShort(l)}
      </RNText>
    </View>
  );
}

export function LineDots({ colors, size = 10 }: { colors: string[]; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {colors.map((col) => (
        <View key={col} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: col }} />
      ))}
    </View>
  );
}

export function SectionHeader({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View
      style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 30, marginBottom: 10, paddingHorizontal: 4 }, style]}>
      <T v="h3">{title}</T>
      {action ? (
        <Press onPress={onAction} style={{ minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
          <T v="label" color={c.accent}>
            {action}
          </T>
        </Press>
      ) : null}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: inset }} />;
}

export function Row({
  icon,
  iconColor,
  title,
  subtitle,
  right,
  onPress,
  chevron,
  left,
  subtitleLines = 3,
}: {
  subtitleLines?: number;
  icon?: SymbolViewProps['name'];
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  left?: React.ReactNode;
}) {
  const { c } = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, minHeight: 50 }}>
      {left ??
        (icon ? (
          <View
            style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: (iconColor ?? c.accent) + '1F', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={16} color={iconColor ?? c.accent} />
          </View>
        ) : null)}
      <View style={{ flex: 1 }}>
        <T v="body" numberOfLines={2}>
          {title}
        </T>
        {subtitle ? (
          <T v="caption" dim numberOfLines={subtitleLines || undefined} style={{ marginTop: 2, lineHeight: 18 }}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron.right" size={13} color={c.text3} /> : null}
    </View>
  );
  return onPress ? <Press onPress={onPress}>{body}</Press> : body;
}

export function Empty({ icon, title, text }: { icon: SymbolViewProps['name']; title: string; text?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
      <Icon name={icon} size={30} color={c.text3} />
      <T v="h3">{title}</T>
      {text ? (
        <T v="caption" dim style={{ textAlign: 'center', maxWidth: 280 }}>
          {text}
        </T>
      ) : null}
    </View>
  );
}

/** A quiet row that reveals its content on tap — used for secondary detail. */
export function Disclosure({
  title,
  detail,
  tone,
  children,
  first,
}: {
  title: string;
  detail?: string;
  tone?: 'danger';
  children: React.ReactNode;
  first?: boolean;
}) {
  const { c } = useTheme();
  const [open, setOpen] = React.useState(false);
  return (
    <View>
      {first ? null : <Divider />}
      <Press
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 10 }}>
        <T v="body" style={{ flex: 1 }}>
          {title}
        </T>
        {detail ? (
          <T v="label" numberOfLines={1} style={{ maxWidth: '45%' }} color={tone === 'danger' ? c.danger : c.text2}>
            {detail}
          </T>
        ) : null}
        <Icon name={open ? 'chevron.up' : 'chevron.down'} size={11} color={c.text3} />
      </Press>
      {open ? <View style={{ paddingBottom: 14, gap: 10 }}>{children}</View> : null}
    </View>
  );
}
