/**
 * Handout Ping Viewer
 * Ajoute des contrôles de zoom/déplacement sur les fenêtres ImagePopout de Foundry VTT,
 * avec vue forcée par le MJ et un ping collaboratif partagé (MJ + joueurs).
 */

const MODULE_ID = "handout-ping-viewer";
const SOCKET_EVENT = `module.${MODULE_ID}`;

const MIN_SCALE = 0.2;
const MAX_SCALE = 8;
const WHEEL_SENSITIVITY = 0.0015;
const ZOOM_STEP = 1.25;

const PING_LIFETIME_MS = 2500;
const PING_CLICK_MOVE_THRESHOLD = 6; // px, au-delà duquel un clic devient un pan
const PING_DBLCLICK_DELAY_MS = 250; // laisse le temps à un double-clic d'annuler le ping

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initialisation`);
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET_EVENT, onSocketMessage);
});

Hooks.on("renderImagePopout", (app, html) => {
  attachZoomPan(app, html);
});

/* -------------------------------------------- */
/*  Mise en place du zoom / pan sur une fenêtre  */
/* -------------------------------------------- */

function attachZoomPan(app, html) {
  const root = toElement(html);
  const img = root.querySelector("img");
  if (!img) return;

  // Évite de rebrancher les écouteurs si la fenêtre se redessine
  if (img.dataset.izpBound === "true") {
    app._izpState = app._izpState ?? { scale: 1, x: 0, y: 0 };
    return;
  }
  img.dataset.izpBound = "true";

  const state = { scale: 1, x: 0, y: 0 };
  app._izpState = state;
  app._izpSrc = img.getAttribute("src");
  console.log(`${MODULE_ID} | Image détectée pour ${app.id ?? "app"} :`, app._izpSrc);

  const wrapper = img.parentElement;
  wrapper.classList.add("izp-wrapper");
  img.classList.add("izp-image");

  // Références réutilisées pour placer les pings entrants (voir onSocketMessage)
  app._izpWrapper = wrapper;
  app._izpImg = img;

  const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const applyTransform = () => {
    img.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
  };

  // Zoom à la molette, centré sur le curseur
  wrapper.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      const rect = wrapper.getBoundingClientRect();
      const offsetX = ev.clientX - rect.left;
      const offsetY = ev.clientY - rect.top;

      const prevScale = state.scale;
      const newScale = clampScale(prevScale * (1 - ev.deltaY * WHEEL_SENSITIVITY));

      state.x = offsetX - (offsetX - state.x) * (newScale / prevScale);
      state.y = offsetY - (offsetY - state.y) * (newScale / prevScale);
      state.scale = newScale;
      applyTransform();
    },
    { passive: false }
  );

  // Déplacement (pan) au clic-glissé, et ping sur simple clic (sans glisser)
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let downX = 0;
  let downY = 0;
  let moved = false;
  let pendingPingTimeout = null;

  wrapper.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    if (ev.target.closest(".izp-toolbar")) return; // ne pas capturer les clics sur les boutons
    dragging = true;
    moved = false;
    lastX = downX = ev.clientX;
    lastY = downY = ev.clientY;
    wrapper.classList.add("izp-dragging");
    wrapper.setPointerCapture(ev.pointerId);
  });

  wrapper.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    state.x += ev.clientX - lastX;
    state.y += ev.clientY - lastY;
    lastX = ev.clientX;
    lastY = ev.clientY;
    if (!moved && Math.hypot(ev.clientX - downX, ev.clientY - downY) > PING_CLICK_MOVE_THRESHOLD) {
      moved = true;
    }
    applyTransform();
  });

  wrapper.addEventListener("pointerup", (ev) => {
    if (!dragging) return;
    dragging = false;
    wrapper.classList.remove("izp-dragging");

    // Clic sans glisser = ping. On attend un court instant pour laisser
    // un éventuel double-clic (reset de la vue) annuler ce ping.
    if (!moved) {
      clearTimeout(pendingPingTimeout);
      pendingPingTimeout = setTimeout(() => {
        handlePingClick(app, img, wrapper, ev.clientX, ev.clientY);
      }, PING_DBLCLICK_DELAY_MS);
    }
  });

  for (const evt of ["pointercancel", "pointerleave"]) {
    wrapper.addEventListener(evt, () => {
      dragging = false;
      wrapper.classList.remove("izp-dragging");
    });
  }

  // Double-clic = réinitialiser la vue (et annule un ping en attente)
  wrapper.addEventListener("dblclick", () => {
    clearTimeout(pendingPingTimeout);
    state.scale = 1;
    state.x = 0;
    state.y = 0;
    applyTransform();
  });

  // Barre d'outils
  const toolbar = document.createElement("div");
  toolbar.classList.add("izp-toolbar");

  const zoomInBtn = makeButton("fa-solid fa-magnifying-glass-plus", game.i18n.localize("HANDOUTPINGVIEWER.ZoomIn"));
  const zoomOutBtn = makeButton("fa-solid fa-magnifying-glass-minus", game.i18n.localize("HANDOUTPINGVIEWER.ZoomOut"));
  const resetBtn = makeButton("fa-solid fa-arrows-rotate", game.i18n.localize("HANDOUTPINGVIEWER.Reset"));

  zoomInBtn.addEventListener("click", () => {
    state.scale = clampScale(state.scale * ZOOM_STEP);
    applyTransform();
  });
  zoomOutBtn.addEventListener("click", () => {
    state.scale = clampScale(state.scale / ZOOM_STEP);
    applyTransform();
  });
  resetBtn.addEventListener("click", () => {
    state.scale = 1;
    state.x = 0;
    state.y = 0;
    applyTransform();
  });

  toolbar.append(zoomInBtn, zoomOutBtn, resetBtn);

  // Bouton "forcer la vue", visible uniquement pour le MJ
  if (game.user.isGM) {
    const broadcastBtn = makeButton("fa-solid fa-tower-broadcast", game.i18n.localize("HANDOUTPINGVIEWER.ForceView"));
    broadcastBtn.addEventListener("click", () => broadcastView(app, state));
    toolbar.append(broadcastBtn);
  }

  wrapper.appendChild(toolbar);
  applyTransform();
}

function makeButton(iconClass, tooltip) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.classList.add("izp-btn");
  btn.title = tooltip;
  btn.innerHTML = `<i class="${iconClass}"></i>`;
  return btn;
}

function toElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.jquery) return html[0];
  return html;
}

function getImageSrc(app) {
  return (
    app._izpSrc ??
    app.options?.src ??
    app.object ??
    app.options?.image ??
    null
  );
}

/** Retourne toutes les instances d'ImagePopout actuellement ouvertes, V1 et V2 confondues. */
function getOpenImagePopouts() {
  const v1 = Object.values(ui.windows ?? {});
  const v2 = foundry.applications?.instances ? Array.from(foundry.applications.instances.values()) : [];
  return [...v1, ...v2].filter((w) => w instanceof ImagePopout);
}

/* -------------------------------------------- */
/*  Synchronisation MJ -> joueurs (vue forcée)   */
/* -------------------------------------------- */

function broadcastView(app, state) {
  const src = getImageSrc(app);
  if (!src) {
    console.warn(`${MODULE_ID} | Source d'image introuvable sur l'application`, app);
    ui.notifications.warn(game.i18n.localize("HANDOUTPINGVIEWER.NoSource"));
    return;
  }

  const payload = {
    type: "view",
    src,
    title:
      app.options?.window?.title ??
      app.options?.title ??
      app.element?.querySelector?.(".window-title")?.textContent?.trim() ??
      "",
    transform: { scale: state.scale, x: state.x, y: state.y }
  };

  console.log(`${MODULE_ID} | Diffusion de la vue :`, payload);
  game.socket.emit(SOCKET_EVENT, payload);
  ui.notifications.info(
    game.i18n.format("HANDOUTPINGVIEWER.Broadcasted", { title: payload.title || payload.src })
  );
}

function applyIncomingTransform(app, transform) {
  if (!transform) return;
  const state = app._izpState ?? { scale: 1, x: 0, y: 0 };
  state.scale = transform.scale;
  state.x = transform.x;
  state.y = transform.y;
  app._izpState = state;

  const root = toElement(app.element);
  const img = root?.querySelector("img");
  if (img) img.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
}

/* -------------------------------------------- */
/*  Ping partagé (MJ + joueurs)                  */
/* -------------------------------------------- */

function handlePingClick(app, img, wrapper, clientX, clientY) {
  const src = getImageSrc(app);
  if (!src) return;

  const rect = img.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const fracX = (clientX - rect.left) / rect.width;
  const fracY = (clientY - rect.top) / rect.height;

  const color = game.user.color?.css ?? game.user.color ?? "#ff6400";
  const name = game.user.name ?? "";

  // Affichage immédiat chez soi
  placePingMarker(wrapper, img, fracX, fracY, color, name);

  // Diffusion aux autres clients ayant la même image ouverte
  game.socket.emit(SOCKET_EVENT, { type: "ping", src, fracX, fracY, color, name });
}

function placePingMarker(wrapper, img, fracX, fracY, color, name) {
  const wrapperRect = wrapper.getBoundingClientRect();
  const imgRect = img.getBoundingClientRect();
  if (!imgRect.width || !imgRect.height) return;

  const left = imgRect.left - wrapperRect.left + fracX * imgRect.width;
  const top = imgRect.top - wrapperRect.top + fracY * imgRect.height;

  const marker = document.createElement("div");
  marker.classList.add("izp-ping-marker");
  marker.style.left = `${left}px`;
  marker.style.top = `${top}px`;
  marker.style.setProperty("--ping-color", color);
  marker.innerHTML = `
    <div class="izp-ping-ring"></div>
    <div class="izp-ping-ring izp-ping-ring-delay"></div>
    <div class="izp-ping-dot"></div>
    <div class="izp-ping-label">${foundry.utils.escapeHTML(name ?? "")}</div>
  `;
  wrapper.appendChild(marker);
  setTimeout(() => marker.remove(), PING_LIFETIME_MS);
}

/* -------------------------------------------- */
/*  Réception des messages socket                */
/* -------------------------------------------- */

function onSocketMessage(payload) {
  console.log(`${MODULE_ID} | Message reçu :`, payload);
  if (!payload?.src) return;

  const type = payload.type ?? "view"; // compat. avec d'anciens messages sans type

  if (type === "ping") {
    // Ne touche que les fenêtres déjà ouvertes sur cette image : on ne force
    // pas l'ouverture, le ping ne concerne que ceux qui la regardent déjà.
    const matches = getOpenImagePopouts().filter((w) => getImageSrc(w) === payload.src);
    for (const app of matches) {
      const wrapper = app._izpWrapper;
      const img = app._izpImg;
      if (wrapper && img) placePingMarker(wrapper, img, payload.fracX, payload.fracY, payload.color, payload.name);
    }
    return;
  }

  // type === "view" : vue forcée par le MJ
  const existing = getOpenImagePopouts().find((w) => getImageSrc(w) === payload.src);

  if (existing) {
    applyIncomingTransform(existing, payload.transform);
    existing.bringToFront?.() ?? existing.bringToTop?.();
    return;
  }

  // Sinon, ouvre l'image chez le joueur puis applique la vue
  // ImagePopout (ApplicationV2, v13+) prend un seul objet de configuration.
  const popout = new ImagePopout({ src: payload.src, window: { title: payload.title } });
  const hookId = Hooks.on("renderImagePopout", (app, html) => {
    if (app !== popout) return;
    Hooks.off("renderImagePopout", hookId);
    // Laisse le temps à attachZoomPan (branché juste avant) d'initialiser l'état
    requestAnimationFrame(() => applyIncomingTransform(app, payload.transform));
  });
  popout.render(true);
}
