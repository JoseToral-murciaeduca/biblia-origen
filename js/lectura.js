
// ==========================================
// BIBLIA ORIGEN
// HERRAMIENTAS DE LECTURA
// ==========================================

const READING_SETTINGS_KEY =
  "biblia_origen_reading_settings_v1";

const DEFAULT_READING_SETTINGS = {
  theme: "parchment",
  fontSize: 18,
  lineHeight: 1.7,
  font: "classic"
};

const READING_FONTS = {
  classic: 'Georgia, "Times New Roman", serif',
  modern: 'system-ui, sans-serif',
  literary: '"Palatino Linotype", Palatino, Georgia, serif'
};

const SEARCH_RESULT_LIMIT = 60;

let readingSettings = {
  ...DEFAULT_READING_SETTINGS
};

let globalSearchRequest = 0;

let continueReadingTarget = null;

// ==========================================
// PREFERENCIAS DE LECTURA
// ==========================================

function loadReadingSettings() {
  let saved = {};

  try {
    saved = JSON.parse(
      localStorage.getItem(READING_SETTINGS_KEY)
    ) || {};
  } catch {
    // Utilizar los valores predeterminados.
  }

  const fontSize = Number(saved.fontSize);
  const lineHeight = Number(saved.lineHeight);

  return {
    theme: [
      "light",
      "parchment",
      "dark",
      "system"
    ].includes(saved.theme)
      ? saved.theme
      : DEFAULT_READING_SETTINGS.theme,

    fontSize: Number.isFinite(fontSize)
      && fontSize >= 14
      && fontSize <= 30
      ? fontSize
      : DEFAULT_READING_SETTINGS.fontSize,

    lineHeight: Number.isFinite(lineHeight)
      && lineHeight >= 1.4
      && lineHeight <= 2.4
      ? lineHeight
      : DEFAULT_READING_SETTINGS.lineHeight,

    font: Object.prototype.hasOwnProperty.call(
      READING_FONTS,
      saved.font
    )
      ? saved.font
      : DEFAULT_READING_SETTINGS.font
  };
}

function saveReadingSettings() {
  try {
    localStorage.setItem(
      READING_SETTINGS_KEY,
      JSON.stringify(readingSettings)
    );
  } catch {
    // Continuar sin almacenamiento persistente.
  }
}

function applyReadingSettings() {

  const root = document.documentElement;

  let theme = readingSettings.theme;

  if (theme === "system") {

    theme = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches
      ? "dark"
      : "light";

  }

  root.dataset.readingTheme = theme;

  root.style.setProperty(
    "--reading-font-size",
    `${readingSettings.fontSize}px`
  );

  root.style.setProperty(
    "--reading-line-height",
    String(readingSettings.lineHeight)
  );

  root.style.setProperty(
    "--reading-font-family",
    READING_FONTS[readingSettings.font]
  );
}

function syncReadingSettingsControls() {

  $("reading-theme").value =
    readingSettings.theme;

  $("reading-font-size").value =
    String(readingSettings.fontSize);

  $("reading-line-height").value =
    String(readingSettings.lineHeight);

  $("reading-font").value =
    readingSettings.font;

  $("reading-font-size-value").textContent =
    `${readingSettings.fontSize} px`;

  $("reading-line-height-value").textContent =
    readingSettings.lineHeight.toFixed(1);
}

function updateReadingSettings() {

  readingSettings = {
    theme: $("reading-theme").value,

    fontSize: Number(
      $("reading-font-size").value
    ),

    lineHeight: Number(
      $("reading-line-height").value
    ),

    font: $("reading-font").value
  };

  applyReadingSettings();
  syncReadingSettingsControls();
  saveReadingSettings();
}

function resetReadingSettings() {

  readingSettings = {
    ...DEFAULT_READING_SETTINGS
  };

  applyReadingSettings();
  syncReadingSettingsControls();
  saveReadingSettings();
}

