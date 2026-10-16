import json, re, urllib.request, concurrent.futures as cf
qr=json.load(open('tur/work/qr.json'))
def coords(u):
    try:
        for _ in range(6):
            req=urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'})
            class N(urllib.request.HTTPRedirectHandler):
                def redirect_request(s,*a,**k): return None
            o=urllib.request.build_opener(N)
            try: r=o.open(req,timeout=20); body=r.read().decode('utf8','ignore'); loc=None
            except urllib.error.HTTPError as e: loc=e.headers.get('Location'); body=''
            s=(loc or '')+body
            m=re.search(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)',s) or re.search(r'[@=](-2\d\.\d+),\s*(-4\d\.\d+)',s) or re.search(r'(-2\d\.\d{4,})(?:%2C|,)\s*(-4\d\.\d{4,})',s)
            if m: return float(m[1]),float(m[2]),loc or u
            if not loc: return None,None,u
            u=urllib.parse.urljoin(u,loc)
    except Exception as e: return None,None,str(e)
    return None,None,u
with cf.ThreadPoolExecutor(16) as ex:
    for q,(la,lo,fin) in zip(qr,ex.map(coords,[q['url'] for q in qr])): q.update(lat=la,lng=lo,final=fin)
json.dump(qr,open('tur/work/qr_coords.json','w'),indent=0)
print(len(qr),'com coord:',sum(q['lat'] is not None for q in qr))
for q in [q for q in qr if q['lat'] is None][:8]: print(q['url'],q['final'][:120])
