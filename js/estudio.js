
// ==========================================
// BIBLIA ORIGEN
// HERRAMIENTAS DE ESTUDIO
// ==========================================

let studyData = {
  aliases: {},
  introductions: {},
  crossReferences: []
};

let studyDataAvailable = false;
let studyRevision = 0;

const STUDY_TRANSLATION_CACHE = new Map();

const STUDY_LANGUAGES = {
  hebrew: "Hebreo",
  aramaic: "Arameo",
  greek: "Griego",
  syriac: "Siríaco",
  latin: "Latín"
};

const STUDY_CATEGORIES = {
  person: "Personas",
  place: "Lugares",
  term: "Términos",
  title: "Títulos",
  book: "Libros",
  group: "Grupos y pueblos",
  expression: "Expresiones"
};


// ==========================================
// UTILIDADES
// ==========================================

function studyElement(tag, className = "", text) {

  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

function studyButton(text, handler, className = "secondary-btn") {

  const button = studyElement(
    "button",
    className,
    text
  );

  button.type = "button";

  button.addEventListener(
    "click",
    handler
  );

  return button;
}

function studySection(parent, title) {

  const section = studyElement(
    "section",
    "study-section"
  );

  section.appendChild(
    studyElement("h3", "", title)
  );

  parent.appendChild(section);

  return section;
}

function studyAppendSource(parent, source) {

  if (!source) return;

  const paragraph = studyElement(
    "p",
    "study-source"
  );

  paragraph.append("Fuente: ");

  try {

    const url = new URL(source);

    if (url.protocol !== "https:") {
      throw new Error("Protocolo no permitido.");
    }

    const link = studyElement(
      "a",
      "",
      "Consultar referencia"
    );

    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    paragraph.appendChild(link);

  } catch {

    paragraph.append(String(source));

  }

  parent.appendChild(paragraph);
}

function showStudyDialog(title) {

  closeTooltip();

  studyRevision++;

  $("study-dialog-title").textContent = title;

  const body = $("study-dialog-body");

  body.replaceChildren();

  const dialog = $("study-dialog");

  if (!dialog.open) {
    dialog.showModal();
  }

  return body;
}

async function loadStudyData() {

  try {

    const data = await fetchJson(
      "data/study.json"
    );

    if (
      !data ||
      !data.aliases ||
      !data.introductions ||
      !Array.isArray(data.crossReferences)
    ) {
      throw new Error(
        "Datos de estudio inválidos."
      );
    }

    studyData = data;
    studyDataAvailable = true;

  } catch (error) {

    console.warn(
      "No se pudieron cargar los datos de estudio.",
      error
    );

    // El lector y el diccionario siguen
    // funcionando aunque falle este archivo.

    studyDataAvailable = false;

  }
}


// ==========================================
// IDENTIFICACIÓN DE LIBROS
// ==========================================

function studyCanonicalBookId(bookId) {

  const normalized = normalizeText(bookId);

  for (const [canonical, aliases] of
       Object.entries(studyData.aliases)) {

    if (
      [canonical, ...aliases].some(
        alias =>
          normalizeText(alias) === normalized
      )
    ) {
      return canonical;
    }

  }

  return normalized;
}

function studyFindBook(bookId) {

  const canonical = studyCanonicalBookId(
    bookId
  );

  return state.books.find(book =>

    studyCanonicalBookId(book.id) === canonical ||

    studyCanonicalBookId(book.title) === canonical

  ) || null;
}

function studyReferenceLabel(reference) {

  const [bookId, chapter, verse] = reference;

  const book = studyFindBook(bookId);

  const fallbackTitles = {
    mattai: "Mateo",
    marqos: "Marcos",
    loukas: "Lucas",
    yojanan: "Juan",
    genesis: "Génesis",
    isaias: "Isaías"
  };

  const title =
    book?.title ||
    fallbackTitles[bookId] ||
    bookId;

  return `${title} ${chapter}:${verse}`;
}


// ==========================================
// DICCIONARIO INDEPENDIENTE
// ==========================================

function studyDictionaryEntries() {

  return Object.entries(state.dictionary)

    .filter(([id, entry]) =>
      entry &&
      typeof entry === "object"
    )

    .map(([id, entry]) => ({
      id,
      entry
    }))

    .sort((a, b) =>

      String(
        a.entry.defaultForm || a.id
      ).localeCompare(
        String(
          b.entry.defaultForm || b.id
        ),
        "es"
      )

    );
}

function studyCreateSelect(label, options) {

  const select = studyElement(
    "select",
    "study-select"
  );

  select.setAttribute(
    "aria-label",
    label
  );

  options.forEach(([value, name]) => {

    const option = studyElement(
      "option",
      "",
      name
    );

    option.value = value;

    select.appendChild(option);

  });

  return select;
}

function openStudyDictionary() {

  const body = showStudyDialog(
    "Diccionario bíblico"
  );

  const entries = studyDictionaryEntries();

  body.appendChild(
    studyElement(
      "p",
      "muted",
      "Consulta los nombres, expresiones " +
      "y términos de Biblia Origen."
    )
  );

  const search = studyElement(
    "input",
    "study-search"
  );

  search.type = "search";

  search.placeholder =
    "Buscar Yeshua, Jesús, λόγος...";

  search.setAttribute(
    "aria-label",
    "Buscar en el diccionario"
  );

  body.appendChild(search);

  // Categorías detectadas automáticamente.

  const categories = [...new Set(
    entries
      .map(item => item.entry.category)
      .filter(Boolean)
  )].sort();

  const categorySelect = studyCreateSelect(
    "Categoría",
    [
      ["all", "Todas las categorías"],
      ...categories.map(category => [
        category,
        STUDY_CATEGORIES[category] || category
      ])
    ]
  );

  // Idiomas detectados en las grafías.

  const languages = [...new Set(

    entries.flatMap(item =>
      Object.keys(
        item.entry.originalScript || {}
      )
    )

  )].sort();

  const languageSelect = studyCreateSelect(
    "Idioma de la grafía",
    [
      ["all", "Todos los idiomas"],
      ...languages.map(language => [
        language,
        STUDY_LANGUAGES[language] || language
      ]),
      ["none", "Sin grafía extranjera"]
    ]
  );

  const filters = studyElement(
    "div",
    "study-filters"
  );

  filters.append(
    categorySelect,
    languageSelect
  );

  body.appendChild(filters);

  const count = studyElement(
    "p",
    "muted"
  );

  count.setAttribute(
    "aria-live",
    "polite"
  );

  const results = studyElement(
    "div",
    "study-dictionary-results"
  );

  const detail = studyElement(
    "section",
    "study-dictionary-detail"
  );

  detail.hidden = true;

  let limit = 100;

  function renderDetails(item) {

    detail.replaceChildren();

    detail.appendChild(
      studyElement(
        "h3",
        "",
        item.entry.defaultForm || item.id
      )
    );

    const content = studyElement("div");

    // Reutilizar el inspector original.
    // Esta función escapa los valores del JSON.

    content.innerHTML = getEntryDetailsHtml(
      item.entry
    );

    detail.appendChild(content);

    detail.hidden = false;
    detail.tabIndex = -1;
    detail.focus({
      preventScroll: true
    });

    detail.scrollIntoView({
      block: "nearest"
    });

  }

  function renderResults() {

    const query = normalizeText(
      search.value
    );

    const filtered = entries.filter(item => {

      const entry = item.entry;

      const scripts =
        entry.originalScript || {};

      if (
        categorySelect.value !== "all" &&
        entry.category !== categorySelect.value
      ) {
        return false;
      }

      if (
        languageSelect.value === "none" &&
        Object.keys(scripts).length > 0
      ) {
        return false;
      }

      if (
        !["all", "none"].includes(
          languageSelect.value
        ) &&
        !Object.prototype.hasOwnProperty.call(
          scripts,
          languageSelect.value
        )
      ) {
        return false;
      }

      const fields = [
        item.id,
        entry.defaultForm,
        entry.traditional,
        entry.bridgeGloss,
        entry.transliteration,
        entry.meaning,
        ...Object.values(scripts)
      ];

      return fields.some(field =>
        normalizeText(field).includes(query)
      );

    });

    count.textContent =
      `${filtered.length} fichas encontradas`;

    results.replaceChildren();

    detail.hidden = true;

    filtered.slice(0, limit).forEach(item => {

      const button = studyButton(
        "",
        () => renderDetails(item),
        "study-dictionary-item"
      );

      button.append(

        studyElement(
          "strong",
          "",
          item.entry.defaultForm || item.id
        ),

        studyElement(
          "span",
          "muted",
          item.entry.traditional ||
          item.entry.bridgeGloss ||
          ""
        )

      );

      results.appendChild(button);

    });

    if (filtered.length === 0) {

      results.appendChild(
        studyElement(
          "p",
          "muted",
          "No se encontraron términos."
        )
      );

    }

    if (filtered.length > limit) {

      results.appendChild(
        studyButton(
          "Mostrar más",
          () => {
            limit += 100;
            renderResults();
          }
        )
      );

    }

  }

  function resetResults() {
    limit = 100;
    renderResults();
  }

  search.addEventListener(
    "input",
    resetResults
  );

  categorySelect.addEventListener(
    "change",
    resetResults
  );

  languageSelect.addEventListener(
    "change",
    resetResults
  );

  body.append(
    count,
    results,
    detail
  );

  renderResults();

  search.focus();

}


// ==========================================
// INTRODUCCIONES DE LOS LIBROS
// ==========================================

function openStudyIntroduction() {

  if (
    state.view !== "reader" ||
    !state.currentBookMeta
  ) {
    return;
  }

  const book = state.currentBookMeta;

  const canonical = studyCanonicalBookId(
    book.id
  );

  const intro =
    studyData.introductions[canonical] ||
    studyData.introductions[
      studyCanonicalBookId(book.title)
    ];

  const body = showStudyDialog(
    `Introducción a ${book.title}`
  );

  if (!intro) {

    body.appendChild(
      studyElement(
        "p",
        "muted",
        studyDataAvailable
          ? "La introducción de este libro todavía no está disponible."
          : "No se pudieron cargar los datos de estudio."
      )
    );

    return;
  }

  body.appendChild(
    studyElement("h3", "", intro.title)
  );

  const fields = [
    ["Autoría", intro.author],
    ["Datación aproximada", intro.date],
    ["Lengua de composición", intro.language],
    ["Contexto", intro.context]
  ];

  fields.forEach(([label, value]) => {

    if (!value) return;

    const section = studySection(
      body,
      label
    );

    section.appendChild(
      studyElement("p", "", value)
    );

  });

  [
    ["Temas principales", intro.themes],
    ["Estructura general", intro.structure]
  ].forEach(([label, items]) => {

    if (!Array.isArray(items)) return;

    const section = studySection(
      body,
      label
    );

    const list = studyElement("ul");

    items.forEach(item => {

      list.appendChild(
        studyElement("li", "", item)
      );

    });

    section.appendChild(list);

  });

  studyAppendSource(body, intro.source);

}


// ==========================================
// NOTAS TEXTUALES
// ==========================================

function getStudyTextualNotes(verse) {

  const notes =
    state.chapter?.textualNotes;

  if (!Array.isArray(notes)) {
    return [];
  }

  return notes.filter(note =>

    note &&
    Number(note.verse) === Number(verse.verse)

  );

}


// ==========================================
// REFERENCIAS CRUZADAS
// ==========================================

function getStudyCrossReferences(
  bookId,
  chapter,
  verse
) {

  const canonical = studyCanonicalBookId(
    bookId
  );

  function isCurrent(reference) {

    return (
      studyCanonicalBookId(
        reference[0]
      ) === canonical &&

      Number(reference[1]) === Number(chapter) &&

      Number(reference[2]) === Number(verse)
    );

  }

  return studyData.crossReferences

    .filter(group =>
      Array.isArray(group.references) &&
      group.references.some(isCurrent)
    )

    .map(group => ({

      ...group,

      references: group.references.filter(
        reference => !isCurrent(reference)
      )

    }));

}

async function openStudyReference(
  reference,
  status,
  button
) {

  const revision = studyRevision;

  const [bookId, chapter, verse] =
    reference;

  const book = studyFindBook(bookId);

  if (!book) return;

  button.disabled = true;

  status.textContent =
    "Comprobando referencia...";

  try {

    const exists = await checkChapterExists(
      book.id,
      chapter
    );

    if (
      revision !== studyRevision ||
      !$("study-dialog").open
    ) {
      return;
    }

    const data = state.chapterCache[
      `${book.id}:${chapter}`
    ];

    if (
      !exists ||
      !data?.verses.some(
        item =>
          Number(item.verse) === Number(verse)
      )
    ) {

      status.textContent =
        "El pasaje todavía no está disponible.";

      return;
    }

    $("study-dialog").close();

    await openPersonalVerseLink(
      book.id,
      chapter,
      verse
    );

  } catch (error) {

    console.error(error);

    status.textContent =
      "No se pudo abrir la referencia.";

  } finally {

    button.disabled = false;

  }

}

function renderStudyCrossReferences(
  parent,
  groups
) {

  if (groups.length === 0) {

    parent.appendChild(
      studyElement(
        "p",
        "muted",
        studyDataAvailable
          ? "Sin referencias cruzadas añadidas todavía."
          : "Datos de referencias no disponibles."
      )
    );

    return;
  }

  groups.forEach(group => {

    const card = studyElement(
      "article",
      "study-note-card"
    );

    card.append(

      studyElement(
        "h4",
        "",
        group.label
      ),

      studyElement(
        "p",
        "muted",
        group.relation
      )

    );

    const links = studyElement(
      "div",
      "study-reference-links"
    );

    const status = studyElement(
      "p",
      "muted"
    );

    status.setAttribute(
      "role",
      "status"
    );

    group.references.forEach(reference => {

      const book = studyFindBook(
        reference[0]
      );

      const available =
        book &&
        state.availableBooks.some(
          item => item.id === book.id
        );

      const button = studyButton(

        studyReferenceLabel(reference),

        () => openStudyReference(
          reference,
          status,
          button
        )

      );

      if (!available) {

        button.disabled = true;

        button.textContent +=
          " · Pendiente";

      }

      links.appendChild(button);

    });

    card.append(links, status);

    studyAppendSource(
      card,
      group.source
    );

    parent.appendChild(card);

  });

}


// ==========================================
// COMPARADOR DE TRADUCCIONES
// ==========================================

async function loadStudyTranslation(
  bookId,
  chapter
) {

  const key = `${bookId}:${chapter}`;

  if (
    STUDY_TRANSLATION_CACHE.has(key)
  ) {
    return STUDY_TRANSLATION_CACHE.get(key);
  }

  const filename =
    `ch-${String(chapter).padStart(2, "0")}.json`;

  const path =
    `data/translations/rv1909/` +
    `${encodeURIComponent(bookId)}/${filename}`;

  const data = await fetchJson(path);

  if (
    data.edition !== "rv1909" ||
    data.bookId !== bookId ||
    Number(data.chapter) !== Number(chapter) ||
    !Array.isArray(data.verses) ||
    !data.verses.every(verse =>
      Number.isInteger(verse.verse) &&
      typeof verse.text === "string"
    )
  ) {

    throw new Error(
      "Texto comparativo inválido."
    );

  }

  STUDY_TRANSLATION_CACHE.set(
    key,
    data
  );

  return data;

}

// Mantener interactivas las palabras originales
// dentro de la ventana de estudio.

function renderStudyOriginalVerse(
  container,
  verse,
  termPanel
) {

  verse.segments.forEach(segment => {

    if (typeof segment === "string") {

      container.append(
        document.createTextNode(segment)
      );

      return;
    }

    const entry =
      state.dictionary[segment.entryId];

    const form =
      segment.form ||
      entry?.defaultForm ||
      segment.entryId;

    const button = studyButton(

      form,

      () => {

        const wasOpen =
          button.getAttribute("aria-expanded")
          === "true";

        container.querySelectorAll(
          ".term-btn"
        ).forEach(item => {

          item.setAttribute(
            "aria-expanded",
            "false"
          );

        });

        if (wasOpen) {

          termPanel.hidden = true;
          return;

        }

        button.setAttribute(
          "aria-expanded",
          "true"
        );

        termPanel.replaceChildren();

        termPanel.appendChild(
          studyElement("h4", "", form)
        );

        const details = studyElement("div");

        details.innerHTML =
          getEntryDetailsHtml(entry);

        termPanel.appendChild(details);

        termPanel.hidden = false;

      },

      "term-btn"

    );

    button.setAttribute(
      "aria-expanded",
      "false"
    );

    container.appendChild(button);

  });

}

async function renderStudyComparison(
  parent,
  verse,
  bookId,
  chapter
) {

  const comparison = studyElement(
    "div",
    "study-comparison"
  );

  const original = studyElement(
    "article",
    "study-comparison-card"
  );

  const translation = studyElement(
    "article",
    "study-comparison-card"
  );

  const originalText = studyElement(
    "p",
    "study-bible-text"
  );

  const translationText = studyElement(
    "p",
    "study-bible-text",
    "Cargando texto base..."
  );

  const termPanel = studyElement(
    "div",
    "study-dictionary-detail"
  );

  termPanel.hidden = true;

  renderStudyOriginalVerse(
    originalText,
    verse,
    termPanel
  );

  original.append(
    studyElement("h4", "", "Biblia Origen"),
    originalText
  );

  translation.append(
    studyElement(
      "h4",
      "",
      "Reina-Valera 1909"
    ),
    translationText
  );

  comparison.append(
    original,
    translation
  );

  parent.append(
    comparison,
    termPanel
  );

  parent.appendChild(
    studyElement(
      "p",
      "muted",
      "Biblia Origen es una adaptación " +
      "lingüística del texto base RV1909."
    )
  );

  try {

    const data = await loadStudyTranslation(
      bookId,
      chapter
    );

    const matchingVerse = data.verses.find(
      item => item.verse === verse.verse
    );

    translationText.textContent =
      matchingVerse?.text ||
      "No existe una correspondencia para este versículo.";

  } catch (error) {

    console.warn(error);

    translationText.textContent =
      "Texto comparativo todavía no disponible.";

  }

}


// ==========================================
// VENTANA DE ESTUDIO DEL VERSÍCULO
// ==========================================

function openStudyVerse(verse) {

  if (!state.chapter || !verse) {
    return;
  }

  const bookId = state.bookId;

  const chapter = state.chapter.chapter;

  const book = state.currentBookMeta;

  const body = showStudyDialog(
    `${book.title} ${chapter}:${verse.verse}`
  );

  // 1. Comparador.

  const comparison = studySection(
    body,
    "Comparar textos"
  );

  void renderStudyComparison(
    comparison,
    verse,
    bookId,
    chapter
  );

  // 2. Notas textuales.

  const notesSection = studySection(
    body,
    "Notas textuales"
  );

  const notes = getStudyTextualNotes(
    verse
  );

  if (notes.length === 0) {

    notesSection.appendChild(
      studyElement(
        "p",
        "muted",
        "No se han añadido notas textuales " +
        "a este versículo."
      )
    );

  }

  notes.forEach(note => {

    const card = studyElement(
      "article",
      "study-note-card"
    );

    card.appendChild(
      studyElement("p", "", note.note)
    );

    studyAppendSource(
      card,
      note.source
    );

    notesSection.appendChild(card);

  });

  // 3. Referencias cruzadas.

  const references = studySection(
    body,
    "Referencias cruzadas"
  );

  renderStudyCrossReferences(

    references,

    getStudyCrossReferences(
      bookId,
      chapter,
      verse.verse
    )

  );

}


// ==========================================
// INDICADORES EN EL LECTOR
// ==========================================

function decorateStudyVerse(element, verse) {

  element.querySelector(
    ".study-verse-btn"
  )?.remove();

  const notes = getStudyTextualNotes(
    verse
  );

  const references =
    getStudyCrossReferences(
      state.bookId,
      state.chapter.chapter,
      verse.verse
    );

  if (
    notes.length === 0 &&
    references.length === 0
  ) {
    return;
  }

  const labels = [];

  if (notes.length > 0) {
    labels.push("Nota textual");
  }

  if (references.length > 0) {
    labels.push("Referencias");
  }

  const button = studyButton(

    labels.join(" · "),

    event => {

      event.stopPropagation();

      openStudyVerse(verse);

    },

    "study-verse-btn"

  );

  button.setAttribute(
    "aria-haspopup",
    "dialog"
  );

  element.appendChild(button);

}


// ==========================================
// CONEXIÓN CON LA BIBLIOTECA PERSONAL
// ==========================================

function openStudyFromPersonalActions() {

  const target = personalVerseTarget;

  if (!target || !state.chapter) {
    return;
  }

  if (
    state.bookId !== target.bookId ||
    Number(state.chapter.chapter)
      !== Number(target.chapter)
  ) {
    return;
  }

  const verse = state.chapter.verses.find(
    item =>
      Number(item.verse) === Number(target.verse)
  );

  if (!verse) return;

  // Evitar perder anotaciones sin guardar.

  const savedNote =
    getPersonalRecord(target).note || "";

  const currentNote =
    $("verse-note").value.trim();

  if (
    currentNote !== savedNote &&
    !window.confirm(
      "Tienes una anotación sin guardar. " +
      "¿Quieres continuar sin guardarla?"
    )
  ) {
    return;
  }

  $("verse-actions-dialog").close();

  openStudyVerse(verse);

}


// ==========================================
// INICIALIZACIÓN
// ==========================================

function initStudyFeatures() {

  $("study-dictionary-btn")
    .addEventListener(
      "click",
      openStudyDictionary
    );

  $("study-introduction-btn")
    .addEventListener(
      "click",
      openStudyIntroduction
    );

  $("verse-study-btn")
    .addEventListener(
      "click",
      openStudyFromPersonalActions
    );

  $("study-dialog-close")
    .addEventListener(
      "click",
      () => $("study-dialog").close()
    );

  $("study-dialog")
    .addEventListener(
      "close",
      () => {
        studyRevision++;
      }
    );

}
