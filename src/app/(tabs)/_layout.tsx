import { NativeTabs } from 'expo-router/native-tabs';

import { useTheme } from '@/theme';

export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <NativeTabs tintColor={c.text} labelStyle={{ fontFamily: 'Inter-Medium', fontSize: 10 }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Plan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'arrow.triangle.turn.up.right.diamond', selected: 'arrow.triangle.turn.up.right.diamond.fill' }}
          md="directions"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="map">
        <NativeTabs.Trigger.Label>Map</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} md="map" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="lines">
        <NativeTabs.Trigger.Label>Lines</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'tram', selected: 'tram.fill' }} md="train" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more">
        <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} md="apps" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
