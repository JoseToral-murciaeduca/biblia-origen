"""Añade tooltips a los 4 evangelios existentes sin modificar su texto visible."""
import argparse
import collections
import copy
import csv
import json
import re
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONFIG = {'MAT': (28, 'mateo'), 'MRK': (16, 'marcos'), 'LUK': (24, 'lucas'), 'JHN': (21, 'juan')}
COUNTS = {'MAT':[25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20], 'MRK':[45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20], 'LUK':[80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53], 'JHN':[51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25]}
# Homógrafos: nunca enlazar automáticamente estas formas como nombres sin contexto explícito.
COMMON = {'toma','ram','salmon','salmón','asa','rut','levi','leví','lázaro','lazaro','mar','simón','simon','juan','judas','jacob','jose','josé','maría','maria','yehudá','yaaqov','yojanan','shimón','elazar','eleazar','janan','ana','anna','marta','nain','naín','amón','amon','azor','ajaz','eli','tamar','jonás','jonas'}
# Some names are safe when the original rule explicitly restricts the location; no guessing.

def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def valid(e): return isinstance(e,dict) and isinstance(e.get('meaning'),str) and bool(e['meaning'].strip()) and e['meaning'].strip().lower() not in {'—','-','pendiente','sin datos','sin definir'}
def text_of(segments,d):
    return ''.join(s if isinstance(s,str) else (s.get('form') or d.get(s['entryId'],{}).get('defaultForm') or s['entryId']) for s in segments)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--proyecto',type=Path,default=Path.cwd())
    p.add_argument('--aplicar',action='store_true',help='Escribe los cambios con respaldo previo; sin esta opción sólo audita.')
    p.add_argument('--extra',type=Path,help='JSON opcional: {entries: {...}, extra: [{entryId, aliases, scopes opcional}]} para ampliar las reglas revisadas.')
    args=p.parse_args(); root=args.proyecto.resolve(); data=root/'data'; dp=data/'dictionary.json'; books=read(data/'books.json'); old=read(dp); merged=copy.deepcopy(old)
    if not isinstance(old,dict) or not isinstance(books,list): raise ValueError('Catálogo o diccionario incompatible.')
    bundle=read(HERE/'datos-tooltips.json'); entries=bundle['entries']; extras=bundle['extra']; rules=bundle['rules']
    if args.extra:
        x=read(args.extra); entries.update(x.get('entries',{})); extras.extend(x.get('extra',[]))
    planned=[]; added=set(); repaired=set(); missing=collections.Counter(); ambiguity=collections.Counter(); residual=collections.defaultdict(lambda: {'count':0,'refs':[]}); links=collections.Counter(); notes=[]
    def ensure(key):
        if valid(merged.get(key)): return True
        if not valid(entries.get(key)): return False
        if key in merged and not isinstance(merged[key],dict): return False
        if key in merged:
            # Fill missing fields only; preserve existing descriptions and metadata.
            e=merged[key]
            for k,v in entries[key].items():
                if not e.get(k) or (k=='meaning' and not valid(e)): e[k]=copy.deepcopy(v)
            repaired.add(key)
        else: merged[key]=copy.deepcopy(entries[key]); added.add(key)
        return valid(merged.get(key))
    for code,(n,name) in CONFIG.items():
        hits=[b for b in books if b.get('testament')=='nt' and b.get('category')=='evangelios' and b.get('totalChapters')==n]
        if len(hits)!=1: raise ValueError(f'No se puede identificar {name} de forma única en books.json.')
        bid=hits[0]['id']; assert re.fullmatch(r'[\w-]+',bid), 'ID inválido'
        if code=='MAT': title='book_mattai'
        elif code=='MRK': title='book_marqos'
        elif code=='LUK': title='book_loukas'
        else: title='book_yojanan'
        # Allow catalog variants without creating wrong links.
        for c in range(1,n+1):
            target=data/'books'/bid/f'ch-{c:02d}.json'
            if not target.is_file(): raise SystemExit(f'Falta {target}. Genera los cuatro evangelios antes de corregirlos.')
            doc=read(target); verses=doc['verses']
            if doc.get('bookId')!=bid or doc.get('chapter')!=c or [v['verse'] for v in verses]!=list(range(1,COUNTS[code][c-1]+1)): raise ValueError(f'Capítulo o numeración incorrectos: {target}')
            tid=doc.get('titleEntryId') or 'book_'+bid
            if not valid(merged.get(tid)) and tid not in entries and title in entries: entries[tid]=copy.deepcopy(entries[title])
            if not ensure(tid): missing[f'{bid} {c} (título): {tid}']+=1
            for verse in verses:
                v=verse['verse']; ref=f'{bid} {c}:{v}'; original=verse['segments']; before=text_of(original,old)
                candidates=collections.defaultdict(set)
                # Build a contextual rule index. All displayed text is kept verbatim.
                for r in rules[code]:
                    scope=r.get('scope',[])
                    if scope and f'{c}:{v}' not in scope and f'{c}:*' not in scope: continue
                    key=r['entryId']; e=entries.get(key,{})
                    for a in set(r['aliases']+[r['form']]):
                        # Combined aliases would erase distinction between two entries.
                        if r.get('suffix') and a in r['aliases']: continue
                        if a.casefold() in COMMON and not scope: continue
                        if e.get('category') in ('person','place','book') and a.islower(): continue
                        candidates[a.casefold()].add((key,2 if scope else 1))
                # Safe general name explanations, without identifying an ambiguous bearer.
                for a,key in {'yojanan':'glosario_nombre_yojanan','yaaqov':'glosario_nombre_yaaqov','yehudá':'glosario_nombre_yehuda','shimón':'glosario_nombre_shimon','elazar':'glosario_nombre_elazar'}.items():
                    if a not in candidates: candidates[a].add((key,0))
                for r in extras:
                    scope=r.get('scopes')
                    if scope and not any(s in scope.get(code,[]) for s in (f'{c}:{v}',f'{c}:*')): continue
                    for a in r['aliases']: candidates[a.casefold()].add((r['entryId'],3 if args.extra and r in x.get('extra',[]) and scope else 0))
                rx=re.compile(r'(?<!\w)(?:'+'|'.join(re.escape(a) for a in sorted(candidates,key=lambda a:(-len(a),a)))+r')(?!\w)',re.I) if candidates else None
                out=[]
                for seg in original:
                    if isinstance(seg,dict):
                        if not ensure(seg['entryId']): missing[f'{ref}: {seg["entryId"]}']+=1
                        # Freeze visible form if repairing defaultForm could otherwise change display.
                        if not seg.get('form'):
                            seg=dict(seg); seg['form']=text_of([seg],old)
                        out.append(seg); continue
                    if not isinstance(seg,str): raise ValueError(f'Segmento inválido: {ref}')
                    pos=0
                    for m in rx.finditer(seg) if rx else ():
                        options=candidates[m.group().casefold()]; priority=max(i for _,i in options); keys={k for k,i in options if i==priority}
                        if len(keys)!=1:
                            ambiguity[f'{ref}: {m.group()} -> {", ".join(sorted(keys))}']+=1; continue
                        key=next(iter(keys)); e=entries.get(key,{})
                        if e.get('category') in ('person','place','book') and not m.group()[0].isupper(): continue
                        if not ensure(key): missing[f'{ref}: {key}']+=1; continue
                        if m.start()>pos: out.append(seg[pos:m.start()])
                        out.append({'entryId':key,'form':m.group()}); links[code]+=1; pos=m.end()
                    if pos<len(seg): out.append(seg[pos:])
                    if not seg: out.append(seg)
                # Do not publish any changed rendered wording (including default-form repairs).
                if text_of(out,merged)!=before: raise ValueError(f'El texto visible cambió: {ref}; no se escribe nada.')
                verse['segments']=out
                for s in out:
                    if isinstance(s,str):
                        for word in re.findall(r'[^\W\d_]+(?:[-’\'][^\W\d_]+)*',s,re.UNICODE):
                            rec=residual[word]; rec['count']+=1
                            if ref not in rec['refs']: rec['refs'].append(ref)
            planned.append((target,doc))
    report=root/'revision-tooltips'; report.mkdir(exist_ok=True)
    with (report/'vocabulario-sin-tooltip.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f,delimiter=';'); w.writerow(['palabra','apariciones','referencias','revisión editorial'])
        for word,r in sorted(residual.items(),key=lambda x:x[0].casefold()): w.writerow([word,r['count'],' | '.join(r['refs']),''])
    result={'capitulos':len(planned),'versiculos':sum(len(d['verses']) for _,d in planned),'nuevos_enlaces':dict(links),'fichas_nuevas':sorted(added),'fichas_reparadas':sorted(repaired),'referencias_sin_definicion':dict(missing),'ambiguas':dict(ambiguity),'palabras_distintas_sin_tooltip':len(residual),'revision_editorial_pendiente':True}
    write(report/'informe.json',result)
    print(json.dumps({k:v for k,v in result.items() if k not in ('referencias_sin_definicion','ambiguas','fichas_nuevas','fichas_reparadas')},ensure_ascii=False,indent=2))
    print(f'Fichas nuevas: {len(added)}; reparadas: {len(repaired)}; incidencias sin definición: {len(missing)}; ambiguas: {len(ambiguity)}.')
    print('Informe y vocabulario completo sin enlazar:',report)
    if not args.aplicar: print('Simulación: no se modificaron capítulos ni diccionario.'); return
    if missing: raise SystemExit('Hay referencias sin definición: corrige las incidencias del informe antes de aplicar.')
    backup=root/'respaldo-tooltips'; i=1
    while backup.exists(): backup=root/f'respaldo-tooltips-{i}'; i+=1
    backup.mkdir(); shutil.copy2(dp,backup/'dictionary.json')
    for target,doc in planned:
        saved=backup/target.relative_to(data); saved.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(target,saved)
    for target,doc in planned: write(target,doc)
    write(dp,merged)
    write(report/'dictionary-nuevas-entradas.json',{k:merged[k] for k in sorted(added|repaired)})
    print('Cambios guardados. Respaldo:',backup)
    print('Revisión lingüística manual pendiente: no se certifica cobertura total.')

if __name__=='__main__': main()
