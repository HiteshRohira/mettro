import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Appearance, AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { refreshData, registerRefreshTask, updateStatusWidget } from '@/lib/refresh';
import { tick } from '@/lib/trip';
import { useSettings } from '@/store/settings';
import { font, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { c, dark } = useTheme();
  const appearance = useSettings((s) => s.appearance);

  // Without this only React views follow the in-app setting; the status bar and native controls follow the system.
  useEffect(() => {
    Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance);
  }, [appearance]);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    const boot = async () => {
      updateStatusWidget();
      await refreshData().catch(() => {});
      await registerRefreshTask();
      await tick().catch(() => {});
    };
    boot();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') boot();
    });
    return () => {
      sub.remove();
    };
  }, []);

  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: c.bg, card: c.bg, text: c.text, border: c.border, primary: c.accent },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <ThemeProvider value={navTheme}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerTitleStyle: { fontFamily: font.semibold, fontSize: 17, color: c.text },
            headerLargeTitleStyle: { fontFamily: font.heavy, color: c.text },
            headerBackButtonDisplayMode: 'minimal',
            headerTintColor: c.text,
            headerShadowVisible: false,
            // Status bar is view-controller based (react-native-screens), so expo-status-bar alone is ignored.
            statusBarStyle: dark ? 'light' : 'dark',
            headerStyle: { backgroundColor: c.bg },
            contentStyle: { backgroundColor: c.bg },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="station/[code]" options={{ title: '' }} />
          <Stack.Screen name="line/[id]" options={{ title: '' }} />
          <Stack.Screen name="journey" options={{ title: 'Routes' }} />
          <Stack.Screen name="trip" options={{ title: 'Your trip' }} />
          <Stack.Screen name="pick" options={{ presentation: 'modal', title: 'Choose station', headerShown: false }} />
          <Stack.Screen name="info/[topic]" options={{ title: '' }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
