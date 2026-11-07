import { Host, Toggle as SwiftToggle } from '@expo/ui/swift-ui';
import { labelsHidden } from '@expo/ui/swift-ui/modifiers';

/** iOS: SwiftUI toggle (RN's Switch reports a stale frame on iOS 26 and sits off-centre). */
export function Toggle({ value, onChange, label, scheme }: { value: boolean; onChange: (v: boolean) => void; label: string; scheme: 'light' | 'dark' }) {
  return (
    <Host matchContents colorScheme={scheme}>
      <SwiftToggle isOn={value} onIsOnChange={onChange} label={label} modifiers={[labelsHidden()]} />
    </Host>
  );
}
