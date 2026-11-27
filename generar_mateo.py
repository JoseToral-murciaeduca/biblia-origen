"""Genera los capítulos de Mateo para Biblia Origen (Python 3, sin dependencias)."""
import argparse
import io
import json
import re
import shutil
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
URL = 'https://ebible.org/Scriptures/spaRV1909_usfx.zip'
COUNTS = [25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20]
NOTES = {
    1: {7:'Algunos testigos griegos leen Asaf en lugar de Asa.',10:'Algunos testigos griegos leen Amós en lugar de Amón.',16:'Existen variantes en la formulación de la relación de José, María y Jesús.'},
    6: {13:'La doxología final del Padre nuestro se conserva en RV1909; no figura en el texto principal de numerosas ediciones críticas modernas.'},
    17: {21:'Versículo conservado en RV1909, ausente del texto principal de SBLGNT.'},
    18: {11:'Versículo conservado en RV1909, ausente del texto principal de SBLGNT.'},
    23: {14:'Versículo conservado en RV1909, ausente del texto principal de SBLGNT.'},
}
NOTE_SRC = {1:'https://classic.net.bible.org/bible.php?book=Mat&chapter=1&mode=print',6:'https://www.biblegateway.com/passage/?search=Matthew%206%3A13&version=NET',17:'https://openwordbible.org/variants/',18:'https://openwordbible.org/variants/',23:'https://openwordbible.org/variants/'}


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def get_xml(source):
    if source:
        raw = Path(source).read_bytes()
    else:
        with urllib.request.urlopen(URL, timeout=90) as r:
            raw = r.read()
    if zipfile.is_zipfile(io.BytesIO(raw)):
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            names = [n for n in z.namelist() if n.lower().endswith('.xml')]
            for name in names:
                root = ET.fromstring(z.read(name))
                if any(e.tag.rsplit('}',1)[-1]=='book' and e.get('id')=='MAT' for e in root.iter()):
                    return root
            raise ValueError('No se encontró Mateo en los XML del ZIP.')
    return ET.fromstring(raw)


def extract(root):
    for node in root.iter():
        node.tag = node.tag.rsplit('}',1)[-1]
    book = next((e for e in root.iter('book') if e.get('id')=='MAT'), None)
    if book is None:
        raise ValueError('No se encontró el libro MAT.')
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
    if sorted(chapters) != list(range(1,29)):
        raise ValueError('La fuente no contiene exactamente los 28 capítulos.')
    for c,n in enumerate(COUNTS,1):
        if sorted(chapters[c]) != list(range(1,n+1)):
            raise ValueError(f'Numeración inesperada en Mateo {c}: {sorted(chapters[c])}')
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
    return ''.join(ch for ch in unicodedata.normalize('NFD',text.casefold()) if not unicodedata.combining(ch))


def compile_rules(rules):
    # Conserva tildes para no confundir palabras con distinta función.
    aliases = sorted({a for r in rules for a in r['aliases']},key=len,reverse=True)
    pattern=re.compile(r'(?<!\w)(?:'+'|'.join(map(re.escape,aliases))+r')(?!\w)',re.I)
    lookup={}
    for r in rules:
        for alias in r['aliases']:
            lookup.setdefault(alias.casefold(),[]).append(r)
    return pattern,lookup


