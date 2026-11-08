import { DatePicker, Host } from '@expo/ui/swift-ui';

/** iOS: native SwiftUI date + time picker. */
export function TimePicker({ value, now, onChange, scheme }: { value: number | null; now: number; onChange: (ms: number) => void; scheme: 'light' | 'dark' }) {
  return (
    <Host matchContents colorScheme={scheme}>
      <DatePicker
        selection={new Date(value ?? now)}
        displayedComponents={['date', 'hourAndMinute']}
        range={{ start: new Date(now - 3600e3) }}
        onDateChange={(d) => onChange(d.getTime())}
      />
    </Host>
  );
}
