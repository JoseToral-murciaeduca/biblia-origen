
const APP_NAME = "Biblia Origen";
const APP_TAGLINE = "Descubre la raíz de cada palabra.";

const PROGRESS_STORAGE_KEY = "escrituras_progress_v1";
const LIBRARY_STORAGE_KEY = "biblia_origen_library_v1";
const EPIGRAPH_STORAGE_KEY = "biblia_origen_last_epigraph_v1";

let lastEpigraphKey = null;

const TESTAMENT_CATEGORIES = {
  ot: [
    { key: "pentateuco", label: "Pentateuco (Ley)" },
    { key: "historicos", label: "Libros Históricos" },
    { key: "poeticos", label: "Libros Poéticos y de Sabiduría" },
    { key: "profetas_mayores", label: "Profetas Mayores" },
    { key: "profetas_menores", label: "Profetas Menores" }
  ],
  nt: [
    { key: "evangelios", label: "Evangelios" },
    { key: "historia", label: "Historia" },
    { key: "paulinas", label: "Epístolas Paulinas" },
    { key: "generales", label: "Epístolas Generales" },
    { key: "profecia", label: "Profecía" }
  ]
};

const state = {
  view: "library",
  mode: "original",
  books: [],
  availableBooks: [],
  availableChapters: {},
  dictionary: {},
  chapterCache: {},
  chapterExistsCache: {},
  currentBookMeta: null,
  bookId: null,
  chapterNumber: 1,
  chapter: null,
  searchQuery: "",
  tooltipOpenedAt: 0,
  jumpTooltipTimer: null,
  highlightTimer: null,
  navigationId: 0
};


// ==========================================
// UTILIDADES
// ==========================================

function $(id) {
  return document.getElementById(id);
}

