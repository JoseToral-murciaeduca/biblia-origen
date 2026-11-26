# Biblia Origen — Lucas y Juan

## Instalación (PowerShell)

Extrae los tres archivos de código y JSON de este paquete en la raíz de tu proyecto, junto a `spa-rv1909.usfx.xml` (el XML de la Reina-Valera 1909 usado para Mateo). No hace falta descargar de nuevo la Biblia. El programa no usa Internet ni paquetes externos.

1. `python generar_lucas_juan.py --fuente spa-rv1909.usfx.xml --simular`
2. Si la validación es satisfactoria: `python generar_lucas_juan.py --fuente spa-rv1909.usfx.xml`

Para un solo libro: añade `--libro lucas` o `--libro juan`. Para reemplazar capítulos existentes: añade `--sobrescribir` (crea respaldo). Si no reconoce un identificador de tu catálogo, añade `--id-lucas ID_REAL --id-juan ID_REAL`, sustituyendo ID_REAL por el identificador de cada libro en `data/books.json`. No renombra ni reordena el catálogo. Busca los libros de categoría evangelios por identificador, nombre o número de capítulos si son inequívocos. Los títulos propuestos son Loukas y Yojanan, pero se conserva la forma del título si existe una ficha `book_<id>` en el diccionario.

## Salida

- 24 JSON de Lucas (1.151 versículos esperados) y 21 de Juan (879), con los IDs del catálogo.
- `data/dictionary.json` ampliado exclusivamente con las fichas que falten y se utilicen.
- `respaldo-lucas-juan/`: copia del diccionario, capítulos sustituidos si existían, informe y `dictionary-nuevas-entradas.json` con las incorporaciones efectivas. Si existe la carpeta, se añade un sufijo numérico.

## Criterio editorial

Base: RV1909, adaptación ortográfica y lingüística selectiva. Se conservan los versículos según la fuente y se validan sus números antes de escribir. Las grafías griegas suelen ser lemas, no necesariamente formas flexionadas. Hebreo, arameo, siríaco y latín aportan equivalencias y testimonios complementarios, no un supuesto original arameo reconstruido. El programa no sustituye automáticamente todos los nombres homónimos ni cada ocurrencia de Dios/Señor. En Juan 1:41 y 1:42 mantiene la distinción entre el término semítico y su glosa. Las variantes textuales se guardan en `textualNotes`; el app.js anterior no las muestra todavía.

Referencias de partida: https://ebible.org/spaRV1909/ ; https://biblehub.com/interlinear/luke.htm ; https://biblehub.com/interlinear/john.htm ; https://openwordbible.org/variants/ . Las fichas contienen referencias lingüísticas particulares. Las transliteraciones son convenciones editoriales y las reglas necesitan revisión humana contextual antes de publicar; no son una concordancia interlineal exhaustiva.

## Validación realizada

Prueba con XML USFX sintético: 45 archivos, 2.030 versículos, identificación del catálogo, referencias del diccionario, conservación de glosas de Juan 1:42, modo simulación y respaldo. No se pudo descargar ni probar el XML real desde el entorno de creación. El ZIP contiene el generador y las propuestas, no los 45 capítulos ya generados. No subas a tu web el XML fuente ni los respaldos si no quieres publicarlos.
