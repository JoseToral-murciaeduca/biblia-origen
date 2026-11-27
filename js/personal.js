
// ==========================================
// BIBLIA ORIGEN
// BIBLIOTECA PERSONAL
// ==========================================

const PERSONAL_STORAGE_KEY =
  "biblia_origen_personal_v1";

const PERSONAL_HIGHLIGHTS = {
  yellow: "Amarillo",
  green: "Verde",
  blue: "Azul",
  pink: "Rosa",
  purple: "Violeta"
};

let personalData = Object.create(null);

let personalStorageBlocked = false;

let personalVerseTarget = null;


// ==========================================
// IDENTIFICACIÓN DE VERSÍCULOS
// ==========================================

function getPersonalVerseKey(
  bookId,
  chapter,
  verse
) {
  return `${bookId}:${chapter}:${verse}`;
}

function getPersonalReference(target) {

  const book = resolveBookMeta(
    target.bookId
  );

  const title =
    book?.title || target.bookId;

  return (
    `${title} ` +
    `${target.chapter}:${target.verse}`
  );

}

function getPersonalRecord(target) {

  const key = getPersonalVerseKey(
    target.bookId,
    target.chapter,
    target.verse
  );

  return personalData[key] || {
    bookId: target.bookId,
    chapter: target.chapter,
    verse: target.verse,
    favorite: false,
    bookmark: false,
    highlight: "",
    note: "",
    updatedAt: 0
  };

}

function hasPersonalContent(record) {

  return Boolean(
    record.favorite ||
    record.bookmark ||
    record.highlight ||
    record.note
  );

}

function isValidPersonalHighlight(color) {

  return Object.prototype.hasOwnProperty.call(
    PERSONAL_HIGHLIGHTS,
    color
  );

}


// ==========================================
// ALMACENAMIENTO LOCAL
// ==========================================

function loadPersonalData() {

  personalData = Object.create(null);

  try {

    const raw = localStorage.getItem(
      PERSONAL_STORAGE_KEY
    );

    if (!raw) return;

    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error(
        "Datos personales inválidos."
      );
    }

    Object.values(parsed).forEach(item => {

      if (
        !item ||
        typeof item.bookId !== "string" ||
        !Number.isInteger(item.chapter) ||
        !Number.isInteger(item.verse) ||
        item.chapter < 1 ||
        item.verse < 1
      ) {
        return;
      }

      const record = {
        bookId: item.bookId,
        chapter: item.chapter,
        verse: item.verse,

        favorite: item.favorite === true,

        bookmark: item.bookmark === true,

        highlight:
          isValidPersonalHighlight(
            item.highlight
          )
            ? item.highlight
            : "",

        note:
          typeof item.note === "string"
            ? item.note.slice(0, 2000)
            : "",

        updatedAt:
          Number.isFinite(item.updatedAt)
            ? item.updatedAt
            : 0
      };

      if (!hasPersonalContent(record)) {
        return;
      }

      const key = getPersonalVerseKey(
        record.bookId,
        record.chapter,
        record.verse
      );

      personalData[key] = record;

    });

  } catch (error) {

    console.error(
      "No se pudieron leer los datos personales.",
      error
    );

    // Evitar sobrescribir datos que no
    // se hayan podido recuperar correctamente.

    personalStorageBlocked = true;

  }

}

function savePersonalData() {

  if (personalStorageBlocked) {
    return false;
  }

  try {

    localStorage.setItem(
      PERSONAL_STORAGE_KEY,
      JSON.stringify(personalData)
    );

    return true;

  } catch (error) {

    console.error(
      "No se pudieron guardar los datos personales.",
      error
    );

    return false;

  }

}

function setPersonalStatus(message) {

  const status = $("verse-actions-status");

  if (status) {
    status.textContent = message;
  }

}

function removeEmptyPersonalRecords() {

  Object.keys(personalData).forEach(key => {

    if (!hasPersonalContent(personalData[key])) {
      delete personalData[key];
    }

  });

}

