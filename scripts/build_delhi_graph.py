"""Build Delhi Metro network data from raw DMRC API dumps.

Usage: python3 -I scripts/build_delhi_graph.py <raw_dir> <out_dir>
raw_dir must contain line_list.json, station_list.json, st/<CODE>.json (from /api/v2/en/station/<CODE>)
and optionally timings.json (from fetch_timings.py).
"""
import json, os, re, sys, math
from collections import defaultdict

raw, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
lines_raw = json.load(open(os.path.join(raw, 'line_list.json')))
slist = json.load(open(os.path.join(raw, 'station_list.json')))
timings = {}
tp = os.path.join(raw, 'timings.json')
if os.path.exists(tp):
    timings = json.load(open(tp))

ACR = {'AIIMS','ITO','IIT','INA','JLN','GTB','IGI','IICC','DLF','MG','NSIC','ESI','HUDA','IFFCO','JNU','T-1','T-3','ISBT','NHPC','DU','IP','MGF','RK','NCC','RBI','IOC','GNIDA','CBD','NSP','DDA','KG','T1','T3','LIC','IGL','UP','NIT','DTC','IFC','IMT','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIV','XV','XVI','XVII','XVIII','XIX','XX','XXI','DSIIDC','NBCC','ISKCON','SRS','JMP','CR','PNB','HCC'}
SMALL = {'and','of','the','via'}
def tc(s):
    s = re.sub(r'\s+', ' ', s.strip())
    def w(tok, first):
        if not tok: return tok
        core = re.sub(r'[^A-Za-z0-9\-\.]', '', tok)
        up = core.upper()
        if up in ACR or re.fullmatch(r'[IVX]+', up) and len(up) <= 4: return tok.upper()
        if re.fullmatch(r'[A-Z]\.?', core): return tok.upper()
        if '-' in tok and not tok.startswith('-'):
            return '-'.join(w(p, first and i == 0) for i, p in enumerate(tok.split('-')))
        if '.' in tok and len(core) <= 6 and core.count('.') >= 1 and core.replace('.', '').isupper() and len(core.replace('.','')) <= 3:
            return tok.upper() if len(core.replace('.', '')) <= 2 else tok[0].upper() + tok[1:].lower()
        if not first and tok.lower() in SMALL: return tok.lower()
        # keep parentheses prefix
        m = re.match(r'^([\(\[]*)(.*)$', tok)
        pre, rest = m.group(1), m.group(2)
        return pre + rest[:1].upper() + rest[1:].lower()
    return ' '.join(w(t, i == 0) for i, t in enumerate(s.split(' ')))

