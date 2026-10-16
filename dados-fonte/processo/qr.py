import pypdfium2 as P, cv2, numpy as np, json, sys
d=cv2.QRCodeDetector(); out=[]
for f in range(1,13):
  doc=P.PdfDocument(f'tur/pdf/{f:02}.pdf')
  for i,pg in enumerate(doc):
    found={}
    for s in (2,3,4):
      im=np.array(pg.render(scale=s).to_pil().convert('L'))
      ok,txt,pts,_=d.detectAndDecodeMulti(im)
      if ok:
        for t,p in zip(txt,pts):
          if t and t not in found: found[t]=(float(p[:,1].mean())/im.shape[0], float(p[:,0].mean())/im.shape[1])
    for t,(y,x) in found.items(): out.append(dict(pdf=f,page=i+1,y=round(y,3),x=round(x,3),url=t))
  print(f,sum(1 for o in out if o['pdf']==f),flush=True)
json.dump(out,open('tur/work/qr.json','w'),indent=0)
