import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { whenHydrated } from '@/lib/hydration';
import { orient } from '@/lib/savedTrips';
import { locate, useLoc } from '@/lib/useLocation';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

/** Widget deep link: open a saved trip, oriented by where you are now. */
export default function GoScreen() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  useEffect(() => {
    let alive = true;
    (async () => {
      await whenHydrated();
      const trip = useSettings.getState().trips.find((t) => t.id === id);
      if (!trip) return router.replace('/');
      const loc = useLoc.getState();
      const at = loc.coords && loc.at && Date.now() - loc.at < 2 * 60e3 ? loc.coords : await locate(false);
      if (!alive) return;
      const { from, to } = orient(trip, at);
      router.replace({ pathname: '/journey', params: { from, to, at: '' } });
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Stack.Screen options={{ title: '' }} />
      <ActivityIndicator />
    </View>
  );
}
