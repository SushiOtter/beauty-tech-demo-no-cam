import { appState } from "./state.js";
import { $, escapeHTML } from "./utils.js";

const STORAGE_KEY = "beauty-tech-retail-config-v1";
const editableFields = ["name", "family", "campaign", "copy", "contentType", "dwellMs", "cooldownMs", "enabled"];
const ageRanges = ["18-29", "30-44", "45-59", "60+", "all"];

const iconShapes = {
 apparatology: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
 makeup: '<path d="M8 3h8v4H8zM9 7h6l1 13H8z"/><path d="M10 3V1h4v2"/>',
 haircare: '<path d="M5 3c5 2 2 7 7 9s2 6 7 9"/><path d="M8 2c4 4 0 7 5 10s2 6 5 8"/><path d="M4 10c1 5 5 5 5 10"/>',
 newness: '<path d="M12 2l2.1 7.9L22 12l-7.9 2.1L12 22l-2.1-7.9L2 12l7.9-2.1z"/>',
 haircolor: '<path d="M5 3v18M9 3v18M13 3v18M17 3v18M21 3v18"/><path d="M3 7h20M3 13h20M3 18h20"/>',
 sensor: '<circle cx="12" cy="12" r="2"/><path d="M7 7a7 7 0 0 0 0 10M17 7a7 7 0 0 1 0 10M4 4a11 11 0 0 0 0 16M20 4a11 11 0 0 1 0 16"/>'
};
export function iconSVG(name) {
 return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconShapes[name] || iconShapes.newness}</svg>`;
}

export function createRemoteStation(section) {
 const name = String(section?.name || "").trim();
 if (!/^[a-z0-9-]+$/.test(section?.id || "") || !name || name.length > 48) {
  throw new Error("La sección compartida tiene un identificador o nombre no válido.");
 }
 const ageContent = Object.fromEntries(ageRanges.map(range => [range, {
  headline: `Descubre ${name}`,
  copy: "Acércate para ver los vídeos de esta sección.",
  tags: []
 }]));
 return {
  id: section.id,
  name,
  icon: "newness",
  family: name,
  campaign: "Selección editorial",
  headline: `Descubre ${name}`,
  copy: "Acércate para ver los vídeos de esta sección.",
  tags: [],
  tint: "#e7ddd0",
  deep: "#8b7259",
  posterByAge: {},
  ageContent,
  clips: [],
  contentType: "Campaña",
  dwellMs: 1800,
  cooldownMs: 8000,
  enabled: true,
  remoteSection: true
 };
}

export async function loadConfiguration() {
 const response = await fetch("./data/contenido.json?v=37");
 if (!response.ok) throw new Error("No se ha podido cargar data/contenido.json");
 const data = await response.json();
 if (!Array.isArray(data.stations) || data.stations.length !== 5) throw new Error("La configuración debe contener cinco estaciones comerciales.");
 const ageKeys = ["18-29", "30-44", "45-59", "60+", "all"];
 if (data.stations.some(station => !station.posterByAge || !ageKeys.every(key => typeof station.posterByAge[key] === "string")
   || !station.ageContent || !ageKeys.every(key => station.ageContent[key] && Array.isArray(station.ageContent[key].tags)))) {
  throw new Error("Cada estación debe definir contenido y póster para las cinco franjas.");
 }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && Array.isArray(saved.stations)) data.stations = data.stations.map(station => {
      const stored = saved.stations.find(item => item.id === station.id);
      if (!stored || typeof stored !== "object") return station;
      for (const field of editableFields) {
        const value = stored[field];
        if (field === "enabled" && typeof value === "boolean") station[field] = value;
        else if (["dwellMs", "cooldownMs"].includes(field) && Number.isFinite(value)) station[field] = Math.max(0, Math.min(120000, value));
        else if (typeof value === "string" && (field === "copy" || value.trim())) station[field] = value.trim().slice(0, field === "name" ? 48 : 120);
      }
      return station;
    });
  } catch (error) {
    console.warn("La configuración local no se pudo recuperar; se usarán los valores iniciales.", error);
    try { localStorage.removeItem(STORAGE_KEY); }
    catch (clearError) { console.warn("No se pudo limpiar la configuración local dañada.", clearError); }
  }
 appState.config = data;
 return data;
}

export function saveConfiguration() {
  const payload = { stations: [...appState.stations.values()].map(station => ({
    id: station.id,
    ...Object.fromEntries(editableFields.map(field => [field, station[field]]))
  })) };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    const status = $("#save-status");
    if (status) status.textContent = "Guardado en este navegador";
    return true;
  } catch (error) {
    console.error("No se pudo guardar la configuración local:", error);
    const status = $("#save-status");
    if (status) status.textContent = "No se pudo guardar; revisa el almacenamiento del navegador";
    return false;
  }
}

export function clearSavedConfiguration() {
  try { localStorage.removeItem(STORAGE_KEY); return true; }
  catch (error) { console.error("No se pudo borrar la configuración local:", error); return false; }
}

export function renderConfigs() {
 const host = $("#station-configs");
 const count = $("#section-count");
 if (count) count.textContent = String(appState.stations.size).padStart(2, "0");
 host.innerHTML = [...appState.stations.values()].map((station, index) => `
  <article class="config-card" style="--card-tint:${station.tint};--card-deep:${station.deep}">
   <div class="config-card-head"><span class="config-icon">${iconSVG(station.icon)}</span><div><span class="station-number">${station.remoteSection ? "SECCIÓN" : "ESTACIÓN"} ${String(index + 1).padStart(2, "0")}</span><h3>${escapeHTML(station.name)}</h3></div></div>
  <label for="name-${station.id}">${station.remoteSection ? "Nombre de sección compartido" : "Nombre de estación"}</label><input id="name-${station.id}" data-config="name" data-id="${station.id}" value="${escapeHTML(station.name)}" maxlength="48" ${station.remoteSection ? "disabled" : ""}>
  <label for="copy-${station.id}">Descripción</label><textarea id="copy-${station.id}" data-config="copy" data-id="${station.id}" maxlength="120" rows="2">${escapeHTML(station.copy)}</textarea>
   <label for="family-${station.id}">Familia comercial</label>
   <select id="family-${station.id}" data-config="family" data-id="${station.id}">
    ${[station.family,"Rutina esencial","Selección premium","Campaña de temporada"].filter((v,i,a)=>a.indexOf(v)===i).map(v=>`<option ${v===station.family?"selected":""}>${escapeHTML(v)}</option>`).join("")}
   </select>
   <label for="campaign-${station.id}">Campaña activa</label>
   <select id="campaign-${station.id}" data-config="campaign" data-id="${station.id}">
    ${[station.campaign,"Selección editorial","Ritual diario","Novedad destacada"].filter((v,i,a)=>a.indexOf(v)===i).map(v=>`<option ${v===station.campaign?"selected":""}>${escapeHTML(v)}</option>`).join("")}
   </select>
  <label for="content-${station.id}">Tipo de contenido</label><select id="content-${station.id}" data-config="contentType" data-id="${station.id}">${["Producto", "Tratamiento", "Campaña"].map(value => `<option ${value === (station.contentType || "Campaña") ? "selected" : ""}>${value}</option>`).join("")}</select>
  <div class="timing-fields"><label for="dwell-${station.id}">Permanencia (seg.)<input id="dwell-${station.id}" data-config="dwellMs" data-id="${station.id}" type="number" min="0" max="30" step="0.5" value="${(station.dwellMs ?? appState.config.settings.attentionThresholdMs) / 1000}"></label><label for="cooldown-${station.id}">Espera (seg.)<input id="cooldown-${station.id}" data-config="cooldownMs" data-id="${station.id}" type="number" min="1" max="120" step="1" value="${(station.cooldownMs ?? appState.config.settings.cooldownMs) / 1000}"></label></div>
  <label class="toggle-row" for="enabled-${station.id}"><span>Estación activa</span><span class="toggle"><input id="enabled-${station.id}" data-config="enabled" data-id="${station.id}" type="checkbox" ${station.enabled ? "checked" : ""}><span class="toggle-track"></span></span></label>
  <button class="button button-secondary station-test" data-test-station="${station.id}" type="button">Probar estación</button>
  </article>`).join("");
}
