"""Crawl first/last train per station & direction + edge travel times from the DMRC journey planner.

Usage: python3 -I scripts/fetch_delhi_timings.py <raw_dir> <network.json> [YYYY-MM-DD]
Writes <raw_dir>/timings.json
"""
import json, sys, os, time, threading, subprocess, datetime
from concurrent.futures import ThreadPoolExecutor

raw, netp = sys.argv[1], sys.argv[2]
day = sys.argv[3] if len(sys.argv) > 3 else None
if not day:
    d = datetime.date.today()
    while d.weekday() != 1: d += datetime.timedelta(days=1)  # next Tuesday
    day = d.isoformat()
nxt = (datetime.date.fromisoformat(day) + datetime.timedelta(days=1)).isoformat()
net = json.load(open(netp))
B = 'https://backend.delhimetrorail.com/api/v2/en/station_route/{a}/{b}/least-distance/{t}'
H = {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.delhimetrorail.com/', 'Origin': 'https://www.delhimetrorail.com'}
cache_p = os.path.join(raw, 'route_cache.json')
cache = json.load(open(cache_p)) if os.path.exists(cache_p) else {}
lock = threading.Lock()

def get(a, b, t):
    k = f'{a}|{b}|{t}'
    with lock:
        if k in cache: return cache[k]
    for attempt in range(4):
        try:
            out = subprocess.run(['curl', '-s', '-m', '40', '-A', H['User-Agent'], '-H', 'Referer: ' + H['Referer'], '-H', 'Origin: ' + H['Origin'], B.format(a=a, b=b, t=t)], capture_output=True, timeout=60).stdout
            r = json.loads(out)
            with lock: cache[k] = r
            return r
        except Exception as e:
            time.sleep(1.5 * (attempt + 1))
    return None

def hms(s):
    if not s: return None
    h, m, *rest = s.split(':'); sec = int(rest[0]) if rest else 0
    return int(h) * 3600 + int(m) * 60 + sec

def leg(r):
    if not r or not r.get('route'): return None
    return r['route'][0]

def dep(a, b, date, minute):
    t = f'{date}T{minute // 60:02d}:{minute % 60:02d}:00.000'
    l = leg(get(a, b, t))
    if not l or not l.get('new_start_time'): return None
    s = hms(l['new_start_time'])
    if s is None: return None
    return s

def crawl(pair):
    a, b, line = pair
    r = get(a, b, f'{day}T02:00:00.000')
    l = leg(r)
    if not l: return pair, None
    res = {
        'line': line, 'to': l.get('towards_station'), 'platform': l.get('platform_name'),
        'first': l.get('new_start_time'), 'path': l.get('map-path'), 'nstations': r.get('stations'),
        'edge_s': hms(l.get('path_time')), 'fare': r.get('fare'), 'line_name': l.get('line'),
    }
    # last train: largest minute m in [20:00, 23:59] where dep valid and >= m*60
    def ok(m):
        s = dep(a, b, day, m)
        return s is not None and s >= m * 60
    lo, hi = 20 * 60, 23 * 60 + 59
    if ok(hi):
        # runs past midnight: search next day 00:00-02:30
        def ok2(m):
            s = dep(a, b, nxt, m)
            return s is not None and s < 3 * 3600 and s >= m * 60
        if ok2(0):
            lo2, hi2 = 0, 150
            while lo2 < hi2:
                mid = (lo2 + hi2 + 1) // 2
                if ok2(mid): lo2 = mid
                else: hi2 = mid - 1
            s = dep(a, b, nxt, lo2)
            res['last'] = '%02d:%02d:%02d' % (24 + s // 3600, s % 3600 // 60, s % 60)
            return pair, res
        s = dep(a, b, day, hi)
        res['last'] = '%02d:%02d:%02d' % (s // 3600, s % 3600 // 60, s % 60)
        return pair, res
    if not ok(lo):
        lo = 17 * 60
        if not ok(lo):
            res['last'] = None
            return pair, res
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if ok(mid): lo = mid
        else: hi = mid - 1
    s = dep(a, b, day, lo)
    res['last'] = '%02d:%02d:%02d' % (s // 3600, s % 3600 // 60, s % 60)
    return pair, res

pairs = []
for e in net['edges']:
    pairs.append((e['a'], e['b'], e['line']))
    pairs.append((e['b'], e['a'], e['line']))
out = {'generated': datetime.datetime.now().isoformat(timespec='seconds'), 'day': day, 'edge': {}, 'dir': {}}
done = 0
with ThreadPoolExecutor(max_workers=5) as ex:
    for pair, res in ex.map(crawl, pairs):
        done += 1
        if done % 50 == 0:
            print('progress', done, '/', len(pairs), flush=True)
            with lock: json.dump(cache, open(cache_p, 'w'))
        a, b, line = pair
        if not res:
            print('FAIL', pair, flush=True); continue
        out['dir'][f'{a}|{b}'] = res
        if res.get('edge_s') and res.get('nstations') == 2:
            out['edge'][f'{a}|{b}'] = res['edge_s']
json.dump(cache, open(cache_p, 'w'))
json.dump(out, open(os.path.join(raw, 'timings.json'), 'w'), indent=0)
print('done', len(out['dir']))
