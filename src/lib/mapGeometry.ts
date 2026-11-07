import geography from '@/data/delhi/geography.json';
import { EDGES } from '@/lib/network';

type Point = { latitude: number; longitude: number };
const shapes = geography.shapes as Record<string, number[][]>;

// Build once, outside React renders. Routing edges describe connectivity, not
// railway alignments; the bundled OSM shapes preserve curves at every zoom.
export const MAP_EDGES = EDGES.map((edge) => {
  const key = `${edge.line}|${edge.a}|${edge.b}`;
  const shape = shapes[key];
  if (!shape) throw new Error(`Missing map geometry: ${key}`);
  const coordinates: Point[] = shape.map(([latitude, longitude]) => ({ latitude, longitude }));
  return { ...edge, key, coordinates };
});
