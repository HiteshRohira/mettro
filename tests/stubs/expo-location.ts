export const Accuracy = { High: 4, Balanced: 3 };
export const ActivityType = { OtherNavigation: 4 };
export async function requestForegroundPermissionsAsync() { return { status: 'denied' }; }
export async function getForegroundPermissionsAsync() { return { status: 'denied' }; }
export async function requestBackgroundPermissionsAsync() { return { status: 'denied' }; }
export async function getBackgroundPermissionsAsync() { return { status: 'denied' }; }
export async function hasStartedLocationUpdatesAsync() { return false; }
export async function startLocationUpdatesAsync() {}
export async function stopLocationUpdatesAsync() {}
export async function watchPositionAsync() { return { remove() {} }; }
export type LocationObject = any; export type LocationSubscription = { remove(): void };
