import assert from 'node:assert/strict';

import { getStation } from '../src/lib/network';
import { orient, pairId, rankTrips, tripTitle, type SavedTrip } from '../src/lib/savedTrips';

const at = (code: string, dLat = 0) => ({ lat: getStation(code).lat + dLat, lng: getStation(code).lng });
const trip = (a: string, b: string, p: Partial<SavedTrip> = {}): SavedTrip => ({ id: pairId(a, b), a, b, title: null, lastFrom: a, usedAt: 0, ...p });

// one trip per pair, whichever way round
assert.equal(pairId('RCK', 'HKS'), pairId('HKS', 'RCK'));

const t = trip('RCK', 'HKS');
// at either end: that end is "from"
assert.deepEqual(orient(t, at('RCK')), { from: 'RCK', to: 'HKS', near: true });
assert.deepEqual(orient(t, at('HKS')), { from: 'HKS', to: 'RCK', near: true });
// ~0.9 km from Hauz Khas still counts as near; ~1.3 km does not
assert.equal(orient(t, at('HKS', 0.008)).from, 'HKS');
assert.equal(orient(t, at('HKS', 0.012)).near, false);
// near neither, or no location: the way it was last taken
assert.deepEqual(orient(t, at('KG')), { from: 'RCK', to: 'HKS', near: false });
assert.deepEqual(orient({ ...t, lastFrom: 'HKS' }, null), { from: 'HKS', to: 'RCK', near: false });

// default title follows the direction; a custom one doesn't
assert.equal(tripTitle(t, 'HKS'), 'Hauz Khas – Rajiv Chowk');
assert.equal(tripTitle({ ...t, title: ' Office ' }, 'HKS'), 'Office');

// near trips first, then most recent
const old = trip('RCK', 'HKS', { usedAt: 1 });
const recent = trip('KG', 'HKS', { usedAt: 9 });
const far = trip('KG', 'RCK', { usedAt: 5 });
assert.deepEqual(rankTrips([recent, far, old], null).map((r) => r.trip.id), [recent.id, far.id, old.id]);
assert.deepEqual(rankTrips([recent, far, old], at('RCK')).map((r) => r.trip.id), [far.id, old.id, recent.id]);

console.log('saved trips ok');