function updatePersonalRecord(
  changes,
  message = "Cambios guardados."
) {

  if (!personalVerseTarget) return;

  const target = personalVerseTarget;

  const key = getPersonalVerseKey(
    target.bookId,
    target.chapter,
    target.verse
  );

  const previous = getPersonalRecord(
    target
  );

  const record = {
    ...previous,
    ...changes,
    updatedAt: Date.now()
  };

  // Un único marcapáginas por libro.

  if (changes.bookmark === true) {

    Object.entries(personalData)
      .forEach(([otherKey, other]) => {

        if (
          otherKey !== key &&
          other.bookId === target.bookId &&
          other.bookmark
        ) {

          personalData[otherKey] = {
            ...other,
            bookmark: false,
            updatedAt: Date.now()
          };

        }

      });

  }

  personalData[key] = record;

  removeEmptyPersonalRecords();

  const saved = savePersonalData();

  syncPersonalVerseActions();

  refreshPersonalVerseDecorations();

  if ($("personal-library-dialog")?.open) {
    renderPersonalLibrary();
  }

  setPersonalStatus(
    saved
      ? message
      : "Cambios disponibles en esta sesión, " +
        "pero no se han podido guardar " +
        "en el navegador."
  );

}


// ==========================================
// MENÚ DE ACCIONES
// ==========================================

function syncPersonalVerseActions() {

  if (!personalVerseTarget) return;

  const record = getPersonalRecord(
    personalVerseTarget
  );

  const favoriteBtn = $("verse-favorite-btn");
  const bookmarkBtn = $("verse-bookmark-btn");

  favoriteBtn.textContent = record.favorite
    ? "Quitar favorito"
    : "Añadir favorito";

  favoriteBtn.setAttribute(
    "aria-pressed",
    String(record.favorite)
  );

  bookmarkBtn.textContent = record.bookmark
    ? "Quitar marcador"
    : "Marcar lectura";

  bookmarkBtn.setAttribute(
    "aria-pressed",
    String(record.bookmark)
  );

  document.querySelectorAll(
    "#verse-actions-dialog .highlight-swatch"
  ).forEach(button => {

    const active =
      record.highlight ===
      button.dataset.highlight;

    button.setAttribute(
      "aria-pressed",
      String(active)
    );

  });

}

function syncPersonalNoteCount() {

  const textarea = $("verse-note");

  $("verse-note-count").textContent =
    `${textarea.value.length} / 2000`;

}

function openPersonalVerseActions(
  target,
  text
) {

  closeTooltip();

  personalVerseTarget = {
    ...target,
    text
  };

  const record = getPersonalRecord(
    personalVerseTarget
  );

  $("verse-actions-title").textContent =
    getPersonalReference(target);

  $("verse-actions-preview").textContent =
    text;

  $("verse-note").value =
    record.note || "";

  $("verse-copy-fallback").hidden = true;
  $("verse-copy-fallback").value = "";

  setPersonalStatus("");

  syncPersonalNoteCount();
  syncPersonalVerseActions();

  const dialog = $("verse-actions-dialog");

  if (!dialog.open) {
    dialog.showModal();
  }

}

function togglePersonalFavorite() {

  if (!personalVerseTarget) return;

  const record = getPersonalRecord(
    personalVerseTarget
  );

  updatePersonalRecord(
    {
      favorite: !record.favorite
    },
    record.favorite
      ? "Versículo eliminado de favoritos."
      : "Versículo añadido a favoritos."
  );

}

function togglePersonalBookmark() {

  if (!personalVerseTarget) return;

  const record = getPersonalRecord(
    personalVerseTarget
  );

  updatePersonalRecord(
    {
      bookmark: !record.bookmark
    },
    record.bookmark
      ? "Marcador eliminado."
      : "Marcador de lectura actualizado."
  );

}

function setPersonalHighlight(color) {

  if (
    color !== "" &&
    !isValidPersonalHighlight(color)
  ) {
    return;
  }

  updatePersonalRecord(
    {
      highlight: color
    },
    color
      ? "Resaltado guardado."
      : "Resaltado eliminado."
  );

}

