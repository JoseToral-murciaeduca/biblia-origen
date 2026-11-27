
"""Generador del texto base RV1909 para Biblia Origen."""

import argparse
import json
import re
from pathlib import Path

import generar_mateo as mateo
import generar_marcos as marcos
import generar_lucas_juan as lucas_juan


ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"


def read_json(path):
    return json.loads(
        path.read_text(encoding="utf-8-sig")
    )


def write_json(path, data):
    path.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    temporary = path.with_suffix(".tmp")

    temporary.write_text(
        json.dumps(
            data,
            ensure_ascii=False,
            indent=2
        ) + "\n",
        encoding="utf-8"
    )

    temporary.replace(path)


def find_book(books, chapter_count):

    matches = [
        book for book in books
        if book.get("testament") == "nt"
        and book.get("category") == "evangelios"
        and book.get("totalChapters") == chapter_count
    ]

    if len(matches) != 1:
        raise ValueError(
            f"No se identifica un único evangelio "
            f"de {chapter_count} capítulos."
        )

    book = matches[0]

    if not re.fullmatch(
        r"[A-Za-z0-9_-]+",
        book["id"]
    ):
        raise ValueError("ID de libro inválido.")

    return book


def main():

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--fuente",
        required=True,
        help="Ruta del XML local de RV1909"
    )

    parser.add_argument(
        "--simular",
        action="store_true"
    )

    args = parser.parse_args()

    source = Path(args.fuente)

    if not source.is_file():
        parser.error(
            f"No existe el archivo {source}"
        )

    books = read_json(DATA / "books.json")

    # Reutilizar los extractores anteriores.
    # No ejecutar la función normalize()
    # ni las sustituciones del diccionario.

    datasets = [
        (
            find_book(books, 28),
            mateo.extract(
                mateo.get_xml(source)
            )
        )
    ]

    for module, code in [
        (marcos, "MRK"),
        (lucas_juan, "LUK"),
        (lucas_juan, "JHN")
    ]:

        config = module.CONFIG[code]

        book = find_book(
            books,
            len(config["counts"])
        )

        root = module.get_root(
            source,
            code
        )

        chapters = module.extract(
            root,
            code,
            config["counts"]
        )

        datasets.append(
            (book, chapters)
        )

    pending = []

    for book, chapters in datasets:

        book_id = book["id"]

        for chapter, verses in sorted(
            chapters.items()
        ):

            filename = f"ch-{chapter:02d}.json"

            original_path = (
                DATA / "books" /
                book_id / filename
            )

            # Generar solamente los capítulos
            # publicados en Biblia Origen.

            if not original_path.is_file():
                continue

            original = read_json(original_path)

            original_numbers = [
                verse["verse"]
                for verse in original["verses"]
            ]

            if (
                original.get("bookId") != book_id
                or original.get("chapter") != chapter
                or original_numbers != sorted(verses)
            ):
                raise ValueError(
                    f"Numeración incompatible: "
                    f"{book_id} {chapter}"
                )

            output = {
                "edition": "rv1909",
                "bookId": book_id,
                "chapter": chapter,
                "verses": [
                    {
                        "verse": number,
                        "text": text
                    }
                    for number, text in sorted(
                        verses.items()
                    )
                ]
            }

            target = (
                DATA / "translations" /
                "rv1909" /
                book_id /
                filename
            )

            pending.append(
                (target, output)
            )

    if not pending:
        raise ValueError(
            "No se encontraron capítulos publicados."
        )

    total_verses = sum(
        len(data["verses"])
        for _, data in pending
    )

    print(
        f"Capítulos: {len(pending)}"
    )

    print(
        f"Versículos: {total_verses}"
    )

    if args.simular:
        print(
            "Simulación: no se modificaron archivos."
        )
        return

    for path, data in pending:
        write_json(path, data)

    print(
        "Comparador RV1909 generado correctamente."
    )


if __name__ == "__main__":
    main()