function bindReadingSettings() {

  readingSettings = loadReadingSettings();

  applyReadingSettings();
  syncReadingSettingsControls();

  const dialog = $("reading-settings");

  $("reading-settings-btn").addEventListener(
    "click",
    () => {
      closeTooltip();

      if (!dialog.open) {
        dialog.showModal();
      }
    }
  );

  [
    "reading-theme",
    "reading-font-size",
    "reading-line-height",
    "reading-font"
  ].forEach(id => {

    $(id).addEventListener(
      "input",
      updateReadingSettings
    );

  });

  $("reading-reset").addEventListener(
    "click",
    resetReadingSettings
  );

  // Cerrar al pulsar fuera de la ventana.

  dialog.addEventListener("click", event => {

    if (event.target !== dialog) return;

    const rect = dialog.getBoundingClientRect();

    const outside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;

    if (outside) {
      dialog.close();
    }

  });

  // Actualizar el tema automático cuando
  // cambien las preferencias del sistema.

  const systemTheme = window.matchMedia(
    "(prefers-color-scheme: dark)"
  );

  systemTheme.addEventListener("change", () => {

    if (readingSettings.theme === "system") {
      applyReadingSettings();
    }

  });
}

// ==========================================
// CONTINUAR LEYENDO
// ==========================================

function renderContinueReading() {

  const container = $("continue-reading");

  const progressMap = loadProgressMap();

  const candidates = state.availableBooks
    .map(book => ({
      book,
      progress: progressMap[book.id]
    }))
    .filter(item => {

      const chapter = Number(
        item.progress?.lastChapter
      );

      return (
        Number.isInteger(chapter) &&
        chapter >= 1 &&
        chapter <= item.book.totalChapters
      );

    })
    .sort((a, b) => {

      return (
        Number(b.progress.updatedAt || 0) -
        Number(a.progress.updatedAt || 0)
      );

    });

  if (candidates.length === 0) {

    container.hidden = true;

    continueReadingTarget = null;

    return;
  }

  const { book, progress } = candidates[0];

  const summary = getBookProgressSummary(book);

  continueReadingTarget = {
    bookId: book.id,
    chapter: Number(progress.lastChapter)
  };

  $("continue-book").textContent =
    book.title;

  $("continue-chapter").textContent =
    `Capítulo ${progress.lastChapter} de ` +
    `${book.totalChapters} · ${summary.percent}%`;

  $("continue-progress").value =
    summary.percent;

  container.hidden = false;
}

function bindContinueReading() {

  $("continue-reading-btn").addEventListener(
    "click",
    async () => {

      if (!continueReadingTarget) return;

      await openBook(
        continueReadingTarget.bookId,
        continueReadingTarget.chapter
      );

      window.scrollTo({
        top: 0,
        behavior: "auto"
      });

    }
  );
}

// ==========================================
// BUSCADOR BÍBLICO GLOBAL
// ==========================================

const SEARCH_BOOK_ALIASES = {
  mattai: ["Mateo"],
  mateo: ["Mattai"],

  marqos: ["Marcos"],
  marcos: ["Marqos"],

  loukas: ["Lucas"],
  lucas: ["Loukas"],

  yojanan: ["Juan"],
  juan: ["Yojanan"],

  tehillim: ["Salmos"],
  salmos: ["Tehillim"]
};

function getSearchBookNames(book) {

  const entry =
    state.dictionary[`book_${book.id}`] || {};

  return [
    book.id,
    book.title,
    entry.defaultForm,
    entry.traditional,
    entry.bridgeGloss,

    ...(SEARCH_BOOK_ALIASES[book.id] || [])
  ]
    .filter(Boolean)
    .map(value => normalizeText(value));
}

// Reconocer referencias:
// Juan 3:16, Marcos 9, Mattai 5:9, etc.

