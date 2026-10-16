# resolve só os QR que ainda não estão em qr_coords.json (sequencial, respeitando o limite do me-qr)
import json, time
src = open('tur/work/resolve.py').read().split('with cf.')[0]; exec(src)
qr = json.load(open('tur/work/qr.json')); qc = json.load(open('tur/work/qr_coords.json'))
tem = {(q['pdf'], q['page'], q['url']) for q in qc}
for q in [q for q in qr if (q['pdf'], q['page'], q['url']) not in tem]:
    for t in range(6):
        la, lo, fin = coords(q['url'])
        if la or fin != q['url']: break
        time.sleep(30 * (t + 1))
    q.update(lat=la, lng=lo, final=fin); qc.append(q); time.sleep(4)
    print(q['pdf'], q['page'], la, lo, flush=True)
json.dump(qc, open('tur/work/qr_coords.json', 'w'), indent=0)
print('total com coord:', sum(q['lat'] is not None for q in qc))
