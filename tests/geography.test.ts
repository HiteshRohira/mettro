import assert from 'node:assert/strict';
import { stationDirectionsUrls } from '../src/lib/navigation';
import geography from '../src/data/delhi/geography.json';
import { MAP_EDGES } from '../src/lib/mapGeometry';
import { getStation, haversineKm, nearestStations, STATIONS } from '../src/lib/network';

assert.equal(Object.keys(geography.stations).length, STATIONS.length);
assert.deepEqual(geography.unmappedEdges, []);
for (const edge of MAP_EDGES) {
  assert.ok(edge.coordinates.length >= 2, `${edge.key}: missing track shape`);
  for (const [code, point] of [[edge.a, edge.coordinates[0]], [edge.b, edge.coordinates.at(-1)!]] as const) {
    const station = getStation(code);
    assert.equal(point.latitude, station.lat, `${edge.key}: latitude disconnected`);
    assert.equal(point.longitude, station.lng, `${edge.key}: longitude disconnected`);
  }
  let length = 0;
  for (let i = 1; i < edge.coordinates.length; i++) {
    const a = edge.coordinates[i - 1], b = edge.coordinates[i];
    length += haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
  }
  const a = getStation(edge.a), b = getStation(edge.b);
  const direct = haversineKm(a.lat, a.lng, b.lat, b.lng);
  assert.ok(length <= Math.max(1, direct * 3), `${edge.key}: implausible track detour`);
}
// Independent geographic fixtures for the reported corridors. The old data
// missed these platforms by 200–300m, enough to put trains west of the road.
for (const [code, lat, lng] of [
  ['SUL', 28.4574254, 77.0969529], ['S53', 28.4463829, 77.1004632],
  ['AIT', 28.4329768, 77.1048971], ['SKRP', 28.4809969, 77.0944367],
  ['DL3', 28.4935677, 77.093661], ['MMJR', 28.4486201, 77.308095],
] as const) {
  const station = getStation(code);
  assert.ok(haversineKm(lat, lng, station.lat, station.lng) < 0.025, `${code}: station moved off platform`);
  assert.equal(nearestStations(lat, lng, 1)[0].station.code, code);
}
// The Rapid loop needs curved railway geometry, not chords across blocks.
assert.ok(MAP_EDGES.find(e => e.line === 'LN11' && [e.a, e.b].includes('GAT'))!.coordinates.length > 10);
console.log(`Geography verified: ${STATIONS.length} stations, ${MAP_EDGES.length} track shapes`);

// Every external navigation destination must use the same reviewed coordinates
// as the map and GPS tracking, including ambiguous station names/interchanges.
for (const station of STATIONS) {
  const urls = stationDirectionsUrls(station);
  const apple = new URL(urls.apple), google = new URL(urls.google);
  const point = `${station.lat},${station.lng}`;
  assert.equal(apple.searchParams.get('daddr'), point);
  assert.equal(google.searchParams.get('destination'), point);
  assert.equal(google.searchParams.get('api'), '1');
  assert.equal(google.searchParams.get('dir_action'), 'navigate');
  assert.equal(google.searchParams.has('origin'), false);
}
console.log('External map destinations verified for every station');
