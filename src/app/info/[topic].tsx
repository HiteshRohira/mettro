import { Stack, useLocalSearchParams } from 'expo-router';
import { Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Divider, Row, T } from '@/components/ui';
import { topicById } from '@/lib/info';
import { useTheme } from '@/theme';

export default function InfoScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { topic } = useLocalSearchParams<{ topic: string }>();
  const t = topicById.get(topic);
  if (!t) return null;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 12 }}>
      <Stack.Screen options={{ title: t.title }} />
      {t.blocks.map((b, i) => {
        switch (b.kind) {
          case 'h':
            return (
              <T key={i} v="h3" style={{ marginTop: 8 }}>
                {b.text}
              </T>
            );
          case 'p':
            return (
              <T key={i} v="body" dim>
                {b.text}
              </T>
            );
          case 'list':
            return (
              <Card key={i} style={{ gap: 10 }}>
                {b.items.map((it, j) => (
                  <View key={j} style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.text3, marginTop: 8 }} />
                    <T v="body" style={{ flex: 1 }}>
                      {it}
                    </T>
                  </View>
                ))}
              </Card>
            );
          case 'table':
            return (
              <Card key={i} pad={0}>
                <View style={{ flexDirection: 'row', padding: 12, backgroundColor: c.surface2, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
                  {b.head.map((h, j) => (
                    <T key={j} v="micro" faint style={{ flex: j === 0 ? 1.4 : 1, textAlign: j === 0 ? 'left' : 'right' }}>
                      {h}
                    </T>
                  ))}
                </View>
                {b.rows.map((r, j) => (
                  <View key={j}>
                    {j > 0 ? <Divider /> : null}
                    <View style={{ flexDirection: 'row', padding: 12 }}>
                      {r.map((cell, k) => (
                        <T key={k} v={k === 0 ? 'body' : 'mono'} style={{ flex: k === 0 ? 1.4 : 1, textAlign: k === 0 ? 'left' : 'right' }}>
                          {cell}
                        </T>
                      ))}
                    </View>
                  </View>
                ))}
              </Card>
            );
          case 'call':
            return (
              <Card key={i} pad={0} style={{ paddingHorizontal: 14 }}>
                <Row
                  icon="phone.fill"
                  iconColor={c.success}
                  title={`${b.label} · ${b.number}`}
                  subtitle={b.sub}
                  onPress={() => Linking.openURL(`tel:${b.number}`)}
                  chevron
                />
              </Card>
            );
          case 'link':
            return (
              <Card key={i} pad={0} style={{ paddingHorizontal: 14 }}>
                <Row icon="safari.fill" title={b.label} subtitle={b.url} onPress={() => Linking.openURL(b.url)} chevron />
              </Card>
            );
        }
      })}
    </ScrollView>
  );
}