function savePersonalNote() {

  const text = $("verse-note")
    .value
    .trim()
    .slice(0, 2000);

  updatePersonalRecord(
    {
      note: text
    },
    text
      ? "Anotación guardada."
      : "Anotación eliminada."
  );

  $("verse-note").value = text;

  syncPersonalNoteCount();

}

function deletePersonalNote() {

  const record = getPersonalRecord(
    personalVerseTarget
  );

  if (
    record.note ||
    $("verse-note").value.trim()
  ) {

    if (!window.confirm(
      "¿Quieres eliminar esta anotación?"
    )) {
      return;
    }

  }

  $("verse-note").value = "";

  savePersonalNote();

}


// ==========================================
// NÚMEROS DE VERSÍCULOS INTERACTIVOS
// ==========================================

function createVerseNumberButton(verse) {

  const target = {
    bookId: state.bookId,
    chapter: Number(
      state.chapter.chapter
    ),
    verse: Number(verse.verse)
  };

  const button = document.createElement(
    "button"
  );

  button.type = "button";

  button.className =
    "verse-num verse-action-btn";

  button.textContent = verse.verse;

  button.title =
    "Acciones del versículo";

  button.setAttribute(
    "aria-label",
    `Acciones de ${getPersonalReference(target)}`
  );

  button.setAttribute(
    "aria-haspopup",
    "dialog"
  );

  button.addEventListener("click", event => {

    event.stopPropagation();

    openPersonalVerseActions(
      target,
      getGlobalVerseText(verse)
    );

  });

  return button;

}


// ==========================================
// DECORACIÓN PERSONAL DEL TEXTO
// ==========================================

function decoratePersonalVerse(
  element,
  verse
) {

  const target = {
    bookId: state.bookId,
    chapter: Number(
      state.chapter.chapter
    ),
    verse: Number(verse.verse)
  };

  const record = getPersonalRecord(
    target
  );

  // Aplicar o retirar el resaltado.

  if (record.highlight) {

    element.dataset.personalHighlight =
      record.highlight;

  } else {

    delete element.dataset.personalHighlight;

  }

  // Eliminar indicadores antiguos.

  element.querySelector(
    ".personal-verse-flags"
  )?.remove();

  const labels = [];

  if (record.favorite) {
    labels.push("Favorito");
  }

  if (record.bookmark) {
    labels.push("Marcador");
  }

  if (record.note) {
    labels.push("Nota");
  }

  if (labels.length === 0) return;

  const flags = document.createElement(
    "span"
  );

  flags.className =
    "personal-verse-flags";

  flags.textContent = labels.join(" · ");

  flags.title =
    "Pulsa el número del versículo " +
    "para gestionar tus datos personales.";

  element.appendChild(flags);

}

function refreshPersonalVerseDecorations() {

  if (
    state.view !== "reader" ||
    !state.chapter
  ) {
    return;
  }

  state.chapter.verses.forEach(verse => {

    const element = $(
      `verse-${verse.verse}`
    );

    if (element) {

      decoratePersonalVerse(
        element,
        verse
      );

    }

  });

}


// ==========================================
// COPIAR Y COMPARTIR
// ==========================================

function createPersonalVerseUrl(target) {

  const url = new URL(
    window.location.href
  );

  url.search = "";
  url.hash = "";

  url.searchParams.set(
    "libro",
    target.bookId
  );

  url.searchParams.set(
    "cap",
    String(target.chapter)
  );

  url.searchParams.set(
    "vers",
    String(target.verse)
  );

  return url.toString();

}

async function copyPersonalText(
  text,
  successMessage
) {

  const target = personalVerseTarget;

  try {

    if (!navigator.clipboard?.writeText) {

      throw new Error(
        "Portapapeles no disponible."
      );

    }

    await navigator.clipboard.writeText(text);

    if (personalVerseTarget !== target) {
      return;
    }

    $("verse-copy-fallback").hidden = true;

    setPersonalStatus(successMessage);

  } catch {

    if (personalVerseTarget !== target) {
      return;
    }

    // Alternativa para navegadores sin
    // acceso al portapapeles.

    const fallback = $(
      "verse-copy-fallback"
    );

    fallback.value = text;
    fallback.hidden = false;

    fallback.focus();
    fallback.select();

    setPersonalStatus(
      "Selecciona y copia manualmente el texto."
    );

  }

}

