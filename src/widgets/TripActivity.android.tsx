// Live Activities are iOS-only. Same API surface as TripActivity.tsx, doing nothing.
export type TripActivityProps = {
  lineColor: string;
  lineText: string;
  lineName: string;
  towards: string;
  current: string;
  next: string;
  nextAt: number;
  dest: string;
  eta: number;
  start: number;
  stopsLeft: number;
  progress: number;
  action: string;
  phase: 'waiting' | 'riding' | 'transfer' | 'arriving' | 'arrived';
  title: string;
  etaText: string;
  departText: string;
};
type Instance = { getId(): string; update(p: TripActivityProps, d?: Date): Promise<void>; end(...a: unknown[]): Promise<void> };
const TripActivity = {
  start(): Instance {
    throw new Error('Live Activities are not available on Android');
  },
  getInstances(): Instance[] {
    return [];
  },
};
export default TripActivity;
