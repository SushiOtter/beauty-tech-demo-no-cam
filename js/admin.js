import { appState } from "./state.js";
import { $, announce, escapeHTML } from "./utils.js";
import { renderDevices } from "./panels.js?v=33";
import { emitEvent, resetStation, resetStations } from "./events.js?v=33";
import { initializeCameraControls, refreshStationSelectors, resetCameraPreferences, startCamera, stopCamera } from "./camera.js?v=37";
import { clearSavedConfiguration, loadConfiguration, renderConfigs, saveConfiguration } from "./configuration.js?v=35";
import { ageProfiles, getAgeProfile, getStationRecommendations } from "./products.js?v=33";

let guidedTimer = null;
let guidedIndex = 0;
let pendingStationId = "";
let returnAfterConsent = true;
let scanTimeout = null;
const GUIDED_INTERVAL_KEY = "beauty-tech-guided-interval-v1";
function syncWorkerStationSelection() {
 const select = $("#worker-station");
 const cameraSelect = $("#camera-station");
 if (!select || !cameraSelect) return;
 const enabled = [...appState.stations.values()].filter(station => station.enabled);
 select.innerHTML = enabled.map(station => `<option value="${escapeHTML(station.id)}">${escapeHTML(station.name)}</option>`).join("");
 const selected = enabled.some(station => station.id === cameraSelect.value) ? cameraSelect.value : enabled[0]?.id || "";
 select.value = selected;
 cameraSelect.value = selected;
 if (!enabled.length) {
   $("#worker-start").disabled = true;
   $("#start-section-experience").disabled = true;
 } else {
   $("#worker-start").disabled = false;
   $("#start-section-experience").disabled = false;
 }
 renderWorkerStationCards(enabled);
 updateWorkerSelectionVisual(select.value);
}
function renderWorkerStationCards(stations) {
 const host = $("#worker-station-cards");
 if (!host) return;
 host.innerHTML = stations.map((station, index) => `
  <button class="worker-station-card" type="button" data-worker-station="${escapeHTML(station.id)}" aria-pressed="false">
   ${station.posterByAge?.all ? `<img src="${escapeHTML(station.posterByAge.all)}" alt="" loading="${index < 3 ? "eager" : "lazy"}">` : ""}
   <span class="worker-station-shade"></span>
   <span class="worker-station-index">0${index + 1} <span>·</span> BEAUTY TECH</span>
   <span class="worker-station-content">
    <span class="worker-station-title">${escapeHTML(station.name)}</span>
    <span class="worker-station-copy">${escapeHTML(station.headline || station.copy)}</span>
   </span>
   <span class="worker-station-arrow" aria-hidden="true">↗</span>
  </button>`).join("");
}
function updateWorkerSelectionVisual(stationId) {
 const station = appState.stations.get(stationId);
 if (!station) return;
 $("#worker-selected-station").textContent = station.name;
 $("#worker-station-cards").querySelectorAll("[data-worker-station]").forEach(card => {
  card.setAttribute("aria-pressed", String(card.dataset.workerStation === stationId));
 });
}
function startSelectedExperience(stationId) {
 const station = appState.stations.get(stationId);
 if (!stationId) return announce("Activa al menos una sección antes de iniciar la experiencia.");
 if (!station?.enabled) return announce("Elige una sección activa.");
 pendingStationId = station.id;
 window.dispatchEvent(new CustomEvent("beautytech:kiosk-start-requested", {
   detail: { stationId: station.id }
 }));
}
async function startConsentedExperience() {
 const acceptButton = $("#camera-consent-accept");
 const retryButton = $("#camera-error-retry");
 if (acceptButton.disabled || retryButton.disabled) return;
 acceptButton.disabled = true;
 retryButton.disabled = true;
 const station = appState.stations.get(pendingStationId);
 if (!station?.enabled) {
   announce("La sección seleccionada ya no está disponible.");
   returnToConsentOrigin();
   acceptButton.disabled = false;
   retryButton.disabled = false;
   return;
 }
 $("#camera-consent-view").hidden = true;
 $("#camera-error-view").hidden = true;
 $("#scan-view").hidden = true;
 $("#scan-status").textContent = "Buscando un solo rostro…";
 $("#scan-progress").value = 0;
 $("#scan-progress-label").textContent = "0 de 10 lecturas · máximo 20 segundos";
 if (appState.mode !== "public" || appState.presentationStationId !== station.id) setPublicMode(true, station.id);
 $("#worker-view").hidden = true;
 $("#admin-view").hidden = true;
 $("#admin-lock").hidden = true;
 $("#public-mode-label").textContent = "ESPERANDO CLIENTE";
 $("#presentation-status").textContent = "Detección local activa. Acércate a la tablet para ver recomendaciones.";
 clearTimeout(scanTimeout);
 scanTimeout = setTimeout(() => {
   completeAgeScan("all", "scan-timeout");
   $("#scan-status").textContent = "No se obtuvo una lectura fiable. Mostramos contenido para todas las edades.";
 }, 20000);
 const cameraReady = await startCamera();
 if (!cameraReady) {
   clearTimeout(scanTimeout);
   scanTimeout = null;
   $("#scan-view").hidden = true;
   const errorMessage = $("#camera-status").textContent;
   setPublicMode(false);
   $("#worker-view").hidden = true;
   $("#admin-view").hidden = true;
   $("#camera-error-view").hidden = false;
   $("#camera-error-copy").textContent = `${errorMessage} Puedes volver a intentarlo, hacer una simulación sin cámara o regresar al inicio.`;
   $("#admin-lock").hidden = true;
   retryButton.focus();
   acceptButton.disabled = false;
   retryButton.disabled = false;
   return;
 }
 announce(`Detección local lista para ${station.name}. La cámara espera un rostro.`);
 acceptButton.disabled = false;
 retryButton.disabled = false;
}
function completeAgeScan(ageGroup, source) {
 clearTimeout(scanTimeout);
 scanTimeout = null;
 window.dispatchEvent(new CustomEvent("beautytech:age-estimated", {
  detail: { ageGroup, source }
 }));
}
function returnToConsentOrigin() {
 clearTimeout(scanTimeout);
 scanTimeout = null;
 $("#scan-view").hidden = true;
 $("#camera-consent-view").hidden = true;
 $("#camera-error-view").hidden = true;
 if (appState.mode === "public") setPublicMode(false);
 $("#worker-view").hidden = !returnAfterConsent;
 $("#admin-view").hidden = returnAfterConsent;
 $("#admin-lock").hidden = false;
 if (returnAfterConsent) appState.returnToWorker = true;
 (returnAfterConsent ? $("#worker-start") : $("#start-section-experience"))?.focus();
}
function returnToWorkerHome() {
 clearTimeout(scanTimeout);
 scanTimeout = null;
 $("#scan-view").hidden = true;
 stopCamera();
 appState.returnToWorker = true;
 if (appState.mode === "public") {
   setPublicMode(false);
 }
 $("#camera-consent-view").hidden = true;
 $("#camera-error-view").hidden = true;
 $("#admin-view").hidden = true;
 $("#worker-view").hidden = false;
 $("#admin-lock").hidden = false;
 $("#worker-start")?.focus();
}
function continueWithoutCamera() {
 clearTimeout(scanTimeout);
 scanTimeout = null;
 stopCamera(true, true);
 $("#scan-view").hidden = true;
 $("#camera-consent-view").hidden = true;
 $("#camera-error-view").hidden = true;
 if (appState.mode !== "public") {
  $("#worker-view").hidden = !returnAfterConsent;
  $("#admin-view").hidden = returnAfterConsent;
  setPublicMode(true, pendingStationId);
 }
 completeAgeScan("all", "no-camera");
 $("#public-mode-label").textContent = "SECCIÓN · CONTENIDO GENERAL";
 $("#presentation-status").textContent = "Se muestran recomendaciones generales para la sección seleccionada.";
 announce("Se muestran recomendaciones generales para todas las edades; no se ha usado la cámara.");
}
function startCameraFreeDemo() {
 $("#camera-error-view").hidden = true;
 $("#admin-view").hidden = false;
 $("#worker-view").hidden = true;
 $("#admin-lock").hidden = false;
 appState.returnToWorker = false;
 startGuidedDemo();
}
function updateAgeRecommendations(range, manuallySelected = false, reason = "") {
 const panel = $("#age-recommendation-panel");
 const validRange = Object.prototype.hasOwnProperty.call(ageProfiles, range);
 const selectedRange = validRange ? range : null;
 const profile = getAgeProfile(selectedRange);
 const title = $("#age-recommendation-title");
 const copy = $("#age-recommendation-copy");
 const list = $("#age-product-list");
 const select = $("#age-range-select");
 const station = appState.presentationMode ? appState.stations.get(appState.presentationStationId) : null;
 const stationRecommendations = station ? getStationRecommendations(station, selectedRange || "all") : null;
 const nextCustomer = $("#kiosk-next-customer");
 panel.hidden = false;
 $("#kiosk-welcome-panel").hidden = true;
 if (nextCustomer) nextCustomer.hidden = !station;
 const panelEyebrow = panel.querySelector(".eyebrow");
 const panelNote = panel.querySelector("small");
 if (station && panelEyebrow) panelEyebrow.textContent = `PRODUCTOS PARA DESCUBRIR · ${profile.label}`;
 if (station && panelNote) panelNote.textContent = "Sugerencias editoriales para esta sección; no representan catálogo, precio ni disponibilidad. La edad no determina por sí sola las necesidades de cuidado.";
 title.textContent = station
  ? stationRecommendations.headline
  : selectedRange === "all" && !manuallySelected
   ? "Contenido para todas las edades"
   : selectedRange
    ? `${manuallySelected ? "Rango seleccionado" : "Rango estimado"}: ${profile.label}`
    : "No se pudo estimar la edad";
 copy.textContent = stationRecommendations
  ? stationRecommendations.copy
  : manuallySelected
   ? "Estas sugerencias generales se muestran para el rango que has elegido."
  : reason === "multiple-faces"
   ? "Se han detectado varias personas; por privacidad, mostramos contenido general."
   : reason === "under-18"
    ? "Para proteger la privacidad, mostramos contenido para todas las edades."
    : reason === "no-camera"
     ? "Has elegido continuar sin cámara; no se ha estimado la edad."
     : reason === "scan-timeout" || reason === "insufficient-readings"
      ? "No se obtuvo una lectura fiable; mostramos contenido general."
      : selectedRange
       ? "Estas sugerencias generales se muestran para el rango estimado. Puedes corregirlo si no coincide contigo."
       : "Se muestran ideas generales. Si quieres, selecciona un rango para adaptar las sugerencias.";
 const products = stationRecommendations?.products || profile.products;
 list.replaceChildren(...products.map(product => {
  const item = document.createElement("li");
  item.textContent = product;
  return item;
 }));
 if (select) select.value = selectedRange || "";
}
function resetAgeRecommendations() {
 const panel = $("#age-recommendation-panel");
 if (panel) panel.hidden = true;
 const panelEyebrow = panel?.querySelector(".eyebrow");
 const panelNote = panel?.querySelector("small");
 if (panelEyebrow) panelEyebrow.textContent = "SELECCIÓN ORIENTATIVA";
 if (panelNote) panelNote.textContent = "La edad no determina las necesidades de la piel. Estas sugerencias son generales y puedes elegir otro rango.";
 const nextCustomer = $("#kiosk-next-customer");
 if (nextCustomer) nextCustomer.hidden = true;
 const welcome = $("#kiosk-welcome-panel");
 if (welcome) welcome.hidden = !appState.presentationMode;
 const select = $("#age-range-select");
 if (select) select.value = "";
}
function initializeAgeRecommendations() {
 const select = $("#age-range-select");
 select.innerHTML = `<option value="" selected disabled>Selecciona un rango</option>${Object.entries(ageProfiles)
  .map(([range, profile]) => `<option value="${range}">${profile.label}</option>`).join("")}`;
 $("#age-range-update").addEventListener("click", () => {
  if (!ageProfiles[select.value]) return announce("Selecciona un rango de edad para actualizar las sugerencias.");
  updateAgeRecommendations(select.value, true);
  window.dispatchEvent(new CustomEvent("beautytech:age-estimated", {
   detail: { ageGroup: select.value, source: "manual-range-selection" }
  }));
  announce("Sugerencias actualizadas para el rango seleccionado.");
 });
 window.addEventListener("beautytech:age-estimated", ({ detail = {} }) => {
  if (appState.mode === "public") {
   updateAgeRecommendations(detail.ageGroup, detail.source === "manual-range-selection", detail.reason || detail.source);
   if (detail.source !== "manual-range-selection") {
    $("#scan-view").hidden = true;
    const sampleCount = Math.min(10, Math.max(0, Number(detail.sampleCount) || 0));
    $("#scan-progress").value = sampleCount;
    $("#scan-status").textContent = detail.reason === "multiple-faces"
     ? "Se han detectado varias personas. Mostramos contenido para todas las edades."
     : detail.reason === "under-18"
      ? "Para proteger la privacidad, mostramos contenido para todas las edades."
      : detail.reason === "insufficient-readings" || detail.source === "scan-timeout"
       ? "No se obtuvo una lectura fiable. Mostramos contenido para todas las edades."
       : "Lectura completada.";
    $("#scan-progress-label").textContent = sampleCount
     ? `${sampleCount} de 10 lecturas`
     : "Lectura no disponible · contenido general";
    if (detail.source !== "camera") stopCamera(true, true);
   }
  }
 });
 window.addEventListener("beautytech:age-scan-progress", ({ detail = {} }) => {
  if (appState.mode !== "public") return;
  const completed = Math.min(10, Math.max(0, Number(detail.completed) || 0));
  $("#scan-progress").value = completed;
  $("#scan-progress-label").textContent = `${completed} de 10 lecturas · máximo 20 segundos`;
  $("#scan-status").textContent = completed
   ? "Midiendo una franja aproximada de edad…"
   : "Buscando un solo rostro…";
 });
}
function guidedIntervalMs() {
 const field = $("#guided-interval");
 const seconds = Math.max(12, Math.min(45, Number(field.value) || 14.5));
 field.value = String(seconds);
 return seconds * 1000;
}
function stopGuidedDemo() { if (guidedTimer) clearTimeout(guidedTimer); guidedTimer = null; guidedIndex = 0; $("#guided-stop").hidden = true; $("#guided-complete").hidden = true; }
function runGuidedStep() {
 const enabled = [...appState.stations.values()].filter(station => station.enabled);
 if (appState.mode !== "public" || !enabled.length || guidedIndex >= enabled.length) {
  guidedTimer = null;
  resetStations();
  $("#guided-stop").hidden = true;
  $("#guided-complete").hidden = false;
  announce("Demostración guiada completada.");
  return;
 }
 const station = enabled[guidedIndex++];
 emitEvent("entry");
 const interval = guidedIntervalMs();
 emitEvent("attention", station.id, { proximity: 0.85, dwellMs: interval, orientation: null, source: "guided-demo" });
 announce(`Recorrido guiado · ${guidedIndex}/${enabled.length}: ${station.name}`);
 guidedTimer = setTimeout(runGuidedStep, interval);
}