async function copyPersonalVerse() {

  if (!personalVerseTarget) return;

  const target = personalVerseTarget;

  const text =
    `«${target.text}»\n` +
    `${getPersonalReference(target)}\n` +
    "Biblia Origen";

  await copyPersonalText(
    text,
    "Versículo copiado."
  );

}

async function sharePersonalVerse() {

  if (!personalVerseTarget) return;

  const target = personalVerseTarget;

  const reference = getPersonalReference(
    target
  );

  const text =
    `«${target.text}»\n${reference}`;

  const url = createPersonalVerseUrl(
    target
  );

  if (typeof navigator.share === "function") {

    try {

      await navigator.share({
        title: `${reference} | Biblia Origen`,
        text,
        url
      });

      if (personalVerseTarget === target) {

        setPersonalStatus(
          "Acción de compartir completada."
        );

      }

      return;

    } catch (error) {

      // No copiar automáticamente si
      // el usuario cancela el envío.

      if (error.name === "AbortError") {
        return;
      }

    }

  }

  if (personalVerseTarget !== target) {
    return;
  }

  // Si el navegador no permite compartir,
  // copiamos el versículo y su enlace.

  await copyPersonalText(
    `${text}\n\n${url}`,
    "Versículo y enlace copiados."
  );

}


// ==========================================
// ABRIR UN VERSÍCULO CON ENLACE DIRECTO
// ==========================================

async function openPersonalVerseLink(
  bookId,
  chapter,
  verse
) {

  // Reutilizar la navegación de la fase 1.

  await openGlobalSearchResult(
    bookId,
    chapter,
    verse
  );

  if (
    state.view !== "reader" ||
    state.bookId !== bookId ||
    Number(state.chapter?.chapter) !==
      Number(chapter) ||
    !state.chapter.verses.some(
      item => Number(item.verse) ===
        Number(verse)
    )
  ) {
    return false;
  }

  // Mantener la referencia exacta en la URL.

  const url = new URL(
    window.location.href
  );

  url.searchParams.set(
    "vers",
    String(verse)
  );

  window.history.replaceState(
    {},
    "",
    url
  );

  return true;

}


// ==========================================
// MI BIBLIOTECA
// ==========================================

function getFilteredPersonalRecords() {

  const filter = $(
    "personal-library-filter"
  ).value;

  return Object.values(personalData)

    .filter(record => {

      if (!hasPersonalContent(record)) {
        return false;
      }

      switch (filter) {

        case "favorite":
          return record.favorite;

        case "bookmark":
          return record.bookmark;

        case "highlight":
          return Boolean(record.highlight);

        case "note":
          return Boolean(record.note);

        default:
          return true;

      }

    })

    .sort(
      (a, b) => b.updatedAt - a.updatedAt
    );

}

function createPersonalTag(text) {

  const tag = document.createElement(
    "span"
  );

  tag.className = "personal-tag";

  tag.textContent = text;

  return tag;

}

async function openSavedPersonalVerse(record) {

  const dialog = $("personal-library-dialog");

  const status = $("personal-library-status");

  status.textContent =
    "Comprobando versículo...";

  const exists = await checkChapterExists(
    record.bookId,
    record.chapter
  );

  if (!dialog.open) return;

  const chapter = state.chapterCache[
    `${record.bookId}:${record.chapter}`
  ];

  const verseExists =
    exists &&
    chapter?.verses.some(
      item =>
        Number(item.verse) === record.verse
    );

  if (!verseExists) {

    status.textContent =
      "Este versículo no está disponible " +
      "actualmente.";

    return;

  }

  dialog.close();

  await openPersonalVerseLink(
    record.bookId,
    record.chapter,
    record.verse
  );

}

