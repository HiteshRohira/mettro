"""Cross-check network edges against DMRC journey-planner map-paths.

Usage: python3 -I scripts/harvest_delhi_edges.py <raw_dir> <network.json> [n_random]
Writes <raw_dir>/planner_edges.json : list of [a, b, line_name]
"""
import json, sys, os, random, subprocess
from concurrent.futures import ThreadPoolExecutor

raw, netp = sys.argv[1], sys.argv[2]
n_random = int(sys.argv[3]) if len(sys.argv) > 3 else 300
net = json.load(open(netp))
codes = [s['code'] for s in net['stations']]
B = 'https://backend.delhimetrorail.com/api/v2/en/station_route/{a}/{b}/{m}/2026-11-10T10:00:00.000'

def q(args):
    a, b, m = args
    out = subprocess.run(['curl', '-s', '-m', '40', '-A', 'Mozilla/5.0', '-H', 'Referer: https://www.delhimetrorail.com/', B.format(a=a, b=b, m=m)], capture_output=True).stdout
    try: return json.loads(out)
    except Exception: return None

pairs = []
for l in net['lines']:
    seqs = [l['stations']] + l['branches']
    ends = sorted({s[0] for s in seqs} | {s[-1] for s in seqs})
    for x in ends:
        for y in ends:
            if x != y: pairs.append((x, y, 'least-distance'))
random.seed(7)
for _ in range(n_random):
    a, b = random.sample(codes, 2)
    pairs.append((a, b, random.choice(['least-distance', 'minimum-interchange'])))

edges = {}
cache = {}
cp = os.path.join(raw, 'route_cache.json')
if os.path.exists(cp):
    for v in json.load(open(cp)).values():
        for r in (v or {}).get('route', []) or []:
            for mp in r.get('map-path', []):
                a, b = mp.split('-', 1) if mp.count('-') == 1 else (None, None)
                if a: edges[(a, b)] = r.get('line')
with ThreadPoolExecutor(max_workers=5) as ex:
    for r in ex.map(q, pairs):
        for seg in (r or {}).get('route', []) or []:
            names = [p['name'] for p in seg.get('path', [])]
            mps = seg.get('map-path', [])
            for mp in mps:
                parts = mp.split('-')
                if len(parts) == 2: edges[(parts[0], parts[1])] = seg.get('line')
json.dump([[a, b, l] for (a, b), l in edges.items()], open(os.path.join(raw, 'planner_edges.json'), 'w'))
have = set()
for e in net['edges']:
    have.add((e['a'], e['b'])); have.add((e['b'], e['a']))
missing = [(a, b, l) for (a, b), l in edges.items() if (a, b) not in have]
print('planner edges', len(edges), 'missing from network:', missing)
