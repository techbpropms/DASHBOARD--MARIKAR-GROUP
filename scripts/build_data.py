"""Summarise a Tally "Service Bill Register" export into the CSVs the dashboard reads.

Usage: python3 scripts/build_data.py <register.xls|.xlsx> [out_dir=data]

The Tally ".xls" export is really an .xlsx file, so it is opened by content, not extension.
Only aggregates are written; customer names, phones and vehicle numbers never leave the register.
"""
import openpyxl,sys,collections,csv,re
src,out=sys.argv[1],(sys.argv[2] if len(sys.argv)>2 else "data")
ws=openpyxl.load_workbook(open(src,"rb"),read_only=True,data_only=True).worksheets[0]
rows=list(ws.iter_rows(values_only=True))
hdr=[re.sub(r'\s+',' ',(h or '').replace('_x000D_','')).strip() for h in rows[9]]
n=lambda v: v if isinstance(v,(int,float)) else 0
LAB=[13,14,17,18,19,20,21,22,25,26,27,28,29,30]
GROUP={9:'Spare parts',23:'Accessories',31:'AMC & warranty',32:'AMC & warranty',24:'Branch transfers'}
for i in LAB: GROUP[i]='Labour & service charges'
SERVICE={'Service Bill','AMC Service Bill'}
mon=collections.defaultdict(lambda: collections.defaultdict(float))
stream=collections.defaultdict(float)
heads=collections.defaultdict(float)
vt=collections.defaultdict(lambda:[0,0.0,0.0])
day=collections.defaultdict(lambda:[0,0,0.0])
items=collections.defaultdict(lambda:[0,0.0,0,collections.Counter()])
cur=None
for r in rows[10:-1]:
  if r[0] is not None:
    d=r[0]; m=d.strftime('%Y-%m'); t=r[2]
    plus=sum(n(r[i]) for i in GROUP); disc=n(r[15])+n(r[16]); gst=n(r[10])+n(r[11])
    g=n(r[8]); ro=n(r[12]); res=g-(plus-disc+gst)
    if not(abs(res-ro)<0.02 or abs(res+ro)<0.02): g=-g
    taxable=plus-disc
    M=mon[m]; M['invoices']+=1; M['gross']+=g; M['taxable']+=taxable; M['gst']+=gst; M['discount']+=disc
    if t in SERVICE: M['service_jobs']+=1; M['service_gross']+=g
    for i,grp in GROUP.items():
      if n(r[i]): stream[(m,grp)]+=n(r[i]); heads[(hdr[i],grp)]+=n(r[i])
    stream[(m,'Discounts')]-=disc
    if n(r[15]): heads[(hdr[15],'Discounts')]-=n(r[15])
    if n(r[16]): heads[(hdr[16],'Discounts')]-=n(r[16])
    V=vt[t]; V[0]+=1; V[1]+=g; V[2]+=taxable
    D=day[d.strftime('%Y-%m-%d')]; D[0]+=1; D[1]+= t in SERVICE; D[2]+=g
    cur=t
  else:
    p=r[1]; mm=re.match(r'^(.*)\[([^\]]+)\]\s*$',p)
    name,pn=(mm.group(1).strip(),mm.group(2).strip()) if mm else (p.strip(),'')
    I=items[(pn,name)]; I[0]+=n(r[6]); I[1]+=n(r[7]); I[2]+=1; I[3][cur]+=1
def w(fn,cols,data):
  with open(f'{out}/{fn}','w',newline='') as f:
    x=csv.writer(f); x.writerow(cols); x.writerows(data)
months=sorted(mon)
w('monthly.csv',['month','invoices','service_jobs','gross','taxable','gst','discount','service_gross'],
  [[m,int(mon[m]['invoices']),int(mon[m]['service_jobs'])]+[round(mon[m][k],2) for k in ['gross','taxable','gst','discount','service_gross']] for m in months])
w('streams.csv',['month','stream','amount'],[[m,s,round(v,2)] for (m,s),v in sorted(stream.items())])
w('heads.csv',['head','group','amount'],sorted([[h,g,round(v,2)] for (h,g),v in heads.items()],key=lambda x:-x[2]))
w('voucher_types.csv',['voucher_type','invoices','gross','taxable'],sorted([[k,v[0],round(v[1],2),round(v[2],2)] for k,v in vt.items()],key=lambda x:-x[2]))
w('daily.csv',['date','invoices','service_jobs','gross'],[[k,v[0],v[1],round(v[2],2)] for k,v in sorted(day.items())])
it=sorted(items.items(),key=lambda kv:-kv[1][1])
chan=lambda c: 'Service' if c['Service Bill']+c['AMC Service Bill']>=sum(c.values())/2 else ('Branch transfer' if c['Branch Transfer Out Spare']>=sum(c.values())/2 else 'Counter sale')
w('items.csv',['part_no','item','qty','value','lines','main_channel'],[[pn or nm,nm,q,round(v,2),l,chan(c)] for (pn,nm),(q,v,l,c) in it[:150]])
print(f"{len(rows)} rows -> {out}/ ({len(items)} distinct items, item value {sum(v[1] for v in items.values()):,.2f})")