function createPersonalLibraryItem(record) {

  const item = document.createElement(
    "article"
  );

  item.className =
    "personal-library-item";

  const title = document.createElement(
    "h3"
  );

  title.textContent =
    getPersonalReference(record);

  const tags = document.createElement(
    "div"
  );

  tags.className = "personal-tags";

  if (record.favorite) {
    tags.appendChild(
      createPersonalTag("Favorito")
    );
  }

  if (record.bookmark) {
    tags.appendChild(
      createPersonalTag("Marcador")
    );
  }

  if (record.highlight) {

    const tag = createPersonalTag(
      PERSONAL_HIGHLIGHTS[
        record.highlight
      ]
    );

    tag.dataset.personalHighlight =
      record.highlight;

    tags.appendChild(tag);

  }

  if (record.note) {

    tags.appendChild(
      createPersonalTag("Anotación")
    );

  }

  item.append(title, tags);

  if (record.note) {

    const note = document.createElement(
      "p"
    );

    note.className =
      "personal-note-preview";

    note.textContent = record.note;

    item.appendChild(note);

  }

  const openButton = document.createElement(
    "button"
  );

  openButton.type = "button";

  openButton.className = "secondary-btn";

  openButton.textContent =
    "Abrir versículo →";

  openButton.addEventListener(
    "click",
    async () => {

      openButton.disabled = true;

      try {

        await openSavedPersonalVerse(
          record
        );

      } catch (error) {

        console.error(error);

        $("personal-library-status")
          .textContent =
            "No se pudo abrir el versículo.";

      } finally {

        openButton.disabled = false;

      }

    }
  );

  item.appendChild(openButton);

  return item;

}

function renderPersonalLibrary() {

  const container = $(
    "personal-library-list"
  );

  const records = getFilteredPersonalRecords();

  container.replaceChildren();

  $("personal-library-status").textContent =
    `${records.length} ` +
    `versículo${records.length === 1 ? "" : "s"}`;

  if (records.length === 0) {

    const empty = document.createElement(
      "p"
    );

    empty.className =
      "muted personal-empty";

    empty.textContent =
      "Todavía no tienes versículos " +
      "guardados en esta sección.";

    container.appendChild(empty);

    return;

  }

  records.forEach(record => {

    container.appendChild(
      createPersonalLibraryItem(record)
    );

  });

}

function openPersonalLibrary() {

  closeTooltip();

  renderPersonalLibrary();

  const dialog = $(
    "personal-library-dialog"
  );

  if (!dialog.open) {
    dialog.showModal();
  }

}


// ==========================================
// EVENTOS
// ==========================================

function bindPersonalEvents() {

  $("personal-library-btn")
    .addEventListener(
      "click",
      openPersonalLibrary
    );

  $("personal-library-filter")
    .addEventListener(
      "change",
      renderPersonalLibrary
    );

  $("verse-favorite-btn")
    .addEventListener(
      "click",
      togglePersonalFavorite
    );

  $("verse-bookmark-btn")
    .addEventListener(
      "click",
      togglePersonalBookmark
    );

  $("verse-copy-btn")
    .addEventListener(
      "click",
      copyPersonalVerse
    );

  $("verse-share-btn")
    .addEventListener(
      "click",
      sharePersonalVerse
    );

  $("verse-note")
    .addEventListener(
      "input",
      syncPersonalNoteCount
    );

  $("verse-note-save")
    .addEventListener(
      "click",
      savePersonalNote
    );

  $("verse-note-delete")
    .addEventListener(
      "click",
      deletePersonalNote
    );

  document.querySelectorAll(
    "#verse-actions-dialog [data-highlight]"
  ).forEach(button => {

    button.addEventListener(
      "click",
      () => {

        setPersonalHighlight(
          button.dataset.highlight
        );

      }
    );

  });

  document.querySelectorAll(
    "[data-personal-close]"
  ).forEach(button => {

    button.addEventListener(
      "click",
      () => {

        button.closest("dialog")?.close();

      }
    );

  });

}


// ==========================================
// INICIALIZACIÓN
// ==========================================

function initPersonalFeatures() {

  loadPersonalData();

  bindPersonalEvents();

}
