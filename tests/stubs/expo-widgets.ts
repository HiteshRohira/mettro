export function after(d: Date) { return { after: d }; }
export function createLiveActivity() { return { start() { return { getId: () => 'x' }; }, getInstances() { return []; } }; }
export function createWidget() { return { updateSnapshot() {} }; }
export type LiveActivityEnvironment = any; export type WidgetEnvironment = any;
