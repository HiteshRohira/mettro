#!/usr/bin/env python3
"""Build offline map geography from an OSM Overpass/full-relation JSON snapshot.

Usage: python3 scripts/build_delhi_geography.py /path/to/osm.json
Source query: relation[route=subway][network~"Delhi Metro|Rapid Metro Gurgaon"];
(._; >>;); out body;
Coordinates are matched by reviewed OSM IDs, never by proximity alone.
"""
import heapq
import itertools
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'src/data/delhi'
# One running direction avoids snapping alternate stations onto disconnected parallel tracks.
# Green includes its branch; Rapid includes the complete loop.
RELATIONS = {
    'LN1': [447214], 'LN2': [447210], 'LN3': [447209],
    'LN4': [2535795], 'LN5': [2535796, 8037666], 'LN6': [2535797],
    'LN7': [8241298], 'LN7EXTN': [8241298], 'LN8': [8385429],
    'LN8EXTN': [20300114], 'LN9': [3537978], 'LN10': [2535798],
    'LN11': [4481323],
}

def distance(a, b):
    return math.hypot((a[0] - b[0]) * 111195, (a[1] - b[1]) * 97700)


def build(snapshot):
    net = json.loads((DATA / 'network.json').read_text())
    reviewed = json.loads((DATA / 'station-osm.json').read_text())
    matches = reviewed['nodes']
    elements = {(e['type'], e['id']): e for e in snapshot['elements']}
    nodes = {i: (e['lat'], e['lon']) for (t, i), e in elements.items() if t == 'node'}
    for code, node_id in matches.items():
        tags = elements[('node', node_id)].get('tags', {})
        if (tags.get('railway') not in ['station', 'stop']
                or tags.get('network') not in ['Delhi Metro', 'Rapid Metro Gurgaon']
                or tags.get('name') != reviewed['names'][code]):
            raise ValueError(f'{code}: OSM station identity changed; review node {node_id} before updating geography')
    positions = {code: nodes[i] for code, i in matches.items()}
    assert set(positions) == {s['code'] for s in net['stations']}
    assert len(set(positions.values())) == len(positions), 'Duplicate station positions need review'
    for p in positions.values():
        assert 28.2 < p[0] < 29 and 76.8 < p[1] < 77.6
    shapes, missing = {}, []
    for line, relation_ids in RELATIONS.items():
        ways = set()
        for rid in relation_ids:
            relation = elements.get(('relation', rid))
            if relation:
                ways.update(m['ref'] for m in relation['members'] if m['type'] == 'way' and m['role'] not in ['platform'])
        coords, graph, segments = {}, {}, []
        def connect(a, b):
            d = distance(coords[a], coords[b])
            graph.setdefault(a, {})[b] = d
            graph.setdefault(b, {})[a] = d
        for wid in sorted(ways):
            way = elements[('way', wid)]
            for a, b in zip(way['nodes'], way['nodes'][1:]):
                coords[a], coords[b] = nodes[a], nodes[b]
                connect(a, b)
                segments.append((a, b))
        # Split the nearest track segment at each station's projected position.
        # Shared per-line projections keep adjacent edges joined at the same point.
        snaps = {}
        for s in net['stations']:
            if line not in s['lines'] or not segments:
                continue
            p = positions[s['code']]
            best = None
            candidates = []
            for a, b in segments:
                u, v = coords[a], coords[b]
                dx, dy = (v[0]-u[0])*111195, (v[1]-u[1])*97700
                t = max(0, min(1, (((p[0]-u[0])*111195)*dx + ((p[1]-u[1])*97700)*dy) / (dx*dx+dy*dy))) if dx or dy else 0
                q = (u[0]+t*(v[0]-u[0]), u[1]+t*(v[1]-u[1]))
                candidate = (distance(p,q), a, b, q)
                candidates.append(candidate)
                if best is None or candidate[0] < best[0]: best = candidate
            d, a, b, q = best
            if d > 400: continue  # New/unmapped extensions must not snap to another line.
            key = s['code']
            coords[key] = q
            connect(a, key); connect(key, b)
            if line == 'LN11':
                # This relation traverses both running tracks. Join their platform
                # projections at the station so rendering cannot take a long U-turn
                # via the terminus when the nearest rail changes sides.
                for gap, u, v, point in candidates:
                    if distance(q, point) < 20:
                        connect(u, key); connect(key, v)
            snaps[key] = key
        for edge in net['edges']:
            if edge['line'] != line: continue
            a, b = edge['a'], edge['b']
            key = f'{line}|{a}|{b}'
            if a not in snaps or b not in snaps:
                missing.append(key); continue
            counter = itertools.count()
            queue, costs, prev = [(0, next(counter), a)], {a: 0}, {}
            while queue:
                cost, _, u = heapq.heappop(queue)
                if cost != costs[u]: continue
                if u == b: break
                for v, length in graph[u].items():
                    nc = cost + length
                    if nc < costs.get(v, math.inf):
                        costs[v] = nc; prev[v] = u
                        heapq.heappush(queue, (nc, next(counter), v))
            if b not in costs or costs[b] > max(1000, distance(positions[a], positions[b]) * 3):
                missing.append(key); continue
            path = [b]
            while path[-1] != a: path.append(prev[path[-1]])
            points = [positions[a]] + [coords[n] for n in reversed(path)] + [positions[b]]
            rounded = []
            for p in points:
                q = [round(p[0], 7), round(p[1], 7)]
                if not rounded or q != rounded[-1]: rounded.append(q)
            shapes[key] = rounded
    if missing:
        raise ValueError(f'Missing track geometry; update route relations/station mappings: {missing}')
    result = {
        'source': '© OpenStreetMap contributors',
        'license': 'ODbL-1.0', 'url': 'https://www.openstreetmap.org/copyright',
        'snapshot': snapshot.get('osm3s', {}).get('timestamp_osm_base'),
        'stations': {code: {'lat': p[0], 'lng': p[1]} for code, p in positions.items()},
        'shapes': shapes, 'unmappedEdges': missing,
    }
    (DATA / 'geography.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')
    print(f'{len(positions)} stations, {len(shapes)} track shapes; {len(missing)} unmapped edges: {missing}')

if __name__ == '__main__':
    build(json.loads(Path(sys.argv[1]).read_text()))
