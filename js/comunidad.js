// ==========================================
// BIBLIA ORIGEN
// FASE 4 - COMUNIDAD Y COLABORACIÓN
// ==========================================


// ==========================================
// CONFIGURACIÓN DEL SISTEMA DE APORTACIONES
// ==========================================

const COMMUNITY_CONFIG = {

  // Sistemas actualmente disponibles:
  // "github": preparar una incidencia en GitHub.
  // "manual": preparar y copiar la aportación.

  provider: "github",

  // Introducir propietario/repositorio.
  //
  // Ejemplo:
  // repository: "usuario/biblia-origen"
  //
  // Si se deja vacío, se intentará detectar
  // desde la dirección de GitHub Pages.

  repository: "https://github.com/JoseToral-murciaeduca/biblia-origen.git",

  schemaVersion: 1,

  // Límite conservador elegido para los
  // enlaces con texto prerrellenado.

  maxUrlLength: 1900

};


// ==========================================
// TIPOS DE APORTACIONES
// ==========================================

const COMMUNITY_TYPES = {

  suggestion: "Sugerencia",

  feature: "Nueva funcionalidad",

  text_error: "Error bíblico",

  linguistic: "Corrección lingüística",

  missing_tooltip: "Palabra sin explicación",

  study_error: "Error de estudio",

  technical: "Problema técnico",

  accessibility: "Accesibilidad",

  other: "Otros comentarios"

};


// ==========================================
// ESTADO
// ==========================================

let communityContext = null;

let communityPrepared = null;

let communityInitialized = false;


// ==========================================
// UTILIDADES
// ==========================================

function communitySetStatus(message) {

  const element = $("community-status");

  if (element) {
    element.textContent = message;
  }

}

function communityCleanText(value, maxLength) {

  return String(value ?? "")
    .trim()
    .slice(0, maxLength);

}

function communityPositiveInteger(value) {

  const number = Number(value);

  return Number.isInteger(number) && number > 0
    ? number
    : null;

}

function communityValidType(type) {

  return Object.prototype.hasOwnProperty.call(
    COMMUNITY_TYPES,
    type
  );

}


// ==========================================
// DETECTAR REPOSITORIO DE GITHUB
// ==========================================

function communityGetRepository() {

  const configured = String(
    COMMUNITY_CONFIG.repository || ""
  ).trim();

  const pattern =
    /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/;

  // Prioridad a la configuración manual.

  if (configured) {

    return pattern.test(configured)
      ? configured
      : null;

  }

  // Detección automática para:
  // https://usuario.github.io/biblia-origen/

  const hostname = window.location.hostname;

  const match = hostname.match(
    /^([a-z0-9-]+)\.github\.io$/i
  );

  if (!match) {
    return null;
  }

  const owner = match[1];

  const path = window.location.pathname
    .split("/")
    .filter(Boolean);

  const repository = path[0];

  // Solo detectar automáticamente el
  // repositorio conocido del proyecto.

  if (
    !repository ||
    repository.toLowerCase() !== "biblia-origen"
  ) {
    return null;
  }

  const result = `${owner}/${repository}`;

  return pattern.test(result)
    ? result
    : null;

}


// ==========================================
// CONTEXTO DE LA APORTACIÓN
// ==========================================

function communityNormalizeContext(context = {}) {

  const bookId = communityCleanText(
    context.bookId,
    100
  );

  const book = bookId
    ? resolveBookMeta(bookId)
    : null;

  return {

    origin: communityCleanText(
      context.origin || "general",
      50
    ),

    bookId,

    bookTitle: communityCleanText(
      book?.title || context.bookTitle,
      100
    ),

    chapter: communityPositiveInteger(
      context.chapter
    ),

    verse: communityPositiveInteger(
      context.verse
    ),

    entryId: communityCleanText(
      context.entryId,
      120
    ),

    term: communityCleanText(
      context.term,
      150
    ),

    reference: communityCleanText(
      context.reference,
      120
    )

  };

}

function communityGetReference(context) {

  if (!context) {
    return "";
  }

  if (context.bookTitle || context.bookId) {

    let reference =
      context.bookTitle || context.bookId;

    if (context.chapter) {
      reference += ` ${context.chapter}`;
    }

    if (context.verse && context.chapter) {
      reference += `:${context.verse}`;
    }

    return reference;

  }

  return context.reference || context.term || "";

}