function formatChapterPath(bookId, chapterNum) {
  const padded = String(chapterNum).padStart(2, "0");

  return `data/books/${bookId}/ch-${padded}.json`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: "no-cache"
  });

  if (!response.ok) {
    throw new Error(
      `Error HTTP ${response.status}: ${url}`
    );
  }

  return response.json();
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeText(str) {
  return String(str ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function showStatusMessage(message, isError = false) {
  const reader = $("reader");

  reader.innerHTML = "";

  const p = document.createElement("p");

  p.className = isError ? "error-msg" : "muted";
  p.textContent = message;

  reader.appendChild(p);
}


// ==========================================
// PROGRESO DE LECTURA
// ==========================================

function loadProgressMap() {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    return parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function saveBookChapterProgress(
  bookId,
  chapterNum,
  totalChapters
) {
  const map = loadProgressMap();
  const previous = map[bookId] || {};

  map[bookId] = {
    lastChapter: Number(chapterNum),

    furthestChapter: Math.max(
      Number(previous.furthestChapter || previous.lastChapter || 0),
      Number(chapterNum)
    ),

    totalChapters,
    updatedAt: Date.now()
  };

  try {
    localStorage.setItem(
      PROGRESS_STORAGE_KEY,
      JSON.stringify(map)
    );
  } catch {
    // Ignorar errores de almacenamiento.
  }
}

function getBookProgressSummary(book) {
  const map = loadProgressMap();
  const saved = map[book.id] || {};

  const lastChapter = Number(saved.lastChapter || 0);
  const totalChapters = Number(book.totalChapters || 0);

  const furthestChapter = Math.min(
    Number(saved.furthestChapter || lastChapter),
    totalChapters
  );

  const percent = totalChapters
    ? Math.round(furthestChapter / totalChapters * 100)
    : 0;

  const remaining = Math.max(
    0,
    totalChapters - furthestChapter
  );

  let text = "Sin empezar";

  if (furthestChapter > 0) {
    text = remaining === 0
      ? `Completado (${totalChapters}/${totalChapters})`
      : `Cap. ${furthestChapter}/${totalChapters} · Faltan ${remaining}`;
  }

  return {
    lastChapter,
    totalChapters,
    percent,
    text
  };
}


// ==========================================
// CATÁLOGO Y DETECCIÓN DE ARCHIVOS
// ==========================================

async function loadBooksCatalog() {
  const books = await fetchJson("data/books.json");

  if (!Array.isArray(books)) {
    throw new Error("Catálogo de libros inválido.");
  }

  state.books = books;
}

function resolveBookMeta(bookId) {
  return state.books.find(
    book => book.id === bookId
  ) || null;
}

function validateChapter(data, bookId, chapterNum) {
  return (
    data !== null &&
    typeof data === "object" &&
    data.bookId === bookId &&
    Number(data.chapter) === Number(chapterNum) &&
    Array.isArray(data.verses) &&
    data.verses.length > 0 &&

    data.verses.every(verse =>
      verse !== null &&
      typeof verse === "object" &&
      Number.isInteger(verse.verse) &&
      verse.verse > 0 &&
      Array.isArray(verse.segments) &&

      verse.segments.every(segment =>
        typeof segment === "string" ||
        (
          segment !== null &&
          typeof segment === "object" &&
          typeof segment.entryId === "string"
        )
      )
    )
  );
}

async function checkChapterExists(bookId, chapterNum) {
  const num = Number(chapterNum);
  const book = resolveBookMeta(bookId);

  if (
    !book ||
    !Number.isInteger(num) ||
    num < 1 ||
    num > book.totalChapters
  ) {
    return false;
  }

  const key = `${bookId}:${num}`;

  if (state.chapterCache[key]) {
    return true;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      state.chapterExistsCache,
      key
    )
  ) {
    return state.chapterExistsCache[key];
  }

  try {
    const data = await fetchJson(
      formatChapterPath(bookId, num)
    );

    const valid = validateChapter(
      data,
      bookId,
      num
    );

    state.chapterExistsCache[key] = valid;

    if (valid) {
      state.chapterCache[key] = data;
    }

    return valid;

  } catch {
    state.chapterExistsCache[key] = false;

    return false;
  }
}

async function detectAvailableBooks() {
  const available = [];
  const batchSize = 8;

  for (
    let start = 0;
    start < state.books.length;
    start += batchSize
  ) {
    const batch = state.books.slice(
      start,
      start + batchSize
    );

    const results = await Promise.all(
      batch.map(async book => {
        const exists = await checkChapterExists(
          book.id,
          1
        );

        return exists ? book : null;
      })
    );

    available.push(...results.filter(Boolean));
  }

  state.availableBooks = available;

  return available;
}

async function discoverChapters(bookId) {
  const book = resolveBookMeta(bookId);

  if (!book) return [];

  if (state.availableChapters[bookId]) {
    return state.availableChapters[bookId];
  }

  const found = [];
  const batchSize = 10;

  for (
    let start = 1;
    start <= book.totalChapters;
    start += batchSize
  ) {
    const end = Math.min(
      start + batchSize - 1,
      book.totalChapters
    );

    const requests = [];

    for (let num = start; num <= end; num++) {
      requests.push(
        checkChapterExists(bookId, num)
          .then(exists => exists ? num : null)
      );
    }

    const results = await Promise.all(requests);

    found.push(
      ...results.filter(num => num !== null)
    );
  }

  state.availableChapters[bookId] = found;

  return found;
}


// ==========================================
// VISIBILIDAD DE LAS VISTAS
// ==========================================

function syncViewVisibility() {
  const isLibrary = state.view === "library";

  $("library-view").hidden = !isLibrary;
  $("reader-view").hidden = isLibrary;

  $("reader-toolbar").hidden = isLibrary;

  $("reader-search-wrap").hidden = isLibrary;
  $("reader-controls-wrap").hidden = isLibrary;
  $("chapter-select").hidden = isLibrary;

  $("books-home-btn").hidden = isLibrary;

  if (isLibrary) {
    $("book-title-btn").textContent = "";
    $("book-title-btn").onclick = null;

    $("book-title-extra").textContent = "";
    $("book-title-extra").className = "title-extra";
  }
}


// ==========================================
// TARJETAS DE LOS LIBROS
// ==========================================

function createBookCard(book) {
  const progress = getBookProgressSummary(book);

  const titleEntry =
    state.dictionary[`book_${book.id}`];

  const bannerSrc =
    book.banner ||
    titleEntry?.banner ||
    "";

  const card = document.createElement("button");

  card.type = "button";
  card.className = "book-card";

  const media = document.createElement("div");

  media.className = "book-card__media";

  if (bannerSrc) {
    const img = document.createElement("img");

    img.className = "book-card__banner";
    img.src = bannerSrc;
    img.alt = `Banner de ${book.title}`;
    img.loading = "lazy";

    media.appendChild(img);
  }

  const overlay = document.createElement("div");

  overlay.className = "book-card__progress-overlay";

  const label = document.createElement("div");

  label.className = "book-card__progress-label";

  const statusText = document.createElement("span");

  statusText.textContent = progress.text;

  const pctText = document.createElement("span");

  pctText.textContent = `${progress.percent}%`;

  label.append(statusText, pctText);

  const track = document.createElement("div");

  track.className = "book-card__progress-track";

  const fill = document.createElement("div");

  fill.className = "book-card__progress-fill";
  fill.style.width = `${progress.percent}%`;

  track.appendChild(fill);

  overlay.append(label, track);
  media.appendChild(overlay);

  const body = document.createElement("div");

  body.className = "book-card__body";

  const title = document.createElement("h3");

  title.className = "book-card__title";
  title.textContent = book.title;

  const meta = document.createElement("span");

  meta.className = "book-card__meta";

  meta.textContent = progress.lastChapter > 0
    ? `Último abierto: Capítulo ${progress.lastChapter} · ${book.totalChapters} capítulos`
    : `${book.totalChapters} capítulos`;

  body.append(title, meta);
  card.append(media, body);

  card.addEventListener("click", async () => {
    const saved = loadProgressMap();

    const chapter = Number(
      saved[book.id]?.lastChapter || 1
    );

    await openBook(book.id, chapter);
  });

  return card;
}


// ==========================================
// SECCIONES DESPLEGABLES DE LA BIBLIOTECA
// ==========================================

function loadLibraryPreferences() {
  try {
    const raw = localStorage.getItem(
      LIBRARY_STORAGE_KEY
    );

    const parsed = raw ? JSON.parse(raw) : {};

    return parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? parsed
      : {};

  } catch {
    return {};
  }
}

function saveLibraryPreference(key, expanded) {
  const preferences = loadLibraryPreferences();

  preferences[key] = expanded;

  try {
    localStorage.setItem(
      LIBRARY_STORAGE_KEY,
      JSON.stringify(preferences)
    );
  } catch {
    // Ignorar errores de almacenamiento.
  }
}

function isLibrarySectionExpanded(
  key,
  defaultValue = false
) {
  const preferences = loadLibraryPreferences();

  return typeof preferences[key] === "boolean"
    ? preferences[key]
    : defaultValue;
}

function createLibraryToggle(
  heading,
  panel,
  key,
  title,
  bookCount,
  defaultExpanded = false
) {
  let expanded = isLibrarySectionExpanded(
    key,
    defaultExpanded
  );

  const button = document.createElement("button");

  button.type = "button";
  button.className = "library-toggle";

  button.setAttribute(
    "aria-controls",
    panel.id
  );

  const arrow = document.createElement("span");

  arrow.className = "library-toggle__arrow";
  arrow.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");

  label.className = "library-toggle__label";
  label.textContent = title;

  const count = document.createElement("span");

  count.className = "library-toggle__count";

  count.textContent = bookCount === 1
    ? "1 libro"
    : `${bookCount} libros`;

  button.append(arrow, label, count);

  function syncExpanded() {
    panel.hidden = !expanded;

    button.setAttribute(
      "aria-expanded",
      String(expanded)
    );

    button.classList.toggle(
      "is-expanded",
      expanded
    );
  }

  button.addEventListener("click", () => {
    expanded = !expanded;

    syncExpanded();

    saveLibraryPreference(key, expanded);
  });

  heading.replaceChildren(button);

  syncExpanded();
}


// ==========================================
// VERSÍCULOS DESTACADOS DE LA BIBLIOTECA
// ==========================================

function getLastEpigraph() {
  try {
    return localStorage.getItem(
      EPIGRAPH_STORAGE_KEY
    ) || lastEpigraphKey;

  } catch {
    return lastEpigraphKey;
  }
}

function saveLastEpigraph(key) {
  lastEpigraphKey = key;

  try {
    localStorage.setItem(
      EPIGRAPH_STORAGE_KEY,
      key
    );
  } catch {
    // Continuar sin almacenamiento persistente.
  }
}

function shuffleEpigraphs(items) {
  const shuffled = [...items];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(
      Math.random() * (i + 1)
    );

    [shuffled[i], shuffled[j]] =
      [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function getEpigraphKey(reference) {
  return (
    `${reference.bookIds[0]}:` +
    `${reference.chapter}:` +
    `${reference.verse}`
  );
}

async function resolveEpigraph(reference) {
  const book = state.availableBooks.find(
    item => reference.bookIds.includes(item.id)
  );

  if (!book) return null;

  const exists = await checkChapterExists(
    book.id,
    reference.chapter
  );

  if (!exists) return null;

  const key = `${book.id}:${reference.chapter}`;

  const chapter = state.chapterCache[key];

  if (!chapter) return null;

  const verse = chapter.verses.find(
    item =>
      Number(item.verse) === Number(reference.verse)
  );

  if (!verse) return null;

  return {
    key: getEpigraphKey(reference),

    reference:
      `${reference.reference} ` +
      `${reference.chapter}:${reference.verse}`,

    segments: verse.segments
  };
}

function renderLibraryEpigraph(epigraph) {
  const quote = $("library-epigraph-quote");
  const reference = $("library-epigraph-ref");

  if (!quote || !reference) return;

  quote.replaceChildren();

  quote.appendChild(
    document.createTextNode("«")
  );

  epigraph.segments.forEach(segment => {

    if (typeof segment === "string") {
      quote.appendChild(
        document.createTextNode(segment)
      );

      return;
    }

    const entry =
      state.dictionary[segment.entryId] || {};

    const displayForm =
      segment.form ||
      entry.defaultForm ||
      segment.entryId;

    const button = document.createElement("button");

    button.type = "button";
    button.className = "term-btn";
    button.textContent = displayForm;

    button.addEventListener("click", event => {
      event.stopPropagation();

      openTermTooltip(
        displayForm,
        entry,
        button
      );

      // La biblioteca no tiene inspector visible.

      const actions = $("term-tooltip")
        .querySelector(".tooltip-actions");

      if (actions) {
        actions.hidden = true;
      }
    });

    quote.appendChild(button);
  });

  quote.appendChild(
    document.createTextNode("»")
  );

  reference.textContent = epigraph.reference;

  saveLastEpigraph(epigraph.key);
}

async function updateLibraryEpigraph() {
  const navigationId = state.navigationId;

  try {
    const references = await fetchJson(
      "data/featured-verses.json"
    );

    if (!Array.isArray(references)) {
      throw new Error(
        "Listado de versículos destacados inválido."
      );
    }

    const validReferences = references.filter(
      reference =>
        reference &&
        Array.isArray(reference.bookIds) &&
        reference.bookIds.length > 0 &&
        Number.isInteger(reference.chapter) &&
        Number.isInteger(reference.verse) &&
        typeof reference.reference === "string"
    );

    const lastKey = getLastEpigraph();

    const shuffled = shuffleEpigraphs(
      validReferences
    );

    const candidates = [
      ...shuffled.filter(
        reference =>
          getEpigraphKey(reference) !== lastKey
      ),

      ...shuffled.filter(
        reference =>
          getEpigraphKey(reference) === lastKey
      )
    ];

    for (const reference of candidates) {

      if (
        state.view !== "library" ||
        navigationId !== state.navigationId
      ) {
        return;
      }

      const epigraph = await resolveEpigraph(
        reference
      );

      if (
        state.view !== "library" ||
        navigationId !== state.navigationId
      ) {
        return;
      }

      if (epigraph) {
        renderLibraryEpigraph(epigraph);

        return;
      }
    }

  } catch (error) {
    console.warn(
      "No se pudo actualizar el versículo destacado.",
      error
    );
  }
}


// ==========================================
// BIBLIOTECA
// ==========================================

function renderTestamentSection(
  container,
  testamentKey,
  books
) {
  container.innerHTML = "";

  const categories =
    TESTAMENT_CATEGORIES[testamentKey] || [];

  const visibleCategories = categories.filter(
    category => books.some(
      book => book.category === category.key
    )
  );

  const uncategorized = books.filter(
    book => !categories.some(
      category => category.key === book.category
    )
  );

  const totalGroups =
    visibleCategories.length +
    (uncategorized.length > 0 ? 1 : 0);

  function renderCategory(category, categoryBooks) {
    const group = document.createElement("div");

    group.className = "category-group";

    const heading = document.createElement("h3");

    heading.className = "category-heading";

    const grid = document.createElement("div");

    grid.className = "books-grid";

    grid.id =
      `category-${testamentKey}-${category.key}`;

    categoryBooks.forEach(book => {
      grid.appendChild(
        createBookCard(book)
      );
    });

    group.append(heading, grid);

    container.appendChild(group);

    createLibraryToggle(
      heading,
      grid,
      `category:${testamentKey}:${category.key}`,
      category.label,
      categoryBooks.length,
      totalGroups === 1
    );
  }

  visibleCategories.forEach(category => {
    const categoryBooks = books.filter(
      book => book.category === category.key
    );

    renderCategory(
      category,
      categoryBooks
    );
  });

  if (uncategorized.length > 0) {
    renderCategory(
      {
        key: "otros",
        label: "Otros libros"
      },
      uncategorized
    );
  }
}

function renderLibraryView() {
  const otGrid = $("ot-books-grid");
  const ntGrid = $("nt-books-grid");

  const otBooks = state.availableBooks.filter(
    book => book.testament === "ot"
  );

  const ntBooks = state.availableBooks.filter(
    book => book.testament === "nt"
  );

  const otBlock = otGrid.closest(".testament-block");
  const ntBlock = ntGrid.closest(".testament-block");

  otBlock.hidden = otBooks.length === 0;
  ntBlock.hidden = ntBooks.length === 0;

  renderTestamentSection(
    otGrid,
    "ot",
    otBooks
  );

  renderTestamentSection(
    ntGrid,
    "nt",
    ntBooks
  );

  const otHeading = otBlock.querySelector(
    ".testament-heading"
  );

  const ntHeading = ntBlock.querySelector(
    ".testament-heading"
  );

  if (otHeading) {
    createLibraryToggle(
      otHeading,
      otGrid,
      "testament:ot",
      "Antiguo Testamento",
      otBooks.length,
      ntBooks.length === 0
    );
  }

  if (ntHeading) {
    createLibraryToggle(
      ntHeading,
      ntGrid,
      "testament:nt",
      "Nuevo Testamento",
      ntBooks.length,
      true
    );
  }

  let emptyMessage = $("library-empty-message");

  if (!emptyMessage) {
    emptyMessage = document.createElement("p");

    emptyMessage.id = "library-empty-message";
    emptyMessage.className = "muted";
    emptyMessage.style.textAlign = "center";

    emptyMessage.textContent =
      "Todavía no hay libros disponibles.";

    $("library-view").appendChild(
      emptyMessage
    );
  }

  emptyMessage.hidden =
    state.availableBooks.length > 0;

  // Fase 1: continuar leyendo.

  renderContinueReading();
}

async function openLibrary() {
  state.navigationId++;

  closeTooltip();

  state.view = "library";
  state.bookId = null;
  state.currentBookMeta = null;
  state.chapter = null;
  state.chapterNumber = 1;

  const url = new URL(window.location.href);

  url.searchParams.delete("libro");
  url.searchParams.delete("cap");
  url.searchParams.delete("vers");

  window.history.replaceState(
    {},
    "",
    url
  );

  syncViewVisibility();

  renderLibraryView();

  // Actualizar el versículo destacado.

  void updateLibraryEpigraph();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


// ==========================================
// APERTURA DE LIBROS
// ==========================================

async function openBook(bookId, chapterNum = 1) {
  const book = resolveBookMeta(bookId);

  if (!book) {
    await openLibrary();

    return;
  }

  clearGlobalSearch();

  const navigationId = ++state.navigationId;

  closeTooltip();
  clearSearch(false);

  state.bookId = bookId;
  state.currentBookMeta = book;
  state.chapter = null;
  state.view = "reader";

  syncViewVisibility();

  $("book-title-btn").textContent = book.title;
  $("book-title-btn").onclick = null;

  $("book-title-extra").textContent = "";

  $("chapter-nav").hidden = true;
  $("book-banner-wrap").hidden = true;

  $("chapter-select").innerHTML = "";
  $("chapter-select").disabled = true;

  $("inspector").innerHTML = `
    <h2>Inspector de término</h2>

    <p class="muted">
      Pulsa sobre una palabra resaltada para ver su ficha.
    </p>
  `;

  showStatusMessage(
    "Comprobando capítulos disponibles..."
  );

  const chapters = await discoverChapters(bookId);

  if (navigationId !== state.navigationId) {
    return;
  }

  if (chapters.length === 0) {
    showStatusMessage(
      "Este libro todavía no tiene capítulos publicados.",
      true
    );

    return;
  }

  let selected = Number(chapterNum);

  if (!chapters.includes(selected)) {
    selected = chapters[0];
  }

  state.chapterNumber = selected;

  syncChapterSelectOptions();

  await loadChapter(selected);
}


// ==========================================
// SELECTOR DE CAPÍTULOS
// ==========================================

function syncChapterSelectOptions() {
  const select = $("chapter-select");

  const chapters =
    state.availableChapters[state.bookId] || [];

  select.innerHTML = "";

  chapters.forEach(num => {
    const option = document.createElement("option");

    option.value = String(num);
    option.textContent = `Capítulo ${num}`;

    select.appendChild(option);
  });

  select.disabled = chapters.length === 0;

  select.value = String(
    state.chapter?.chapter ||
    state.chapterNumber
  );
}


// ==========================================
// CARGA DE CAPÍTULOS
// ==========================================

async function loadChapter(chapterNum) {
  const num = Number(chapterNum);

  const chapters =
    state.availableChapters[state.bookId] || [];

  if (!chapters.includes(num)) {
    return;
  }

  const navigationId = ++state.navigationId;
  const bookId = state.bookId;

  closeTooltip();

  if (
    state.searchQuery &&
    parseVerseNumberQuery(state.searchQuery) !== null
  ) {
    clearSearch(false);
  }

  const key = `${bookId}:${num}`;

  try {
    let data = state.chapterCache[key];

    if (!data) {
      showStatusMessage(
        `Cargando capítulo ${num}...`
      );

      data = await fetchJson(
        formatChapterPath(bookId, num)
      );
    }

    if (!validateChapter(data, bookId, num)) {
      throw new Error("Capítulo inválido.");
    }

    if (navigationId !== state.navigationId) {
      return;
    }

    state.chapterCache[key] = data;
    state.chapter = data;
    state.chapterNumber = num;

    saveBookChapterProgress(
      bookId,
      num,
      state.currentBookMeta.totalChapters
    );

    const url = new URL(window.location.href);

    url.searchParams.set("libro", bookId);
    url.searchParams.set("cap", String(num));

    // Limpiar el versículo del capítulo anterior.

    url.searchParams.delete("vers");

    window.history.replaceState(
      {},
      "",
      url
    );

    syncChapterSelectOptions();

    render();

  } catch (error) {

    if (navigationId !== state.navigationId) {
      return;
    }

    console.error(error);

    state.chapter = null;

    $("chapter-nav").hidden = true;

    showStatusMessage(
      `No se pudo cargar el capítulo ${num}.`,
      true
    );
  }
}

async function navigateToChapter(chapterNum) {
  await loadChapter(chapterNum);

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


// ==========================================
// CABECERA Y BANNER
// ==========================================

function renderHeader() {
  if (!state.chapter) return;

  const titleEntry = state.dictionary[
    state.chapter.titleEntryId ||
    `book_${state.bookId}`
  ];

  const restoredTitle =
    titleEntry?.defaultForm ||
    state.chapter.bookTitle ||
    state.currentBookMeta.title;

  const titleBtn = $("book-title-btn");

  titleBtn.textContent = restoredTitle;

  titleBtn.onclick = event => {
    event.stopPropagation();

    if (titleEntry) {
      openTermTooltip(
        restoredTitle,
        titleEntry,
        titleBtn
      );
    }
  };

  const extra = $("book-title-extra");

  extra.textContent = "";
  extra.className = "title-extra";

  if (
    state.mode === "bridge" &&
    titleEntry?.bridgeGloss
  ) {
    extra.textContent =
      `(${titleEntry.bridgeGloss})`;
  }

  if (
    state.mode === "study" &&
    titleEntry?.studyNote
  ) {
    extra.textContent = titleEntry.studyNote;
    extra.className = "study-badge";
  }

  const bannerSrc =
    titleEntry?.banner ||
    state.currentBookMeta.banner ||
    "";

  const bannerWrap = $("book-banner-wrap");
  const bannerImg = $("book-banner-img");

  if (bannerSrc) {
    bannerImg.src = bannerSrc;

    bannerImg.alt =
      `Banner de ${restoredTitle}`;

    bannerWrap.hidden = false;

  } else {
    bannerImg.removeAttribute("src");
    bannerImg.alt = "";

    bannerWrap.hidden = true;
  }
}


// ==========================================
// BUSCADOR DEL CAPÍTULO
// ==========================================

function parseVerseNumberQuery(rawQuery) {
  const cleaned = normalizeText(rawQuery);

  const match = cleaned.match(
    /^(?:v\.?|versiculo|cap\.?|capitulo)?\s*(\d+)$/
  );

  return match
    ? Number.parseInt(match[1], 10)
    : null;
}

function segmentMatchesQuery(segment, entry, query) {
  if (!query) return false;

  if (typeof segment === "string") {
    return normalizeText(segment).includes(query);
  }

  const fields = [
    segment.form,
    segment.entryId,
    entry?.defaultForm,
    entry?.traditional,
    entry?.bridgeGloss,
    entry?.transliteration,
    entry?.meaning,

    ...Object.values(
      entry?.originalScript || {}
    )
  ];

  return fields.some(
    value => normalizeText(value).includes(query)
  );
}

function verseMatchesQuery(verse, rawQuery) {
  const query = normalizeText(rawQuery);

  if (!query) return true;

  const targetVerse = parseVerseNumberQuery(
    rawQuery
  );

  if (targetVerse !== null) {
    return Number(verse.verse) === targetVerse;
  }

  const fullText = verse.segments.map(segment => {

    if (typeof segment === "string") {
      return segment;
    }

    const entry =
      state.dictionary[segment.entryId] || {};

    return (
      segment.form ||
      entry.defaultForm ||
      segment.entryId
    );

  }).join("");

  if (normalizeText(fullText).includes(query)) {
    return true;
  }

  return verse.segments.some(segment => {

    const entry = typeof segment === "object"
      ? state.dictionary[segment.entryId]
      : null;

    return segmentMatchesQuery(
      segment,
      entry,
      query
    );
  });
}

function clearSearch(shouldRender = true) {
  state.searchQuery = "";

  $("chapter-search").value = "";
  $("clear-search-btn").hidden = true;
  $("jump-match-btn").hidden = true;
  $("search-count").textContent = "";

  closeTooltip();

  if (shouldRender) render();
}

function clearJumpTooltipTimer() {
  if (state.jumpTooltipTimer) {
    clearTimeout(state.jumpTooltipTimer);

    state.jumpTooltipTimer = null;
  }
}

function jumpToFirstMatch() {
  const first = document.querySelector(
    "#reader .verse--match"
  );

  if (!first) return;

  closeTooltip();

  first.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  state.jumpTooltipTimer = setTimeout(() => {
    const button = first.querySelector(
      ".term-btn--match"
    );

    if (button && button.isConnected) {
      button.click();
    }

  }, 350);
}


// ==========================================
// NAVEGACIÓN ENTRE CAPÍTULOS
// ==========================================

function getAdjacentChapters() {
  const chapters =
    state.availableChapters[state.bookId] || [];

  const current = Number(
    state.chapter?.chapter ||
    state.chapterNumber
  );

  const index = chapters.indexOf(current);

  return {
    current,

    previous: index > 0
      ? chapters[index - 1]
      : null,

    next:
      index >= 0 &&
      index < chapters.length - 1
        ? chapters[index + 1]
        : null
  };
}

function renderChapterNav() {
  const nav = $("chapter-nav");

  if (!state.chapter) {
    nav.hidden = true;

    return;
  }

  const { current, previous, next } =
    getAdjacentChapters();

  nav.innerHTML = "";

  const prevBtn = document.createElement("button");

  prevBtn.type = "button";
  prevBtn.className = "chapter-nav-btn";
  prevBtn.textContent = "← Capítulo anterior";

  prevBtn.disabled = previous === null;

  prevBtn.addEventListener("click", () => {
    if (previous !== null) {
      navigateToChapter(previous);
    }
  });

  const info = document.createElement("span");

  info.className = "chapter-nav-info";
  info.textContent = `Capítulo ${current}`;

  const nextBtn = document.createElement("button");

  nextBtn.type = "button";
  nextBtn.className = "chapter-nav-btn";
  nextBtn.textContent = "Capítulo siguiente →";

  nextBtn.disabled = next === null;

  nextBtn.addEventListener("click", () => {
    if (next !== null) {
      navigateToChapter(next);
    }
  });

  nav.append(prevBtn, info, nextBtn);

  nav.hidden = false;
}


// ==========================================
// RENDERIZADO DEL TEXTO BÍBLICO
// ==========================================

function render() {
  if (state.view === "library") {
    syncViewVisibility();

    renderLibraryView();

    return;
  }

  if (!state.chapter) return;

  syncViewVisibility();
  renderHeader();

  const reader = $("reader");

  reader.innerHTML = "";

  const verses = state.chapter.verses;

  const query = normalizeText(
    state.searchQuery
  );

  const hasFilter = query.length > 0;

  const targetVerse = parseVerseNumberQuery(
    state.searchQuery
  );

  let matchCount = 0;

  verses.forEach(verse => {

    const isMatch =
      !hasFilter ||
      verseMatchesQuery(
        verse,
        state.searchQuery
      );

    if (hasFilter && isMatch) {
      matchCount++;
    }

    const p = document.createElement("p");

    p.className = "verse";
    p.id = `verse-${verse.verse}`;

    if (hasFilter) {
      p.classList.add(
        isMatch
          ? "verse--match"
          : "verse--dimmed"
      );
    }

    // Fase 2: número de versículo interactivo.

    const number = createVerseNumberButton(
      verse
    );

    p.appendChild(number);

    verse.segments.forEach(segment => {

      if (typeof segment === "string") {
        p.appendChild(
          document.createTextNode(segment)
        );

        return;
      }

      const entry =
        state.dictionary[segment.entryId] || {};

      const displayForm =
        segment.form ||
        entry.defaultForm ||
        segment.entryId;

      const button = document.createElement("button");

      button.type = "button";
      button.className = "term-btn";
      button.textContent = displayForm;

      if (
        hasFilter &&
        (
          targetVerse === Number(verse.verse) ||
          segmentMatchesQuery(
            segment,
            entry,
            query
          )
        )
      ) {
        button.classList.add("term-btn--match");
      }

      button.addEventListener("click", event => {
        event.stopPropagation();

        openTermTooltip(
          displayForm,
          entry,
          button
        );
      });

      p.appendChild(button);

      // Modo puente.

      if (
        state.mode === "bridge" &&
        entry.bridgeGloss
      ) {
        const gloss = document.createElement("span");

        gloss.className = "gloss";

        gloss.textContent =
          `(${entry.bridgeGloss})`;

        p.appendChild(gloss);
      }

      // Modo estudio.

      if (
        state.mode === "study" &&
        entry.otReference
      ) {
        const badge = document.createElement("span");

        badge.className = "study-badge";

        badge.textContent =
          `Cita: ${entry.otReference}`;

        p.appendChild(badge);
      }

    });

    // Fase 2: favoritos, marcadores,
    // resaltados y anotaciones.

    decoratePersonalVerse(p, verse);

    // Fase 3: notas textuales
    // y referencias cruzadas.

    decorateStudyVerse(p, verse);

    reader.appendChild(p);

  });

  $("search-count").textContent = hasFilter
    ? `${matchCount} vers.`
    : "";

  $("jump-match-btn").hidden =
    !(hasFilter && matchCount > 0);

  renderChapterNav();
}


// ==========================================
// INSPECTOR DE TÉRMINOS
// ==========================================

function getEntryDetailsHtml(entry) {
  if (!entry || !entry.meaning) {
    return `
      <p class="muted">
        Sin datos en dictionary.json.
      </p>
    `;
  }

  const languageNames = {
    hebrew: "Hebreo",
    syriac: "Siríaco",
    aramaic: "Arameo",
    greek: "Griego",
    latin: "Latín"
  };

  const scripts = Object.entries(
    entry.originalScript || {}
  ).map(([language, value]) => `
    <li>
      <strong>
        ${escapeHtml(languageNames[language] || language)}:
      </strong>

      <bdi>${escapeHtml(value)}</bdi>
    </li>
  `).join("");

  const history = (
    Array.isArray(entry.nameHistory)
      ? entry.nameHistory
      : []
  )
    .filter(
      item => item && typeof item === "object"
    )
    .map(item => `
      <li>
        <strong>${escapeHtml(item.form)}:</strong>

        ${escapeHtml(item.note)}
      </li>
    `).join("");

  return `
    <p class="muted">
      Equivalente habitual:

      ${escapeHtml(
        entry.traditional ||
        entry.bridgeGloss ||
        "—"
      )}
    </p>

    <p>${escapeHtml(entry.meaning)}</p>

    ${entry.transliteration ? `
      <p>
        <strong>Transliteración:</strong>

        ${escapeHtml(entry.transliteration)}
      </p>
    ` : ""}

    ${scripts ? `
      <h3>Grafías documentadas</h3>

      <ul>${scripts}</ul>
    ` : ""}

    ${history ? `
      <h3>Historial de nombres</h3>

      <ul>${history}</ul>
    ` : ""}

    ${entry.otReference ? `
      <p>
        <strong>Referencia AT:</strong>

        ${escapeHtml(entry.otReference)}
      </p>
    ` : ""}

    ${entry.studyNote ? `
      <p>
        <strong>Nota de estudio:</strong>

        ${escapeHtml(entry.studyNote)}
      </p>
    ` : ""}

    ${entry.sourceNote ? `
      <p>
        <strong>Nota lingüística:</strong>

        ${escapeHtml(entry.sourceNote)}
      </p>
    ` : ""}
  `;
}

function renderInspector(formUsed, entry) {
  const inspector = $("inspector");

  inspector.innerHTML = `
    <h2>
      ${escapeHtml(
        formUsed ||
        entry.defaultForm ||
        "Término"
      )}
    </h2>

    ${getEntryDetailsHtml(entry)}
  `;
}

function getTooltipHtml(formUsed, entry) {
  return `
    <div class="tooltip-header">

      <h2 class="tooltip-title">
        ${escapeHtml(
          formUsed ||
          entry.defaultForm ||
          "Término"
        )}
      </h2>

      <button
        type="button"
        class="tooltip-close"
        aria-label="Cerrar"
      >×</button>

    </div>

    ${getEntryDetailsHtml(entry)}

    <div class="tooltip-actions">

      <button
        type="button"
        class="tooltip-pin"
      >
        Ver en inspector
      </button>

    </div>
  `;
}

function focusInspectorInDesktop() {
  if (window.innerWidth <= 900) return;

  const inspector = $("inspector");

  closeTooltip();

  inspector.setAttribute(
    "tabindex",
    "-1"
  );

  inspector.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });

  inspector.focus({
    preventScroll: true
  });

  inspector.classList.add(
    "inspector--highlighted"
  );

  clearTimeout(state.highlightTimer);

  state.highlightTimer = setTimeout(() => {
    inspector.classList.remove(
      "inspector--highlighted"
    );

  }, 1600);
}


// ==========================================
// VENTANAS EMERGENTES
// ==========================================

function closeTooltip() {
  clearJumpTooltipTimer();

  const tooltip = $("term-tooltip");

  tooltip.hidden = true;
  tooltip.innerHTML = "";
}

function positionTooltip(tooltip, anchor) {
  const margin = 12;
  const gap = 8;

  const rect = anchor.getBoundingClientRect();
  const tip = tooltip.getBoundingClientRect();

  let left =
    rect.left + rect.width / 2 - tip.width / 2;

  left = Math.max(
    margin,
    Math.min(
      left,
      window.innerWidth - tip.width - margin
    )
  );

  let top = rect.bottom + gap;

  if (
    top + tip.height >
    window.innerHeight - margin
  ) {
    top = rect.top - tip.height - gap;
  }

  top = Math.max(
    margin,
    Math.min(
      top,
      window.innerHeight - tip.height - margin
    )
  );

  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function openTermTooltip(formUsed, entry, anchor) {
  clearJumpTooltipTimer();

  renderInspector(formUsed, entry);

  const tooltip = $("term-tooltip");

  state.tooltipOpenedAt = Date.now();

  tooltip.innerHTML = getTooltipHtml(
    formUsed,
    entry
  );

  tooltip.hidden = false;

  positionTooltip(tooltip, anchor);

  tooltip.querySelector(".tooltip-close")
    ?.addEventListener("click", event => {
      event.stopPropagation();

      closeTooltip();
    });

  tooltip.querySelector(".tooltip-pin")
    ?.addEventListener("click", event => {
      event.stopPropagation();

      focusInspectorInDesktop();
    });
}


// ==========================================
// MODOS DE LECTURA
// ==========================================

function syncModeButtons() {
  document.querySelectorAll(
    ".controls button"
  ).forEach(button => {

    const active =
      button.dataset.mode === state.mode;

    button.classList.toggle(
      "active",
      active
    );

    button.setAttribute(
      "aria-pressed",
      String(active)
    );
  });
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return (
    target.isContentEditable ||

    Boolean(
      target.closest(
        "input, textarea, select, [contenteditable='true']"
      )
    )
  );
}


// ==========================================
// EVENTOS
// ==========================================

function bindEvents() {

  // Regresar mediante el logotipo.

  $("brand-home-btn").addEventListener(
    "click",
    () => {
      if (state.view !== "library") {
        openLibrary();
      }
    }
  );

  // Regresar mediante el botón Biblioteca.

  $("books-home-btn").addEventListener(
    "click",
    openLibrary
  );

  // Cambiar el modo de lectura.

  document.querySelectorAll(
    ".controls button"
  ).forEach(button => {

    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;

      syncModeButtons();
      closeTooltip();
      render();
    });
  });

  // Cambiar de capítulo.

  $("chapter-select").addEventListener(
    "change",
    event => {
      navigateToChapter(
        Number(event.target.value)
      );
    }
  );

  // Buscar dentro del capítulo.

  $("chapter-search").addEventListener(
    "input",
    event => {
      state.searchQuery = event.target.value;

      $("clear-search-btn").hidden =
        state.searchQuery.length === 0;

      closeTooltip();

      render();
    }
  );

  $("chapter-search").addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter") {
        event.preventDefault();

        jumpToFirstMatch();
      }
    }
  );

  $("clear-search-btn").addEventListener(
    "click",
    () => {
      clearSearch();

      $("chapter-search").focus();
    }
  );

  $("jump-match-btn").addEventListener(
    "click",
    jumpToFirstMatch
  );

  // Cerrar tooltip al pulsar fuera.

  document.addEventListener(
    "click",
    event => {
      const tooltip = $("term-tooltip");

      if (tooltip.hidden) return;

      if (
        !tooltip.contains(event.target) &&
        !event.target.closest(".term-btn, .title-btn")
      ) {
        closeTooltip();
      }
    }
  );

  // Atajos de teclado del lector.

  document.addEventListener(
    "keydown",
    async event => {

      // No navegar mientras haya
      // un diálogo abierto.

      if (document.querySelector("dialog[open]")) {
        return;
      }

      if (event.key === "Escape") {
        closeTooltip();

        return;
      }

      if (
        state.view !== "reader" ||
        !state.chapter
      ) {
        return;
      }

      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      const allowInSearch =
        event.shiftKey &&
        event.target.id === "chapter-search";

      if (
        !allowInSearch &&
        isEditableTarget(event.target)
      ) {
        return;
      }

      const { previous, next } =
        getAdjacentChapters();

      if (
        event.key === "ArrowLeft" &&
        previous !== null
      ) {
        event.preventDefault();

        await navigateToChapter(previous);
      }

      if (
        event.key === "ArrowRight" &&
        next !== null
      ) {
        event.preventDefault();

        await navigateToChapter(next);
      }
    }
  );

  // Cerrar tooltip al desplazar la página.

  window.addEventListener(
    "scroll",
    () => {
      const tooltip = $("term-tooltip");

      if (
        !tooltip.hidden &&
        Date.now() - state.tooltipOpenedAt > 180
      ) {
        closeTooltip();
      }
    },
    { passive: true }
  );

  window.addEventListener(
    "resize",
    closeTooltip,
    { passive: true }
  );
}