function parseGlobalReference(rawQuery) {

  const match = rawQuery.trim().match(
    /^(.+?)\s+(\d+)(?:\s*[:.,]\s*(\d+))?$/
  );

  if (!match) return null;

  const name = normalizeText(match[1]);

  const book = state.availableBooks.find(
    item => getSearchBookNames(item).includes(name)
  );

  if (!book) return null;

  return {
    book,
    chapter: Number(match[2]),
    verse: match[3] ? Number(match[3]) : null
  };
}

// Convertir los segmentos del JSON a texto.

function getGlobalVerseText(verse, traditional = false) {

  return verse.segments.map(segment => {

    if (typeof segment === "string") {
      return segment;
    }

    const entry =
      state.dictionary[segment.entryId] || {};

    if (traditional) {
      return (
        entry.traditional ||
        entry.bridgeGloss ||
        segment.form ||
        entry.defaultForm ||
        segment.entryId
      );
    }

    return (
      segment.form ||
      entry.defaultForm ||
      segment.entryId
    );

  }).join("");
}

// Buscar tanto en el texto visible como
// en los equivalentes del diccionario.

function globalVerseMatches(verse, query) {

  const original = normalizeText(
    getGlobalVerseText(verse)
  );

  const traditional = normalizeText(
    getGlobalVerseText(verse, true)
  );

  if (
    original.includes(query) ||
    traditional.includes(query)
  ) {
    return true;
  }

  return verse.segments.some(segment => {

    if (typeof segment === "string") {
      return false;
    }

    const entry =
      state.dictionary[segment.entryId] || {};

    const fields = [
      segment.form,
      entry.defaultForm,
      entry.traditional,
      entry.bridgeGloss,
      entry.transliteration,

      ...Object.values(
        entry.originalScript || {}
      )
    ];

    return fields.some(
      field =>
        normalizeText(field).includes(query)
    );

  });
}

// Abrir un capítulo y desplazarse
// hasta el versículo seleccionado.

async function openGlobalSearchResult(
  bookId,
  chapterNumber,
  verseNumber = null
) {

  clearGlobalSearch();

  await openBook(
    bookId,
    chapterNumber
  );

  // Comprobar que no hemos cambiado de libro
  // mientras se cargaba el capítulo.

  if (
    state.view !== "reader" ||
    state.bookId !== bookId ||
    Number(state.chapter?.chapter) !==
      Number(chapterNumber)
  ) {
    return;
  }

  if (verseNumber === null) {

    window.scrollTo({
      top: 0,
      behavior: "auto"
    });

    return;
  }

  const element = $(`verse-${verseNumber}`);

  if (!element) return;

  document.querySelectorAll(
    ".verse--target"
  ).forEach(item => {
    item.classList.remove("verse--target");
  });

  element.classList.add("verse--target");

  element.scrollIntoView({
    behavior: "auto",
    block: "center"
  });

  setTimeout(() => {

    element.classList.remove("verse--target");

  }, 3000);
}

// Crear una tarjeta de resultado.

function createGlobalSearchResult(
  book,
  chapter,
  verse = null
) {

  const button = document.createElement(
    "button"
  );

  button.type = "button";
  button.className = "global-result";

  const reference = document.createElement(
    "strong"
  );

  reference.className =
    "global-result__reference";

  reference.textContent = verse
    ? `${book.title} ${chapter}:${verse.verse}`
    : `${book.title} · Capítulo ${chapter}`;

  const text = document.createElement("span");

  text.className = "global-result__text";

  text.textContent = verse
    ? getGlobalVerseText(verse)
    : "Abrir capítulo completo →";

  button.append(reference, text);

  button.addEventListener("click", () => {

    openGlobalSearchResult(
      book.id,
      chapter,
      verse ? verse.verse : null
    );

  });

  return button;
}

// El contador cancela búsquedas anteriores.

function isGlobalSearchActive(request) {

  return (
    request === globalSearchRequest &&
    state.view === "library"
  );
}

