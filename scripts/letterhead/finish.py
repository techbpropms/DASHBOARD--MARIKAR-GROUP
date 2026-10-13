import sys
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, NameObject
r=PdfReader(sys.argv[1]); w=PdfWriter(clone_from=r)
for pg in w.pages:
    annots=pg.get('/Annots')
    if not annots: continue
    seen=set(); keep=ArrayObject()
    for a in annots:
        o=a.get_object(); key=(o.get('/A',{}).get('/URI'), tuple(round(float(x),1) for x in o.get('/Rect',[])))
        if key not in seen: seen.add(key); keep.append(a)
    pg[NameObject('/Annots')]=keep
w.add_metadata({'/Title':'HD Attingal Pilot Export — Reconciliation Note ('+sys.argv[3]+')','/Author':'Dr. Babu B., BPro Consulting & Technologies','/Subject':'Power BI data readiness: pilot export reconciliation (Marikar (Motors) Ltd, HD Attingal)','/Keywords':'BPro PMS, TallyPrime, reconciliation, Power BI'})
w.write(sys.argv[2])
r2=PdfReader(sys.argv[2]); print('pages',len(r2.pages),'| links per page:',[len(p.get('/Annots') or []) for p in r2.pages])