def nk(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

# Lines
lines = []
line_by_name = {}
for l in lines_raw:
    if not l.get('show_in_frontend'): continue
    obj = {
        'id': l['line_code'],
        'num': l['id'],
        'name': l['name'],
        'color_name': l['line_color'],
        'color': l['primary_color_code'].upper(),
        'tint': (l['secondary_color_code'] or '').upper(),
        'start': l['start_station'],
        'end': l['end_station'],
        'status': l['status'],
    }
    lines.append(obj); line_by_name[l['name']] = obj

stations = {}
details = {}
adj = defaultdict(set)  # (line_id) -> set of (a,b)
for x in slist:
    code = x['station_code']
    p = os.path.join(raw, 'st', code + '.json')
    if not os.path.exists(p): continue
    d = json.load(open(p))
    lids = [line_by_name[m['name']]['id'] for m in d['metro_lines'] if m['name'] in line_by_name]
    for pn in d.get('prev_next_stations', []):
        for lname, arr in pn.items():
            if lname not in line_by_name: continue
            lid = line_by_name[lname]['id']
            if lid not in lids: lids.append(lid)
            for e in arr:
                for k in ('prev_station', 'next_station'):
                    o = e.get(k)
                    if o and o.get('station_code') and o['station_code'] != code:
                        adj[lid].add(tuple(sorted((code, o['station_code']))))
    tags = [f['name'] for f in d.get('station_facility', [])]
    stations[code] = {
        'code': code,
        'name': tc(d['station_name']),
        'raw': d['station_name'].strip(),
        'lat': float(d['latitude'] or 0), 'lng': float(d['longitude'] or 0),
        'type': d.get('station_type') or '',
        'lines': lids,
        'tags': tags,
        'open': (d.get('opening_time') or '')[:5],
        'close': (d.get('closing_time') or '')[:5],
    }
    def clean(s):
        return re.sub(r'\s+', ' ', (s or '')).strip()
    gates = [{'name': clean(g['gate_name']), 'loc': clean(g.get('location')), 'divyang': bool(g.get('divyang_friendly')), 'open': (g.get('status') or 'open').lower() == 'open'} for g in d.get('gates', [])]
    gates.sort(key=lambda g: [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', g['name'])])
    lifts = [{'type': clean(l.get('lift_type')), 'name': clean(l.get('name')), 'loc': clean(l.get('description_location')), 'divyang': bool(l.get('divyang_friendly')), 'ok': bool(l.get('status')), 'side': clean(l.get('available_outside_inside'))} for l in d.get('lifts', [])]
    plats = []
    for pl in d.get('platforms', []):
        t = pl.get('train_towards') or {}
        t2 = pl.get('train_towards_second') or {}
        if t.get('station_code') == code and not t2: continue  # pseudo platforms
        plats.append({'name': clean(pl['platform_name']), 'to': t.get('station_code'), 'to2': t2.get('station_code') if t2 else None})
    plats.sort(key=lambda p: [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', p['name'])])
    facs = []
    for f in d.get('stations_facilities', []):
        items = [{'name': clean(i.get('facility_name')), 'loc': clean(i.get('location_description')), 'gate': clean(i.get('nearest_gate_name'))} for i in f.get('detail_list', [])]
        if items: facs.append({'kind': clean(f.get('kind')), 'items': items})
    parks = [{'by': clean(p.get('provider')), 'car': p.get('capacity_car') or 0, 'bike': p.get('capacity_motorcycle') or 0, 'cycle': p.get('capacity_cycle') or 0, 'loc': clean(p.get('location'))} for p in d.get('parkings', [])]
    nearby = []
    for group in d.get('nearby_places', []):
        for gname, cats in group.items():
            for cat, arr in cats.items():
                for it in arr:
                    if 'name' not in it: continue
                    nearby.append({'group': gname, 'cat': cat, 'name': clean(it['name']), 'km': it.get('distance_from_metro'), 'walk': it.get('estimated_walking_time_min'), 'gate': clean(it.get('nearest_gate_name'))})
    feeder = []
    for fd in d.get('feeder', []) or []:
        feeder.append({k: (clean(v) if isinstance(v, str) else v) for k, v in fd.items() if not isinstance(v, (dict, list))})
    details[code] = {
        'desc': clean(d.get('station_description')),
        'mobile': clean(d.get('mobile')), 'landline': clean(d.get('landline')),
        'gates': gates, 'lifts': lifts, 'platforms': plats, 'facilities': facs,
        'parking': parks, 'nearby': nearby, 'feeder': feeder,
        'status': d.get('station_status') or [],
    }

# Known gaps in DMRC prev/next data (verified against the journey-planner map-path)
EXTRA_EDGES = [('LN5', 'APMN', 'SRSM'), ('LN11', 'DL3', 'DL2'), ('LN7', 'MUPR', 'YMVR')]
# Rapid Metro Gurugram loop runs one way only (per DMRC planner map-path)
ONEWAY = {('DL2', 'BEL'), ('BEL', 'GAT'), ('GAT', 'MAL'), ('MAL', 'DL3'), ('DL3', 'DL2')}
for lid, a, b in EXTRA_EDGES:
    adj[lid].add(tuple(sorted((a, b))))
NAME_OVERRIDES = {
    'DBSA': None,
}
FIX = {
    'DR. Baba Saheb Ambedkar Hospital': 'Dr. Baba Saheb Ambedkar Hospital',
    'East Vinod Nagar-Mayur Vihar -ii': 'East Vinod Nagar - Mayur Vihar-II',
    'Mayur Vihar -i': 'Mayur Vihar-I',
    'Mundka Industrial Area (Mia)': 'Mundka Industrial Area (MIA)',
    'R.k.puram': 'R.K. Puram',
    'Seva Teerth (Earlier Udyog Bhawan))': 'Seva Teerth (Udyog Bhawan)',
    'Shaheed Sthal ( New Bus Adda)': 'Shaheed Sthal (New Bus Adda)',
    'Madhuban Chowk (Earlier Pitampura)': 'Madhuban Chowk (Pitampura)',
    'Shree Ram Mayur Vihar Mandir (Earlier Mayur Vihar Pocket-1)': 'Shree Ram Mayur Vihar Mandir (Mayur Vihar Pocket-1)',
    'New Delhi (Yellow & Airport Line)': 'New Delhi',
    'Ghevra Metro Station': 'Ghevra',
    'I.P. Extension': 'IP Extension',
    'M.G. Road': 'MG Road',
    'Sant Surdas (Sihi)': 'Sant Surdas (Sihi)',
    'Dwarka-Kakrola': 'Dwarka - Kakrola',
}
for c, st in stations.items():
    st['name'] = FIX.get(st['name'], st['name'])

# Geography is maintained separately from the DMRC snapshot: its coarse/incorrect
# station positions must not overwrite reviewed OSM station/stop coordinates.
geo_path = os.path.join(os.path.dirname(__file__), '../src/data/delhi/geography.json')
with open(geo_path) as f:
    geography = json.load(f)
for code, position in geography['stations'].items():
    if code in stations:
        stations[code].update(position)
# add neighbour-referenced codes that exist
for lid in adj:
    adj[lid] = {e for e in adj[lid] if e[0] in stations and e[1] in stations}

def hav(a, b):
    R = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a['lat'], a['lng'], b['lat'], b['lng']))
    h = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 2*R*math.asin(math.sqrt(h))

name_to_code = {}
for c, s in stations.items():
    name_to_code[nk(s['raw'])] = c

# order lines: walk from start terminal
for l in lines:
    lid = l['id']
    g = defaultdict(set)
    for a, b in adj[lid]:
        g[a].add(b); g[b].add(a)
    start = name_to_code.get(nk(l['start'])); end = name_to_code.get(nk(l['end']))
    if start not in g:
        ends = [n for n in g if len(g[n]) == 1]
        start = ends[0] if ends else (next(iter(g)) if g else None)
    # main path: shortest path start->end by BFS, then branches
    def bfs(s, t):
        prev = {s: None}; q = [s]
        for u in q:
            if u == t: break
            for v in sorted(g[u]):
                if v not in prev: prev[v] = u; q.append(v)
        if t not in prev: return None
        p = []; u = t
        while u is not None: p.append(u); u = prev[u]
        return p[::-1]
    main = bfs(start, end) if end in g else None
    if main and len(main) < len(g) * 0.6:
        # ring-shaped line (e.g. Pink): prefer the longest simple path start -> end
        best = [main]
        def dfs2(u, path, seen):
            if u == end:
                if len(path) > len(best[0]): best[0] = path[:]
                return
            for v in sorted(g[u]):
                if v not in seen:
                    seen.add(v); path.append(v); dfs2(v, path, seen); path.pop(); seen.discard(v)
        dfs2(start, [start], {start})
        main = best[0]
    if not main:
        # longest simple path from start via DFS on tree
        best = [[]]
        def dfs(u, path, seen):
            if len(path) > len(best[0]): best[0] = path[:]
            for v in g[u]:
                if v not in seen:
                    seen.add(v); path.append(v); dfs(v, path, seen); path.pop(); seen.discard(v)
        if start: dfs(start, [start], {start})
        main = best[0]
    branches = []
    covered = set(main)
    for n in list(g):
        pass
    # find branches hanging off covered nodes
    changed = True
    while changed:
        changed = False
        for u in list(covered):
            for v in sorted(g[u]):
                if v in covered: continue
                br = [u, v]; covered.add(v); cur = v
                while True:
                    nxt = [w for w in g[cur] if w not in covered]
                    if not nxt: break
                    cur = nxt[0]; covered.add(cur); br.append(cur)
                branches.append(br); changed = True
    l['stations'] = main
    l['branches'] = branches
    l['edges'] = sorted([list(e) for e in adj[lid]])
    l['start_code'] = main[0] if main else None
    l['end_code'] = main[-1] if main else None
    l['start'] = stations[main[0]]['name'] if main else tc(l['start'])
    l['end'] = stations[main[-1]]['name'] if main else tc(l['end'])

# station lines restricted to lines where it is on graph
for c, s in stations.items():
    s['lines'] = [lid for lid in s['lines'] if any(c in e for e in adj[lid])] or s['lines']
    s['interchange'] = len(s['lines']) > 1

# edges with travel time (seconds) and distance
edges = []
for l in lines:
    for a, b in l['edges']:
        km = round(hav(stations[a], stations[b]), 3)
        ow = None
        if (a, b) in ONEWAY: ow = (a, b)
        elif (b, a) in ONEWAY: ow = (b, a)
        if ow: a, b = ow
        t = timings.get('edge', {}).get(f'{a}|{b}') or (None if ow else timings.get('edge', {}).get(f'{b}|{a}'))
        estimate = int(max(90, km / 34 * 3600 + 25))
        # planner hop times faster than the line's top speed allows are bad data (seen: 2 s hops)
        vmax = 120 if l['id'] == 'LN10' else 90
        if t and t < km / vmax * 3600 + 20:
            print(f'WARN implausible hop time {a}-{b} {t}s for {km} km -> using {estimate}s')
            t = None
        e = {'a': a, 'b': b, 'line': l['id'], 'km': km, 's': t or estimate}
        if ow: e['oneway'] = 1
        edges.append(e)

# first/last per station per direction
# first/last per directed edge AND line ("A|B|LINE"): track shared by two lines has two timetables
line_num = {l['id']: l['num'] for l in lines}
fl = {}
for k, v in timings.get('dir', {}).items():
    parts = k.split('|')
    if len(parts) != 3: continue  # old crawl format
    a, b, lid = parts
    expected = 3 if v.get('via') else 2
    if v.get('nstations') != expected: continue
    if v.get('via') and v.get('line_no') not in (None, line_num.get(lid)):
        print(f'WARN {k}: planner answered with line_no {v.get("line_no")}, skipping')
        continue
    fl[k] = {'line': lid, 'to': v.get('to'), 'platform': v.get('platform'), 'first': v.get('first'), 'last': v.get('last')}

# ---- validation: fail the build on data that would mislead riders ----
problems = []
seen_pos = {}
for c, st in stations.items():
    key = (round(st['lat'], 4), round(st['lng'], 4))
    if key in seen_pos:
        problems.append(f'duplicate coordinates {c} == {seen_pos[key]}')
    seen_pos[key] = c
    if not (28.2 < st['lat'] < 29.0 and 76.7 < st['lng'] < 77.6):
        problems.append(f'{c} outside Delhi NCR')
for e in edges:
    if e['km'] < 0.3:
        problems.append(f"edge {e['a']}-{e['b']} only {e['km']} km")
# every station reachable from every other
gr = {}
for e in edges:
    gr.setdefault(e['a'], set()).add(e['b']); gr.setdefault(e['b'], set()).add(e['a'])
start = next(iter(stations)); seen = {start}; q = [start]
for u in q:
    for v in gr.get(u, ()):
        if v not in seen: seen.add(v); q.append(v)
if len(seen) != len(stations):
    problems.append(f'disconnected: {sorted(set(stations) - seen)}')
if problems:
    raise SystemExit('Data validation failed:\n  ' + '\n  '.join(problems))

net = {
    'city': 'delhi',
    'generated': timings.get('generated') or None,
    'lines': lines,
    'stations': sorted(stations.values(), key=lambda s: s['name']),
    'edges': edges,
    'firstLast': fl,
}
json.dump(net, open(os.path.join(out, 'network.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
json.dump(details, open(os.path.join(out, 'details.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
print('stations', len(stations), 'edges', len(edges))
for l in lines:
    print(l['id'], l['name'], len(l['stations']), 'branches', [len(b) for b in l['branches']], l['start'], '->', l['end'])
