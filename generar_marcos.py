"""Biblia Origen: genera Marcos desde un XML USFX local (Python 3.10+)."""
import argparse
import io
import json
import re
import shutil
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONFIG = {
    'MRK': {'name':'Marqos','title_id':'book_marqos','aliases':['marcos','marqos','markos','mark','mrk','san marcos'], 'counts':[45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20]}
}
NOTES = {'MRK': {16:{9:'Marcos 16:9–20: algunos testimonios griegos antiguos terminan en 16:8; otros transmiten el final largo. Se conserva íntegro según RV1909.'}}}
NOTE_SRC = 'https://www.bible.com/bible/107/MRK.16.NET'

def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

def get_root(source, code):
    raw=source.read_bytes()
    if zipfile.is_zipfile(io.BytesIO(raw)):
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            for name in z.namelist():
                if name.lower().endswith('.xml'):
                    root=ET.fromstring(z.read(name))
                    if any(e.tag.rsplit('}',1)[-1]=='book' and e.get('id')==code for e in root.iter()): return root
        raise ValueError(f'No se encontró {code} en el ZIP.')
    return ET.fromstring(raw)

def extract(root, code, counts):
    for node in root.iter():
        node.tag = node.tag.rsplit('}',1)[-1]
    book = next((e for e in root.iter('book') if e.get('id')==code), None)
    if book is None:
        raise ValueError(f'No se encontró el libro {code}.')
    chapters = {}; c = v = None; parts = []
    skip = {'id','h','toc','mt','mte','s','r','sr','mr','f','fe','ef','x','ex','fig','rem','cl','cp','periph','ref','rq','ca','va','vp','chapterLabel','bookTitle','b'}
    def save():
        nonlocal v, parts
        if v is not None:
            text = re.sub(r'\s+', ' ', ''.join(parts)).strip()
            if not text or v in chapters[c]:
                raise ValueError(f'Versículo vacío o duplicado: {c}:{v}')
            chapters[c][v] = text
        v = None; parts = []
    def append(text):
        if v is not None and text:
            parts.append(text)
    def visit(node):
        nonlocal c,v
        tag = node.tag
        if tag in skip or re.fullmatch(r'(?:toc|mt|s|ms|is|imt)\d+',tag):
            return
        if tag=='c':
            save(); c = int(node.get('id')); chapters[c] = {}
        elif tag=='v':
            save(); v = int(node.get('id'))
            if c is None: raise ValueError('Versículo sin capítulo.')
        elif tag=='ve':
            save(); return
        append(node.text)
        for child in node:
            visit(child); append(child.tail)
    visit(book); save()
    if sorted(chapters) != list(range(1,len(counts)+1)):
        raise ValueError(f'{code}: número de capítulos inesperado.')
    for c,n in enumerate(counts,1):
        if sorted(chapters[c]) != list(range(1,n+1)):
            raise ValueError(f'Numeración inesperada en {code} {c}: {sorted(chapters[c])}')
    return chapters


def normalize(text):
    # Sólo cambios ortográficos acotados, sin reformular el versículo.
    corrections = {'á':'a','é':'e','ó':'o','ú':'u','fué':'fue','fuí':'fui','vió':'vio','dió':'dio'}
    # No normalizar acentos de nombres antes de segmentar.
    def replace(m):
        s=m.group(); t=corrections.get(s.lower(),s)
        return t.capitalize() if s[0].isupper() else t
    return re.sub(r'\b(?:á|é|ó|ú|fué|fuí|vió|dió)\b',replace,text,flags=re.I)


def fold(text):
    return ''.join(ch for ch in unicodedata.normalize('NFD',str(text).casefold()) if not unicodedata.combining(ch)).strip()

def catalog_book(books, code, explicit):
    conf=CONFIG[code]
    if explicit:
        found=[b for b in books if b.get('id')==explicit]
    else:
        aliases={fold(a) for a in conf['aliases']}
        found=[b for b in books if b.get('testament')=='nt' and (fold(b.get('id','')) in aliases or fold(b.get('title','')) in aliases) and b.get('category')=='evangelios']
        if not found:
            found=[b for b in books if b.get('testament')=='nt' and b.get('category')=='evangelios' and b.get('totalChapters')==len(conf['counts'])]
    if len(found)!=1 or found[0].get('totalChapters')!=len(conf['counts']):
        raise ValueError(f'No se identifica un único libro {code} en books.json. Usa --id-marcos con el ID exacto y verifica totalChapters.')
    book=found[0]
    if book.get('testament')!='nt' or book.get('category')!='evangelios': raise ValueError('El ID debe corresponder a un evangelio del Nuevo Testamento.')
    if not re.fullmatch(r'[A-Za-z0-9_-]+',book['id']): raise ValueError('ID de libro no seguro.')
    return book

def compile_rules(rules):
    aliases=sorted({a for r in rules for a in r['aliases']},key=lambda a:(-len(a),a))
    pattern=re.compile(r'(?<!\w)(?:'+'|'.join(map(re.escape,aliases))+r')(?!\w)',re.I)
    lookup={}
    for r in rules:
        for a in r['aliases']:
            lookup.setdefault(a.casefold(),[]).append(r)
    return pattern,lookup

