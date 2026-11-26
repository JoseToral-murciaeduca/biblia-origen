
const APP_NAME = "Biblia Origen";
const APP_TAGLINE = "Descubre la raíz de cada palabra.";
const PROGRESS_STORAGE_KEY = "escrituras_progress_v1";

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

    return raw ? JSON.parse(raw) : {};
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
      Number.isInteger(verse.verse) &&
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

    const valid = validateChapter(data, bookId, num);

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

  // Mostrar la biblioteca o el lector.
  $("library-view").hidden = !isLibrary;
  $("reader-view").hidden = isLibrary;

  // Mostrar u ocultar la barra secundaria.
  $("reader-toolbar").hidden = isLibrary;

  // Controles exclusivos del lector.
  $("reader-search-wrap").hidden = isLibrary;
  $("reader-controls-wrap").hidden = isLibrary;
  $("chapter-select").hidden = isLibrary;

  // Botón para regresar a la biblioteca.
  $("books-home-btn").hidden = isLibrary;

  // Restablecer la cabecera del libro.
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

  categories.forEach(category => {
    const categoryBooks = books.filter(
      book => book.category === category.key
    );

    if (categoryBooks.length === 0) return;

    const group = document.createElement("div");

    group.className = "category-group";

    const heading = document.createElement("h3");

    heading.className = "category-heading";
    heading.textContent = category.label;

    const grid = document.createElement("div");

    grid.className = "books-grid";

    categoryBooks.forEach(book => {
      grid.appendChild(createBookCard(book));
    });

    group.append(heading, grid);
    container.appendChild(group);
  });

  const uncategorized = books.filter(
    book => !categories.some(
      category => category.key === book.category
    )
  );

  if (uncategorized.length > 0) {
    const grid = document.createElement("div");

    grid.className = "books-grid";

    uncategorized.forEach(book => {
      grid.appendChild(createBookCard(book));
    });

    container.appendChild(grid);
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

  otGrid.closest(".testament-block").hidden =
    otBooks.length === 0;

  ntGrid.closest(".testament-block").hidden =
    ntBooks.length === 0;

  renderTestamentSection(otGrid, "ot", otBooks);
  renderTestamentSection(ntGrid, "nt", ntBooks);

  let emptyMessage = $("library-empty-message");

  if (!emptyMessage) {
    emptyMessage = document.createElement("p");

    emptyMessage.id = "library-empty-message";
    emptyMessage.className = "muted";
    emptyMessage.style.textAlign = "center";

    emptyMessage.textContent =
      "Todavía no hay libros disponibles.";

    $("library-view").appendChild(emptyMessage);
  }

  emptyMessage.hidden =
    state.availableBooks.length > 0;
}

async function openLibrary() {
  state.navigationId++;

  closeTooltip();

  state.view = "library";

  const url = new URL(window.location.href);

  url.searchParams.delete("libro");
  url.searchParams.delete("cap");

  window.history.replaceState({}, "", url);

  syncViewVisibility();
  renderLibraryView();

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

  const navigationId = ++state.navigationId;

  closeTooltip();
  clearSearch(false);

  state.bookId = bookId;
  state.currentBookMeta = book;
  state.chapter = null;
  state.view = "reader";

  syncViewVisibility();

  $("book-title-btn").textContent = book.title;
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
      showStatusMessage(`Cargando capítulo ${num}...`);

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

    window.history.replaceState({}, "", url);

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

  const titleEntry =
    state.dictionary[
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
    extra.textContent = `(${titleEntry.bridgeGloss})`;
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
    bannerImg.alt = `Banner de ${restoredTitle}`;

    bannerWrap.hidden = false;

  } else {
    bannerImg.removeAttribute("src");
    bannerImg.alt = "";

    bannerWrap.hidden = true;
  }
}

// ==========================================
// BUSCADOR
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
    ...Object.values(entry?.originalScript || {})
  ];

  return fields.some(
    value => normalizeText(value).includes(query)
  );
}

function verseMatchesQuery(verse, rawQuery) {
  const query = normalizeText(rawQuery);

  if (!query) return true;

  const targetVerse = parseVerseNumberQuery(rawQuery);

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

    next: index >= 0 &&
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

  const query = normalizeText(state.searchQuery);
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

    const number = document.createElement("span");

    number.className = "verse-num";
    number.textContent = verse.verse;

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

      if (
        state.mode === "bridge" &&
        entry.bridgeGloss
      ) {
        const gloss = document.createElement("span");

        gloss.className = "gloss";
        gloss.textContent = `(${entry.bridgeGloss})`;

        p.appendChild(gloss);
      }

      if (
        state.mode === "study" &&
        entry.otReference
      ) {
        const badge = document.createElement("span");

        badge.className = "study-badge";
        badge.textContent = `Cita: ${entry.otReference}`;

        p.appendChild(badge);
      }
    });

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

  const history = (entry.nameHistory || [])
    .map(item => `
      <li>
        <strong>${escapeHtml(item.form)}:</strong>
        ${escapeHtml(item.note)}
      </li>
    `).join("");

  return `
    <p class="muted">
      Equivalente habitual:
      ${escapeHtml(entry.traditional || "—")}
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
      ${escapeHtml(formUsed || entry.defaultForm || "Término")}
    </h2>

    ${getEntryDetailsHtml(entry)}
  `;
}

function getTooltipHtml(formUsed, entry) {
  return `
    <div class="tooltip-header">

      <h2 class="tooltip-title">
        ${escapeHtml(formUsed || entry.defaultForm || "Término")}
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

  inspector.setAttribute("tabindex", "-1");

  inspector.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });

  inspector.focus({
    preventScroll: true
  });

  inspector.classList.add("inspector--highlighted");

  clearTimeout(state.highlightTimer);

  state.highlightTimer = setTimeout(() => {
    inspector.classList.remove("inspector--highlighted");
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

  tooltip.innerHTML = getTooltipHtml(formUsed, entry);

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

    button.classList.toggle("active", active);

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

  // Regresar a la biblioteca mediante el logotipo.

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

  $("chapter-select").addEventListener(
    "change",
    event => {
      navigateToChapter(
        Number(event.target.value)
      );
    }
  );

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

  document.addEventListener(
    "keydown",
    async event => {
      if (event.key === "Escape") {
        closeTooltip();
        return;
      }

      if (state.view !== "reader") return;

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
  document.title = `${APP_NAME} | Lee, explora y comprende`;

  syncModeButtons();
  bindEvents();
  syncViewVisibility();

  const library = $("library-view");

  const loading = document.createElement("p");

  loading.className = "muted";
  loading.style.textAlign = "center";

  loading.textContent = "Cargando Biblia Origen...";

  library.appendChild(loading);

  $("ot-books-grid")
    .closest(".testament-block").hidden = true;

  $("nt-books-grid")
    .closest(".testament-block").hidden = true;

  try {
    state.dictionary = await fetchJson(
      "data/dictionary.json"
    );

    await loadBooksCatalog();

    await detectAvailableBooks();

  } catch (error) {
    console.error(error);

    loading.className = "error-msg";

    loading.textContent =
      "No se pudo cargar la biblioteca. Revisa los archivos JSON y el servidor.";

    return;
  }

  loading.remove();

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

  await openBook(
    bookParam,
    initialChapter
  );
}

init();