// ==========================================
// INICIALIZACIÓN
// ==========================================

async function init() {
  document.title =
    `${APP_NAME} | Lee, explora y comprende`;

  const library = $("library-view");

  const loading = document.createElement("p");

  loading.className = "muted";
  loading.style.textAlign = "center";

  loading.textContent =
    "Cargando Biblia Origen...";

  library.appendChild(loading);

  $("ot-books-grid")
    .closest(".testament-block").hidden = true;

  $("nt-books-grid")
    .closest(".testament-block").hidden = true;

  try {

    // Fase 1: herramientas de lectura.

    initReadingFeatures();

    // Fase 2: biblioteca personal.

    initPersonalFeatures();

    // Fase 3: estudio bíblico.

    initStudyFeatures();

    syncModeButtons();
    bindEvents();
    syncViewVisibility();

    // Cargar el diccionario.

    state.dictionary = await fetchJson(
      "data/dictionary.json"
    );

    // Cargar el catálogo.

    await loadBooksCatalog();

    // Detectar los libros publicados.

    await detectAvailableBooks();

    // Cargar introducciones y referencias.

    await loadStudyData();

  } catch (error) {
    console.error(error);

    loading.className = "error-msg";

    loading.textContent =
      "No se pudo iniciar Biblia Origen. " +
      "Revisa los archivos, el servidor " +
      "y la consola (F12).";

    return;
  }

  loading.remove();

  // Habilitar las herramientas después
  // de cargar los datos de la biblioteca.

  $("study-dictionary-btn").disabled = false;

  $("personal-library-btn").disabled = false;

  $("global-search-input").disabled = false;

  $("global-search-form")
    .querySelector('button[type="submit"]')
    .disabled = false;

  // Leer los parámetros de navegación.

  const params = new URLSearchParams(
    window.location.search
  );

  const bookParam = params.get("libro");
  const capParam = params.get("cap");

  const available = state.availableBooks.some(
    book => book.id === bookParam
  );

  if (!bookParam || !available) {
    await openLibrary();

    return;
  }

  const saved = loadProgressMap();

  const fallback = Number(
    saved[bookParam]?.lastChapter || 1
  );

  const initialChapter =
    Number.parseInt(
      capParam || String(fallback),
      10
    ) || 1;

  // Fase 2: enlaces directos a versículos.

  const verseParam = Number(
    params.get("vers")
  );

  if (
    Number.isInteger(verseParam) &&
    verseParam > 0
  ) {
    await openPersonalVerseLink(
      bookParam,
      initialChapter,
      verseParam
    );

  } else {
    await openBook(
      bookParam,
      initialChapter
    );
  }
}


// ==========================================
// ARRANQUE DE BIBLIA ORIGEN
// ==========================================

init().catch(error => {
  console.error(
    "Error al iniciar Biblia Origen:",
    error
  );

  const container = $("library-view");

  if (!container) return;

  const message = document.createElement("p");

  message.className = "error-msg";

  message.textContent =
    "No se pudo iniciar Biblia Origen. " +
    "Consulta la consola (F12).";

  container.appendChild(message);
});