function startGuidedDemo() {
 const enabled = [...appState.stations.values()].filter(station => station.enabled);
 if (!enabled.length) return announce("Activa al menos una estación para iniciar la demostración.");
 stopGuidedDemo();
 stopCamera();
 setPublicMode(true);
 $("#public-mode-label").textContent = "SIMULACIÓN GUIADA";
 $("#guided-stop").hidden = false;
 runGuidedStep();
}

export function initializeAdmin() {
 initializeCameraControls();
 syncWorkerStationSelection();
 window.addEventListener("beautytech:sections-changed", () => {
  refreshStationSelectors();
  syncWorkerStationSelection();
 });
 $("#worker-station")?.addEventListener("change", event => {
   const cameraSelect = $("#camera-station");
   cameraSelect.value = event.target.value;
   cameraSelect.dispatchEvent(new Event("change"));
   updateWorkerSelectionVisual(event.target.value);
 });
 $("#worker-station-cards")?.addEventListener("click", event => {
   const card = event.target.closest("[data-worker-station]");
   if (!card) return;
   const select = $("#worker-station");
   select.value = card.dataset.workerStation;
   select.dispatchEvent(new Event("change", { bubbles: true }));
 });
 $("#worker-start")?.addEventListener("click", () => startSelectedExperience($("#worker-station").value));
 $("#start-section-experience")?.addEventListener("click", () => startSelectedExperience($("#camera-station")?.value || ""));
 window.addEventListener("beautytech:camera-consent-requested", () => {
   startSelectedExperience($("#camera-station")?.value || $("#worker-station")?.value || "");
 });
 $("#camera-consent-accept")?.addEventListener("click", startConsentedExperience);
 $("#camera-consent-decline")?.addEventListener("click", continueWithoutCamera);
 $("#camera-consent-cancel")?.addEventListener("click", returnToWorkerHome);
 $("#kiosk-next-customer")?.addEventListener("click", () => {
  stopCamera(true, true);
  resetStation(pendingStationId);
  appState.ageGroup = "all";
  appState.ageGroupSource = "default";
  renderDevices();
  resetAgeRecommendations();
  $("#camera-consent-view").hidden = false;
  $("#public-mode-label").textContent = "VÍDEO · ESPERANDO CONSENTIMIENTO";
  $("#presentation-status").textContent = "La cámara está apagada. La siguiente persona puede dar su consentimiento para empezar.";
  $("#camera-consent-accept")?.focus();
 });
 $("#camera-error-retry")?.addEventListener("click", startConsentedExperience);
 $("#camera-error-demo")?.addEventListener("click", startCameraFreeDemo);
 $("#camera-error-no-camera")?.addEventListener("click", continueWithoutCamera);
 $("#camera-error-home")?.addEventListener("click", returnToWorkerHome);
 $("#scan-cancel")?.addEventListener("click", returnToWorkerHome);
 $("#scan-without-camera")?.addEventListener("click", continueWithoutCamera);
 window.addEventListener("beautytech:customer-left", () => {
  stopCamera(true, true);
  resetAgeRecommendations();
  $("#camera-consent-view").hidden = false;
  $("#camera-error-view").hidden = true;
  $("#public-mode-label").textContent = "VÍDEO · ESPERANDO CONSENTIMIENTO";
  $("#presentation-status").textContent = "La cámara está apagada. El vídeo sigue en reproducción para la siguiente persona.";
 });
 window.addEventListener("beautytech:session-timeout", () => {
  stopCamera();
  $("#scan-view").hidden = true;
  setPublicMode(false);
  appState.returnToWorker = true;
  announce("La experiencia ha vuelto al inicio tras dos minutos sin interacción.");
 });
 window.addEventListener("pointerdown", () => {
  if (appState.mode === "public") window.dispatchEvent(new CustomEvent("beautytech:activity"));
 });
 window.addEventListener("keydown", () => {
  if (appState.mode === "public") window.dispatchEvent(new CustomEvent("beautytech:activity"));
 });
 initializeAgeRecommendations();
 try {
   const savedInterval = Number(localStorage.getItem(GUIDED_INTERVAL_KEY));
   if (Number.isFinite(savedInterval) && savedInterval >= 12 && savedInterval <= 45) $("#guided-interval").value = String(savedInterval);
 } catch (error) { console.warn("No se pudo recuperar la duración de la demo.", error); }
 $("#guided-interval").addEventListener("change", event => {
   const interval = guidedIntervalMs() / 1000;
   try { localStorage.setItem(GUIDED_INTERVAL_KEY, String(interval)); }
   catch (error) { console.error("No se pudo guardar la duración de la demo:", error); announce("No se pudo guardar la preferencia en este navegador."); }
 });
 $("#station-configs").addEventListener("change", event => {
  const control = event.target;
  const id = control.dataset.id;
  const station = appState.stations.get(id);
  if (!station) return;
  if (control.dataset.config === "enabled") {
   station.enabled = control.checked;
   resetStation(id);
   syncWorkerStationSelection();
  } else if (control.dataset.config) {
   const field = control.dataset.config;
   let value = control.value;
   if (["dwellMs", "cooldownMs"].includes(field)) {
     const seconds = Number(control.value);
     if (!Number.isFinite(seconds)) return;
     const min = field === "dwellMs" ? 0 : 1;
     const max = field === "dwellMs" ? 30 : 120;
     value = Math.max(min, Math.min(max, seconds)) * 1000;
     control.value = String(value / 1000);
   }
   if (field === "name" && !String(value).trim()) {
     $("#save-status").textContent = "El nombre de estación no puede estar vacío";
     return;
   }
   station[field] = value;
  }
  saveConfiguration();
  renderDevices();
 });
 $("#station-configs").addEventListener("input", event => {
   const control = event.target;
   const station = appState.stations.get(control.dataset.id);
   if (!station || !["name", "copy"].includes(control.dataset.config)) return;
   const value = control.value.trim();
   if (control.dataset.config === "name" && !value) {
     $("#save-status").textContent = "El nombre de estación no puede estar vacío";
     return;
   }
   station[control.dataset.config] = value;
   if (control.dataset.config === "name") {
     control.closest(".config-card").querySelector("h3").textContent = value;
     document.querySelectorAll(`#media-station option[value="${station.id}"], #camera-station option[value="${station.id}"], #worker-station option[value="${station.id}"], #zone-selects option[value="${station.id}"]`).forEach(option => { option.textContent = value; });
   }
   saveConfiguration();
   renderDevices();
 });
 $("#station-configs").addEventListener("click", event => {
   const button = event.target.closest("[data-test-station]");
   if (!button) return;
   const station = appState.stations.get(button.dataset.testStation);
   if (!station?.enabled) return announce("Activa esta estación antes de probarla.");
   setPublicMode(true);
  $("#public-mode-label").textContent = "SIMULACIÓN MANUAL";
   emitEvent("entry");
   emitEvent("attention", station.id, { proximity: 0.9, dwellMs: station.dwellMs ?? appState.config.settings.attentionThresholdMs, source: "manual-test" });
   announce(`Simulación manual: ${station.name}.`);
 });
 $("#restore-defaults").addEventListener("click", async () => {
   if (!window.confirm("¿Restaurar la configuración inicial de las cinco estaciones?")) return;
  if (!clearSavedConfiguration()) return announce("No se pudo borrar la configuración guardada; no se ha restablecido.");
  resetCameraPreferences();
  try { localStorage.removeItem(GUIDED_INTERVAL_KEY); } catch (error) { console.warn("No se pudo restablecer la duración de la demo.", error); }
   try {
     const config = await loadConfiguration();
     const remoteStations = [...appState.stations.values()].filter(station => station.remoteSection);
     appState.stations = new Map([
       ...config.stations.map(station => [station.id, { ...station, enabled: true, state: "idle" }]),
       ...remoteStations.map(station => [station.id, { ...station, state: station.enabled ? "idle" : "disabled" }])
     ]);
     renderConfigs();
     syncWorkerStationSelection();
     renderDevices();
    $("#guided-interval").value = "14.5";
     saveConfiguration();
     announce("Se restauraron los valores iniciales.");
   } catch (error) {
     console.error("No se pudo restaurar la configuración:", error);
     announce("No se pudo restaurar la configuración inicial.");
   }
 });
 $("#test-event").addEventListener("click", () => {
   const target = [...appState.stations.values()].find(s => s.enabled);
   if (!target) return announce("Activa al menos una estación para probarla.");
   if (appState.mode !== "public") {
     // El botón de prueba cambia temporalmente a modo público para que la misma lógica gestione el evento.
     setPublicMode(true);
     $("#public-mode-label").textContent = "SIMULACIÓN MANUAL";
     emitEvent("entry");
     emitEvent("attention", target.id);
   } else emitEvent("attention", target.id);
 });
 $("#start-public").addEventListener("click", () => setPublicMode(true));
 $("#guided-demo").addEventListener("click", startGuidedDemo);
 $("#guided-stop").addEventListener("click", () => setPublicMode(false));
 $("#guided-repeat").addEventListener("click", startGuidedDemo);
 $("#guided-return").addEventListener("click", () => setPublicMode(false));
 // Atajos de presentación para el empleado: Ctrl+Alt+1..5 simula interés en una estación.
 // No se muestran botones ni controles al visitante en modo público.
 window.addEventListener("keydown", event => {
   if (!event.ctrlKey || !event.altKey || !/^[1-5]$/.test(event.key)) return;
   if (appState.mode !== "public" || appState.kioskMode) return;
   event.preventDefault();
   const station = [...appState.stations.values()][Number(event.key) - 1];
   if (!station || !station.enabled) return announce("Esa estación está desactivada.");
   emitEvent("entry");
   emitEvent("attention", station.id, { proximity: 0.9, dwellMs: 2400, orientation: true });
  $("#public-mode-label").textContent = "SIMULACIÓN MANUAL";
   announce(`Simulación: interés detectado en ${station.name}.`);
 });
 $("#admin-lock").addEventListener("click", () => {
   if (appState.mode === "public") {
     if (appState.kioskMode) {
       window.dispatchEvent(new CustomEvent("beautytech:kiosk-stop-requested"));
       return;
     }
     stopCamera();
     appState.returnToWorker = false;
     setPublicMode(false);
     return;
   }
   const showAdmin = $("#admin-view").hidden;
   appState.returnToWorker = !showAdmin;
   $("#worker-view").hidden = showAdmin;
   $("#admin-view").hidden = !showAdmin;
   $("#admin-lock").textContent = showAdmin ? "Modo trabajador ↗" : "Administración ↗";
 });
 $("#presentation-exit")?.addEventListener("click", () => {
   if (appState.kioskMode) {
     window.dispatchEvent(new CustomEvent("beautytech:kiosk-stop-requested"));
     return;
   }
   stopCamera();
   appState.returnToWorker = true;
   setPublicMode(false);
 });
 window.addEventListener("keydown", event => {
   if (event.key === "Escape" && appState.kioskMode) {
     window.dispatchEvent(new CustomEvent("beautytech:kiosk-stop-requested"));
   } else if (event.key === "Escape" && appState.presentationMode) {
     stopCamera();
     appState.returnToWorker = true;
     setPublicMode(false);
   }
 });
}
export function setPublicMode(enabled, presentationStationId = "") {
 appState.kioskMode = false;
 if (!enabled) {
  stopGuidedDemo();
  $("#scan-view").hidden = true;
  $("#camera-consent-view").hidden = true;
  $("#camera-error-view").hidden = true;
  const player = $("#station-player");
  player?.querySelector("video")?.pause();
  if (player) player.hidden = true;
 }
 if (enabled) appState.returnToWorker = !$("#worker-view").hidden;
 // Cancela temporizadores de sesiones anteriores al cambiar de modo.
 clearTimeout(appState.sessionTimer);
 appState.sessionTimer = null;
 appState.mode = enabled ? "public" : "admin";
 appState.presentationMode = enabled && Boolean(presentationStationId);
 appState.presentationStationId = appState.presentationMode ? presentationStationId : "";
 document.body.classList.toggle("presentation-mode", appState.presentationMode);
 $("#worker-view").hidden = enabled || !appState.returnToWorker;
 $("#admin-view").hidden = enabled || appState.returnToWorker;
 $("#public-view").hidden = !enabled;
 $("#presentation-exit").hidden = !appState.presentationMode;
 $("#public-mode-label").textContent = "ESPERA DE PRESENCIA";
 resetAgeRecommendations();
 $("#guided-complete").hidden = true;
 $("#guided-stop").hidden = true;
 $("#admin-lock").textContent = enabled ? "Salir · Administración ↗" : appState.returnToWorker ? "Administración ↗" : "Modo trabajador ↗";
 $("#system-status").textContent = enabled ? "Modo público activo" : "Sistema preparado";
 if (enabled) {
   appState.ageGroup = "all";
   appState.ageGroupSource = "default";
   appState.sessionActive = false;
   resetStations();
   window.dispatchEvent(new CustomEvent("beautytech:activity"));
   announce("Modo público activo. La instalación espera señales de interés.");
 } else {
   $("#presentation-heading").textContent = "Descubre tu próximo";
   $("#presentation-heading-accent").textContent = "ritual.";
   $("#admin-lock").hidden = false;
   appState.sessionActive = false;
   resetStations();
   announce("Administración disponible.");
 }
 renderDevices();
}