function renderCommunityContext() {

  const container = $("community-context");

  container.replaceChildren();

  if (!communityContext) {

    container.hidden = true;

    return;
  }

  const reference = communityGetReference(
    communityContext
  );

  const hasContext = Boolean(
    reference ||
    communityContext.term ||
    communityContext.entryId
  );

  if (!hasContext) {

    container.hidden = true;

    return;
  }

  const title = document.createElement("strong");

  title.textContent = "Contexto de la aportación";

  container.appendChild(title);

  if (reference) {

    const paragraph = document.createElement("p");

    paragraph.textContent =
      `Referencia: ${reference}`;

    container.appendChild(paragraph);

  }

  if (communityContext.term) {

    const paragraph = document.createElement("p");

    paragraph.textContent =
      `Término: ${communityContext.term}`;

    container.appendChild(paragraph);

  }

  if (communityContext.entryId) {

    const paragraph = document.createElement("p");

    paragraph.textContent =
      `Identificador: ${communityContext.entryId}`;

    container.appendChild(paragraph);

  }

  container.hidden = false;

}


// ==========================================
// LIMPIAR VISTA PREVIA
// ==========================================

function invalidateCommunityPreview() {

  communityPrepared = null;

  $("community-preview").hidden = true;

  $("community-preview-title").value = "";

  $("community-preview-text").value = "";

  const link = $("community-publish-link");

  link.removeAttribute("href");

  link.hidden = true;

  communitySetStatus("");

}

function updateCommunityCharacterCount() {

  const length = $("community-description")
    .value.length;

  $("community-character-count").textContent =
    `${length} / 1500`;

}


// ==========================================
// CONFIGURAR EL FORMULARIO
// ==========================================

function resetCommunityForm() {

  $("community-form").reset();

  if (!communityContext) {

    communityContext = communityNormalizeContext();

  }

  let type = "suggestion";

  if (
    communityContext.origin === "verse"
  ) {

    type = "text_error";

  } else if (

    communityContext.entryId ||
    communityContext.term

  ) {

    type = "linguistic";

  }

  $("community-type").value = type;

  $("community-reference").value =
    communityGetReference(communityContext);

  invalidateCommunityPreview();

  updateCommunityCharacterCount();

  renderCommunityContext();

}


// ==========================================
// ABRIR FORMULARIO GENERAL
// ==========================================

function openCommunityForm(options = {}) {

  const dialog = $("community-dialog");

  if (dialog.open) {
    return;
  }

  closeTooltip();

  communityContext = communityNormalizeContext(
    options
  );

  resetCommunityForm();

  if (communityValidType(options.type)) {

    $("community-type").value =
      options.type;

  }

  if (options.subject) {

    $("community-subject").value =
      communityCleanText(
        options.subject,
        80
      );

  }

  dialog.showModal();

  $("community-subject").focus();

}


// ==========================================
// INFORMAR DESDE UN VERSÍCULO
// ==========================================

function openCommunityVerseReport() {

  if (!personalVerseTarget) {
    return;
  }

  const target = personalVerseTarget;

  const reference = getPersonalReference(
    target
  );

  openCommunityForm({

    origin: "verse",

    type: "text_error",

    bookId: target.bookId,

    chapter: target.chapter,

    verse: target.verse,

    reference,

    subject: `Revisión de ${reference}`

  });

  // No cerrar el diálogo personal.
  // De esta manera, una anotación que el
  // lector todavía no haya guardado se conserva.

}


// ==========================================
// INFORMAR DESDE EL DICCIONARIO
// ==========================================

function openCommunityTermReport(
  entryId,
  term,
  context = {}
) {

  openCommunityForm({

    ...context,

    origin: context.origin || "dictionary",

    type: "linguistic",

    entryId,

    term,

    subject: `Revisión del término ${term}`

  });

}

function createCommunityTermButton(
  entryId,
  term,
  context = {}
) {

  const button = document.createElement(
    "button"
  );

  button.type = "button";

  button.className =
    "secondary-btn community-term-btn";

  button.textContent =
    "Sugerir corrección";

  button.setAttribute(
    "aria-haspopup",
    "dialog"
  );

  button.addEventListener(
    "click",
    event => {

      event.stopPropagation();

      openCommunityTermReport(
        entryId,
        term,
        context
      );

    }
  );

  return button;

}


// ==========================================
// MODELO DE DATOS DE LA APORTACIÓN
// ==========================================

