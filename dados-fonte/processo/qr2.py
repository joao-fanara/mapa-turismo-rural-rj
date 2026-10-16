# releitura de QR nas páginas onde faltou: escalas maiores + recortes em faixas
import pypdfium2 as P, cv2, numpy as np, json
bad = json.load(open('tur/work/paginas_ruins.json')); qr = json.load(open('tur/work/qr.json'))
have = {(q['pdf'], q['page'], q['url']) for q in qr}; d = cv2.QRCodeDetector(); novos = 0
for f, pg, n_atr, n_qr in bad:
    page = P.PdfDocument(f'tur/pdf/{f:02}.pdf')[pg - 1]; found = {}
    for s in (5, 6, 8):
        im = np.array(page.render(scale=s).to_pil().convert('L')); H, Wd = im.shape
        tries = [(im, 0, 0)]
        for x0 in (0, Wd // 2):            # metades esquerda/direita (spreads e coluna do QR)
            for k in range(4):             # faixas verticais sobrepostas
                y0 = max(0, k * H // 4 - H // 10); y1 = min(H, (k + 1) * H // 4 + H // 10)
                tries.append((im[y0:y1, x0:x0 + Wd // 2], x0, y0))
        for sub, x0, y0 in tries:
            for img in (sub, cv2.threshold(sub, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]):
                ok, txt, pts, _ = d.detectAndDecodeMulti(img)
                if not ok: continue
                for t, p in zip(txt, pts):
                    if t and t not in found:
                        found[t] = ((float(p[:, 1].mean()) + y0) / H, (float(p[:, 0].mean()) + x0) / Wd)
        if len(found) >= n_atr: break
    for t, (y, x) in found.items():
        if (f, pg, t) not in have:
            qr.append(dict(pdf=f, page=pg, y=round(y, 3), x=round(x, 3), url=t)); novos += 1
    print(f, pg, 'atrativos', n_atr, 'qr antes', n_qr, 'agora', len(found), flush=True)
json.dump(qr, open('tur/work/qr.json', 'w'), indent=0)
print('novos QR:', novos)
