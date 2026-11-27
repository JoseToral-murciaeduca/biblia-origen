# Biblia Origen — norma obligatoria de accesibilidad lingüística

## Regla de publicación
Toda palabra, nombre o expresión que no pertenezca al castellano actual comprensible, o cuyo sentido bíblico no resulte claro para un lector sin formación, debe disponer de tooltip en **cada aparición**. Se incluyen transliteraciones hebreas, arameas, siríacas, griegas y latinas, nombres restaurados, arcaísmos, expresiones idiomáticas, unidades, monedas, instituciones y términos religiosos especializados. No basta con que una ficha exista en el diccionario.

1. Mantener el texto base de referencia y la numeración. No modernizar en silencio ni introducir interpretaciones como texto bíblico.
2. Representar cada aparición pertinente mediante `{"entryId":"identificador","form":"forma exacta visible"}`. Las expresiones de varias palabras pueden ser un único segmento cuando su significado sea conjunto. Conservar espacios, signos y capitalización.
3. Cada identificador debe resolver a una ficha con `defaultForm`, `traditional`, `bridgeGloss` y `meaning` explicativo en castellano actual. Incluir `originalScript`, `transliteration`, `sourceNote`, referencias o notas de estudio cuando procedan y estén documentadas. No atribuir una grafía o etimología no comprobada; distinguir el griego transmitido de equivalencias semíticas y traducciones posteriores.
4. Explicar el sentido contextual y distinguir homógrafos. No asociar automáticamente «toma» como verbo con Tomás ni una persona concreta con un nombre compartido. Cuando sólo se conozca la equivalencia del nombre, una ficha general puede explicarla sin identificar al portador.
5. Reutilizar fichas equivalentes; corregir discrepancias de manera explícita. No crear fichas vacías ni convertir palabras comunes en enlaces por defecto.
6. Antes de publicar: validar capítulos y numeración; comprobar que cada `entryId` existe y su explicación es sustantiva; comprobar todas las formas visibles y revisar manualmente el vocabulario no enlazado y las ambigüedades con su contexto. Si algo es incomprensible y no está explicado, añadir una ficha y segmentar el texto. Una lista automática de términos no garantiza cobertura total.
7. Los tres modos de lectura conservan los mismos enlaces interactivos. Revisar visualmente al menos una ficha en cada modo y que el inspector y los tooltips funcionan.

## Uso del corrector de los evangelios
Colocar `corregir_tooltips.py` y `datos-tooltips.json` en la raíz de Biblia Origen. No necesita XML ni Internet. Trabaja sobre los 89 capítulos existentes.

- `python corregir_tooltips.py` crea un informe y el CSV de vocabulario aún no enlazado, sin tocar los JSON bíblicos.
- `python corregir_tooltips.py --aplicar` aplica las coincidencias conocidas, si no quedan referencias a fichas sin definición. Crea un respaldo y lista las fichas nuevas/reparadas.
- Revisar `revision-tooltips/informe.json` y `vocabulario-sin-tooltip.csv` antes de declarar los libros completos. El CSV contiene también palabras corrientes, no todas necesitan tooltip.
- Para ampliar las reglas, crear un JSON con `entries` y `extra`. Ejemplo: `{"entries":{"ejemplo":{"defaultForm":"...","traditional":"...","bridgeGloss":"...","meaning":"..."}},"extra":[{"entryId":"ejemplo","aliases":["..."],"scopes":{"MAT":["1:2"]}}]}`. Ejecutar con `--extra archivo.json`. Los códigos admitidos son MAT, MRK, LUK, JHN; las referencias se escriben como capítulo:versículo o capítulo:*. Una regla extra acotada al contexto tiene prioridad sobre las reglas anteriores. Para ampliar futuras obras adaptar el corrector a sus respectivos libros y reglas; la norma editorial se aplica a todos los libros, no sólo estos cuatro.

Las fichas recuperadas de paquetes anteriores y las glosas nuevas son propuestas editoriales, sujetas a revisión de fuentes y contexto. La prueba automatizada se realizó con datos sintéticos, no con el proyecto local del usuario.