function buildCommunityPayload() {

  const type = $("community-type").value;

  const subject = communityCleanText(
    $("community-subject").value,
    80
  );

  const description = communityCleanText(
    $("community-description").value,
    1500
  );

  const reference = communityCleanText(
    $("community-reference").value,
    120
  );

  const source = communityCleanText(
    $("community-source").value,
    250
  );

  if (!communityValidType(type)) {

    throw new Error(
      "Selecciona un tipo de aportación válido."
    );

  }

  if (subject.length < 5) {

    throw new Error(
      "El título debe tener al menos 5 caracteres."
    );

  }

  if (description.length < 10) {

    throw new Error(
      "La descripción debe tener al menos 10 caracteres."
    );

  }

  if (!$("community-consent").checked) {

    throw new Error(
      "Debes aceptar el aviso de publicación pública."
    );

  }

  // Este objeto será reutilizable cuando
  // incorporemos una API y una base de datos.
  //
  // No contiene favoritos, notas personales,
  // correos electrónicos ni identificadores
  // privados del lector.

  return {

    schemaVersion: COMMUNITY_CONFIG.schemaVersion,

    application: "Biblia Origen",

    type,

    subject,

    description,

    reference,

    source,

    context: communityContext
      ? { ...communityContext }
      : communityNormalizeContext(),

    createdAt: new Date().toISOString()

  };

}


// ==========================================
// CONVERTIR A FORMATO GITHUB MARKDOWN
// ==========================================

// Encerrar los campos introducidos por
// el usuario en bloques de texto.
// Se evita que se interpreten como comandos
// o formato Markdown involuntario.

function communityMarkdownBlock(value) {

  const text = String(value || "No indicado");

  const runs = text.match(/~+/g) || [];

  const longest = runs.reduce(
    (max, run) => Math.max(max, run.length),
    0
  );

  const fence = "~".repeat(
    Math.max(3, longest + 1)
  );

  return `${fence}text\n${text}\n${fence}`;

}

function buildCommunityIssue(payload) {

  const typeLabel =
    COMMUNITY_TYPES[payload.type];

  const context = payload.context;

  const title =
    `[${typeLabel}] ${payload.subject}`;

  const contextText = [

    `Origen: ${context.origin || "general"}`,

    `Libro: ${context.bookTitle || "No indicado"}`,

    `ID del libro: ${context.bookId || "No indicado"}`,

    `Capítulo: ${context.chapter || "No indicado"}`,

    `Versículo: ${context.verse || "No indicado"}`,

    `Término: ${context.term || "No indicado"}`,

    `ID del diccionario: ${context.entryId || "No indicado"}`

  ].join("\n");

  const body = [

    "## Tipo de aportación",

    typeLabel,

    "",

    "## Descripción",

    communityMarkdownBlock(
      payload.description
    ),

    "",

    "## Referencia bíblica o término",

    communityMarkdownBlock(
      payload.reference
    ),

    "",

    "## Contexto",

    communityMarkdownBlock(
      contextText
    ),

    "",

    "## Fuente documental",

    communityMarkdownBlock(
      payload.source
    ),

    "",

    "---",

    `Aplicación: ${payload.application}`,

    "",

    `Tipo interno: ${payload.type}`,

    "",

    `Versión del esquema: ${payload.schemaVersion}`,

    "",

    `Preparado: ${payload.createdAt}`,

    "",

    "Aportación preparada desde Biblia Origen."

  ].join("\n");

  return {
    title,
    body
  };

}


// ==========================================
// SISTEMA DE ENTREGA
// ==========================================

function prepareCommunityDelivery(issue) {

  const provider = COMMUNITY_CONFIG.provider;

  // Modo manual, sin servicios externos.

  if (provider === "manual") {

    return {

      provider,

      url: null,

      message:
        "Modo manual activado. " +
        "Puedes copiar tu aportación."

    };

  }

  // En el futuro se podrá incorporar aquí
  // un proveedor API con envío HTTPS.
  //
  // Las credenciales y permisos privados
  // deberán gestionarse en un servidor.

  if (provider !== "github") {

    return {

      provider: "manual",

      url: null,

      message:
        "El proveedor seleccionado todavía " +
        "no está implementado."

    };

  }

  const repository = communityGetRepository();

  if (!repository) {

    return {

      provider: "manual",

      url: null,

      message:
        "Repositorio no configurado. " +
        "Puedes copiar la aportación manualmente."

    };

  }

  const url = new URL(
    `https://github.com/${repository}/issues/new`
  );

  url.searchParams.set(
    "title",
    issue.title
  );

  url.searchParams.set(
    "body",
    issue.body
  );

  // Evitar enlaces excesivamente largos.
  // Si el contenido supera el límite,
  // GitHub se abrirá solamente con el título.
  // El lector copiará el cuerpo manualmente.

  if (
    url.href.length >
    COMMUNITY_CONFIG.maxUrlLength
  ) {

    url.searchParams.delete("body");

    return {

      provider: "github",

      url: url.href,

      message:
        "La aportación es demasiado larga " +
        "para incluirla íntegramente en el enlace. " +
        "Copia el contenido de la vista previa, " +
        "abre GitHub y pégalo en la descripción."

    };

  }

  return {

    provider: "github",

    url: url.href,

    message:
      "Aportación preparada. " +
      "Abre GitHub, revisa el contenido " +
      "y confirma allí su publicación."

  };

}