def segments(text,c,v,pattern,lookup,used,unresolved):
    out=[]; pos=0
    for m in pattern.finditer(text):
        candidates=lookup.get(m.group().casefold(),[])
        specific=[r for r in candidates if f'{c}:{v}' in r.get('scope',[])]
        chapter=[r for r in candidates if f'{c}:*' in r.get('scope',[])]
        general=[r for r in candidates if not r.get('scope')]
        matched=specific or chapter or general
        if len(matched)!=1:
            if len(matched)>1: unresolved.append({'chapter':c,'verse':v,'alias':m.group()})
            continue
        r=matched[0]
        if m.start()>pos: out.append(text[pos:m.start()])
        form=m.group() if r.get('keepText') else r['form']
        if form.islower() and m.group()[0].isupper(): form=form[0].upper()+form[1:]
        out.append({'entryId':r['entryId'],'form':form}); used[r['entryId']]+=1
        if 'suffix' in r:
            out.extend([' ',r['suffix']]); used[r['suffix']['entryId']]+=1
        pos=m.end()
    if pos<len(text): out.append(text[pos:])
    return out or [text]

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--fuente',type=Path,default=HERE/'spa-rv1909.usfx.xml',help='XML USFX o ZIP local; no se descarga nada')
    p.add_argument('--proyecto',type=Path,default=Path.cwd())
    p.add_argument('--libro',choices=['marcos'],default='marcos')
    p.add_argument('--id-marcos')
    p.add_argument('--sobrescribir',action='store_true')
    p.add_argument('--simular',action='store_true',help='Valida y muestra recuentos sin modificar archivos')
    args=p.parse_args()
    if not args.fuente.is_file(): raise SystemExit(f'No existe el XML local: {args.fuente}. Indica su ruta con --fuente.')
    data=args.proyecto.resolve()/'data'; dictionary=data/'dictionary.json'; catalog=data/'books.json'
    old=read_json(dictionary); books=read_json(catalog)
    if not isinstance(old,dict) or not isinstance(books,list): raise ValueError('Formato de catálogo o diccionario incompatible.')
    entries=read_json(HERE/'dictionary-marcos.json'); rules=read_json(HERE/'reglas-marcos.json')
    needed={}; planned=[]; report={}; all_used=Counter()
    for code in ['MRK']:
        conf=CONFIG[code]; book=catalog_book(books,code,args.id_marcos)
        bid=book['id']; titleid='book_'+bid
        # Keep the existing ID and existing title entry if it exists.
        title_entry=dict(entries[conf['title_id']]); title_entry['banner']=book.get('banner','')
        needed[titleid]=title_entry
        title=(old.get(titleid) or {}).get('defaultForm') or title_entry['defaultForm']
        chapters=extract(get_root(args.fuente,code),code,conf['counts']); pattern,lookup=compile_rules(rules[code]); used=Counter(); unresolved=[]
        for c,verses in sorted(chapters.items()):
            doc={'bookId':bid,'titleEntryId':titleid,'bookTitle':title,'chapter':c,'verses':[]}
            for v,text in sorted(verses.items()):
                doc['verses'].append({'verse':v,'segments':segments(normalize(text),c,v,pattern,lookup,used,unresolved)})
            if c in NOTES.get(code,{}): doc['textualNotes']=[{'verse':v,'note':n,'source':NOTE_SRC} for v,n in NOTES[code][c].items()]
            planned.append((data/'books'/bid/f'ch-{c:02d}.json',doc))
        for key in used: needed[key]=entries[key]
        all_used.update(used)
        report[code]={'bookId':bid,'chapters':len(chapters),'verses':sum(len(v) for v in chapters.values()),'terms':dict(used),'ambiguous':unresolved}
        print(f'{title} ({bid}): {len(chapters)} capítulos, {report[code]["verses"]} versículos, {len(used)} fichas usadas.')
    additions={k:v for k,v in needed.items() if k not in old}
    merged={**old,**additions}
    if any(not isinstance(merged[k],dict) for k in needed): raise ValueError('Entrada de diccionario inválida.')
    conflicts={k:{'existente':old[k].get('defaultForm'),'propuesta':v.get('defaultForm')} for k,v in needed.items() if k in old and old[k].get('defaultForm')!=v.get('defaultForm')}
    for target,doc in planned:
        if not args.sobrescribir and target.exists() and not args.simular: raise SystemExit(f'Ya existe {target}. Usa --sobrescribir para sustituir con respaldo.')
        for verse in doc['verses']:
            for seg in verse['segments']:
                if isinstance(seg,dict) and seg['entryId'] not in merged: raise ValueError('Referencia sin diccionario.')
    print(f'Total: {len(planned)} capítulos; {sum(x["verses"] for x in report.values())} versículos; {len(additions)} nuevas fichas.')
    if args.simular:
        print('Simulación: ningún archivo modificado.'); return
    backup=args.proyecto.resolve()/'respaldo-marcos'; i=1
    while backup.exists(): backup=args.proyecto.resolve()/f'respaldo-marcos-{i}'; i+=1
    backup.mkdir(); shutil.copy2(dictionary,backup/'dictionary.json')
    for target,doc in planned:
        if target.exists():
            saved=backup/target.relative_to(data); saved.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(target,saved)
    for target,doc in planned: write_json(target,doc)
    write_json(dictionary,merged)
    write_json(backup/'dictionary-nuevas-entradas.json',additions)
    write_json(backup/'informe.json',{'fuente':str(args.fuente.resolve()),'libros':report,'entradas_nuevas':len(additions),'conflictos_de_forma':conflicts,'pendiente':'Revisión humana contextual. No es una edición interlineal exhaustiva.'})
    print('Respaldo e informe:',backup)
    if conflicts: print('Revisa conflictos de forma en informe.json; las fichas anteriores no se han sobrescrito.')

if __name__=='__main__':
    main()