def segments(text,c,v,pattern,lookup,used):
    out=[]; pos=0
    for m in pattern.finditer(text):
        candidates=[r for r in lookup[m.group().casefold()] if not r.get('scope') or f'{c}:{v}' in r['scope'] or f'{c}:*' in r['scope']]
        if len(candidates)!=1:
            continue  # no resolver automáticamente un referente ambiguo
        rule=candidates[0]
        if m.start()>pos: out.append(text[pos:m.start()])
        form=rule['form']
        if form.islower() and m.group()[0].isupper(): form=form[0].upper()+form[1:]
        out.append({'entryId':rule['entryId'],'form':form})
        used[rule['entryId']]+=1
        if 'suffix' in rule:
            out.extend([' ',rule['suffix']]); used[rule['suffix']['entryId']]+=1
        pos=m.end()
    if pos<len(text): out.append(text[pos:])
    return out or [text]


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--proyecto',type=Path,default=Path.cwd(),help='Raíz de Biblia Origen')
    p.add_argument('--fuente',help='ZIP USFX o XML local de eBible; si se omite, lo descarga')
    p.add_argument('--sobrescribir',action='store_true',help='Permite sustituir capítulos existentes, creando copia de seguridad')
    args=p.parse_args()
    entries=read_json(HERE/'dictionary-mateo.json'); rules=read_json(HERE/'reglas-mateo.json')
    project=args.proyecto.resolve(); data=project/'data'; dictionary=data/'dictionary.json'; catalog=data/'books.json'; dest=data/'books'/'mattai'
    if not dictionary.is_file() or not catalog.is_file():
        raise SystemExit('Ejecuta con --proyecto apuntando a la raíz que contiene data/books.json y data/dictionary.json.')
    old=read_json(dictionary); books=read_json(catalog)
    if not isinstance(old,dict) or not isinstance(books,list): raise ValueError('Formato de catálogo o diccionario incompatible.')
    if not any(b.get('id')=='mattai' and b.get('totalChapters')==28 for b in books):
        raise ValueError('books.json debe incluir mattai con totalChapters: 28 antes de generar.')
    targets=[dest/f'ch-{c:02d}.json' for c in range(1,29)]
    if not args.sobrescribir and any(t.exists() for t in targets):
        raise SystemExit('Ya existen capítulos de Mateo. Usa --sobrescribir para sustituirlos con respaldo.')
    chapters=extract(get_xml(args.fuente)); pattern,lookup=compile_rules(rules); used=Counter(); result=[]
    for c,verses in sorted(chapters.items()):
        doc={'bookId':'mattai','titleEntryId':'book_mattai','bookTitle':'Mattai','chapter':c,'verses':[]}
        for v,text in sorted(verses.items()):
            doc['verses'].append({'verse':v,'segments':segments(normalize(text),c,v,pattern,lookup,used)})
        if c in NOTES:
            doc['textualNotes']=[{'verse':v,'note':n,'source':NOTE_SRC[c]} for v,n in NOTES[c].items()]
        result.append(doc)
    needed=set(used)|{'book_mattai'}; additions={k:entries[k] for k in sorted(needed) if k not in old}
    merged={**old,**additions}
    # No se sobreescriben fichas existentes; registrar discrepancias para revisión humana.
    conflicts={k:{'existente':old[k].get('defaultForm'),'propuesta':entries[k]['defaultForm']} for k in sorted(needed & old.keys()) if isinstance(old[k],dict) and old[k].get('defaultForm')!=entries[k]['defaultForm']}
    if any(not isinstance(merged[k],dict) for k in needed): raise ValueError('Hay fichas de diccionario no válidas.')
    if any(not isinstance(s,str) and s['entryId'] not in merged for d in result for v in d['verses'] for s in v['segments']): raise ValueError('Referencia de diccionario sin ficha.')
    backup=project/'respaldo-mateo'; idx=1
    while backup.exists(): backup=project/f'respaldo-mateo-{idx}';idx+=1
    backup.mkdir(); shutil.copy2(dictionary,backup/'dictionary.json')
    for t in targets:
        if t.exists(): shutil.copy2(t,backup/t.name)
    for t,doc in zip(targets,result): write_json(t,doc)
    write_json(dictionary,merged)
    write_json(backup/'dictionary-nuevas-entradas.json',additions)
    write_json(backup/'informe.json',{'fuente':URL,'capitulos':len(result),'versiculos':sum(len(d['verses']) for d in result),'entradas_nuevas':len(additions),'referencias_por_id':dict(used),'conflictos_de_forma':conflicts,'pendiente':'Revisión humana versículo por versículo; las reglas son selectivas, no una alineación interlineal completa.'})
    print(f'Generados: {len(result)} capítulos y {sum(COUNTS)} versículos. Nuevas fichas: {len(additions)}.')
    print('Respaldo e informe:',backup)
    if conflicts: print('Revisa las discrepancias con el diccionario existente en informe.json.')

if __name__=='__main__': main()