function clearGlobalSearch() {

  globalSearchRequest++;

  $("global-search-panel").hidden = true;

  $("global-search-results").replaceChildren();

  $("global-search-status").textContent = "";
}

// ==========================================
// EJECUCIÓN DE LA BÚSQUEDA
// ==========================================

async function runGlobalSearch(rawQuery) {

  const query = normalizeText(rawQuery);

  if (!query) return;

  const request = ++globalSearchRequest;

  const panel = $("global-search-panel");
  const results = $("global-search-results");
  const status = $("global-search-status");

  panel.hidden = false;

  results.replaceChildren();

  status.textContent = "Buscando...";

  // Primero comprobar si el usuario ha
  // introducido una referencia bíblica.

  const reference = parseGlobalReference(
    rawQuery
  );

  try {

    if (reference) {

      const { book, chapter, verse } = reference;

      const exists = await checkChapterExists(
        book.id,
        chapter
      );

      if (!isGlobalSearchActive(request)) {
        return;
      }

      if (!exists) {

        status.textContent =
          "El capítulo solicitado todavía " +
          "no está disponible.";

        return;
      }

      const data = state.chapterCache[
        `${book.id}:${chapter}`
      ];

      if (verse === null) {

        results.appendChild(
          createGlobalSearchResult(
            book,
            chapter
          )
        );

        status.textContent =
          "Capítulo encontrado.";

        return;
      }

      const found = data.verses.find(
        item => Number(item.verse) === verse
      );

      if (!found) {

        status.textContent =
          "No existe ese número de versículo.";

        return;
      }

      results.appendChild(
        createGlobalSearchResult(
          book,
          chapter,
          found
        )
      );

      status.textContent =
        "Versículo encontrado.";

      return;
    }

    // Búsqueda en todos los libros publicados.

    let matches = 0;

    for (const book of state.availableBooks) {

      if (!isGlobalSearchActive(request)) {
        return;
      }

      status.textContent =
        `Buscando en ${book.title}...`;

      const chapters = await discoverChapters(
        book.id
      );

      if (!isGlobalSearchActive(request)) {
        return;
      }

      for (const chapter of chapters) {

        if (!isGlobalSearchActive(request)) {
          return;
        }

        const data = state.chapterCache[
          `${book.id}:${chapter}`
        ];

        if (!data) continue;

        for (const verse of data.verses) {

          if (!globalVerseMatches(verse, query)) {
            continue;
          }

          if (matches >= SEARCH_RESULT_LIMIT) {

            status.textContent =
              `Mostrando los primeros ` +
              `${SEARCH_RESULT_LIMIT} resultados. ` +
              `Prueba una búsqueda más concreta.`;

            return;
          }

          results.appendChild(
            createGlobalSearchResult(
              book,
              chapter,
              verse
            )
          );

          matches++;
        }
      }

      // Permitir que el navegador actualice
      // los resultados entre libros.

      await new Promise(
        resolve => setTimeout(resolve, 0)
      );
    }

    if (!isGlobalSearchActive(request)) {
      return;
    }

    status.textContent = matches === 0
      ? "No se encontraron resultados."
      : `${matches} resultado${matches === 1 ? "" : "s"}.`;

  } catch (error) {

    if (!isGlobalSearchActive(request)) {
      return;
    }

    console.error(error);

    status.textContent =
      "No se pudo completar la búsqueda.";

  }
}

function bindGlobalSearch() {

  $("global-search-form").addEventListener(
    "submit",
    event => {

      event.preventDefault();

      runGlobalSearch(
        $("global-search-input").value
      );

    }
  );

  $("global-search-close").addEventListener(
    "click",
    () => {

      clearGlobalSearch();

      $("global-search-input").value = "";

      $("global-search-input").focus();

    }
  );
}

// ==========================================
// INICIALIZACIÓN
// ==========================================

function initReadingFeatures() {

  bindReadingSettings();
  bindContinueReading();
  bindGlobalSearch();

}