// ==========================================
// PREPARAR Y MOSTRAR LA APORTACIÓN
// ==========================================

function prepareCommunitySubmission(event) {

  event.preventDefault();

  invalidateCommunityPreview();

  try {

    const payload = buildCommunityPayload();

    const issue = buildCommunityIssue(
      payload
    );

    const delivery = prepareCommunityDelivery(
      issue
    );

    communityPrepared = {

      payload,

      issue,

      delivery

    };

    $("community-preview-title").value =
      issue.title;

    $("community-preview-text").value =
      issue.body;

    const link = $("community-publish-link");

    if (delivery.url) {

      link.href = delivery.url;

      link.hidden = false;

    } else {

      link.removeAttribute("href");

      link.hidden = true;

    }

    $("community-preview").hidden = false;

    communitySetStatus(
      delivery.message
    );

    $("community-preview").scrollIntoView({

      behavior: "auto",

      block: "nearest"

    });

  } catch (error) {

    console.error(error);

    communitySetStatus(
      error.message ||
      "No se pudo preparar la aportación."
    );

  }

}


// ==========================================
// COPIAR LA APORTACIÓN
// ==========================================

async function copyCommunitySubmission() {

  if (!communityPrepared) {
    return;
  }

  const prepared = communityPrepared;

  const text = prepared.issue.body;

  try {

    if (!navigator.clipboard?.writeText) {

      throw new Error(
        "Portapapeles no disponible."
      );

    }

    await navigator.clipboard.writeText(text);

    if (communityPrepared !== prepared) {
      return;
    }

    communitySetStatus(

      "Contenido copiado. " +

      "Puedes pegarlo en la descripción " +

      "de GitHub Issues."

    );

  } catch {

    if (communityPrepared !== prepared) {
      return;
    }

    const textarea = $(
      "community-preview-text"
    );

    textarea.focus();

    textarea.select();

    communitySetStatus(

      "Copia manualmente el contenido " +

      "seleccionado. El título está disponible " +

      "en el campo superior."

    );

  }

}


// ==========================================
// EVENTOS
// ==========================================

function initCommunityFeatures() {

  if (communityInitialized) {
    return;
  }

  $("community-btn").addEventListener(

    "click",

    () => openCommunityForm()

  );

  $("community-close").addEventListener(

    "click",

    () => $("community-dialog").close()

  );

  $("verse-report-btn").addEventListener(

    "click",

    openCommunityVerseReport

  );

  $("community-form").addEventListener(

    "submit",

    prepareCommunitySubmission

  );

  $("community-form").addEventListener(

    "input",

    () => {

      updateCommunityCharacterCount();

      invalidateCommunityPreview();

    }

  );

  $("community-form").addEventListener(

    "change",

    invalidateCommunityPreview

  );

  $("community-reset").addEventListener(

    "click",

    () => {

      if (

        $("community-subject").value.trim() ||

        $("community-description").value.trim() ||

        $("community-source").value.trim()

      ) {

        if (!window.confirm(

          "¿Quieres limpiar el formulario?"

        )) {

          return;

        }

      }

      resetCommunityForm();

    }

  );

  $("community-copy-btn").addEventListener(

    "click",

    copyCommunitySubmission

  );

  $("community-publish-link").addEventListener(

    "click",

    event => {

      if (

        !communityPrepared ||

        !$("community-consent").checked

      ) {

        event.preventDefault();

        return;

      }

      communitySetStatus(

        "Continúa en GitHub para confirmar " +

        "la publicación. Biblia Origen no puede " +

        "comprobar si has creado la incidencia."

      );

    }

  );

  $("community-dialog").addEventListener(

    "close",

    () => {

      communityContext = null;

      invalidateCommunityPreview();

      $("community-form").reset();

      $("community-context").replaceChildren();

      $("community-context").hidden = true;

      updateCommunityCharacterCount();

    }

  );

  communityInitialized = true;

}