import { appState, stationStates } from "./state.js";
import { createRemoteStation, loadConfiguration, renderConfigs } from "./configuration.js?v=38";
import { renderDevices } from "./panels.js?v=33";
import { initializeEventEngine } from "./events.js?v=33";
import { initializeAdmin } from "./admin.js?v=44";
import { detectionCapabilities } from "./detection.js";
import { $ } from "./utils.js";
import { initializeMediaControls } from "./media.js?v=41";
import { initializeKiosk } from "./kiosk.js?v=8";
import { preloadCameraDetector } from "./camera.js?v=37";
import { isSupabaseConfigured, listVideoSections } from "./supabase.js?v=2";

function addRemoteSections(sections) {
  let added = 0;
  for (const section of sections) {
    if (section.id === "global" || appState.stations.has(section.id)) continue;
    const station = createRemoteStation(section);
    appState.stations.set(station.id, {
      ...station,
      state: station.enabled ? stationStates.IDLE : stationStates.DISABLED
    });
    added += 1;
  }
  return added;
}

async function boot() {
 try {
  const config = await loadConfiguration();
    config.stations.forEach(station => appState.stations.set(station.id, { ...station, enabled: station.enabled ?? true, state: station.enabled === false ? stationStates.DISABLED : stationStates.IDLE }));
  let sectionCatalogError = null;
  let sectionCatalogAvailable = false;
  if (isSupabaseConfigured()) {
    try {
      addRemoteSections(await listVideoSections());
      sectionCatalogAvailable = true;
    } catch (error) {
      sectionCatalogError = error;
      console.warn("No se pudieron cargar las secciones compartidas de Supabase.", error);
    }
  }
  renderConfigs();
  renderDevices();
  initializeEventEngine();
  initializeAdmin();
  initializeMediaControls({
    sectionLoadError: sectionCatalogError
      ? `No se pudieron cargar las secciones compartidas: ${sectionCatalogError.message}. Comprueba que has ejecutado supabase/setup.sql actualizado.`
      : isSupabaseConfigured() ? "" : "Conecta Supabase para compartir secciones entre dispositivos."
  });
  initializeKiosk();
  preloadCameraDetector();
  $("#system-status").textContent = "Sistema preparado";
  console.info("Capacidades del prototipo:", detectionCapabilities);
  if (isSupabaseConfigured() && sectionCatalogAvailable) {
    window.setInterval(async () => {
      try {
        const added = addRemoteSections(await listVideoSections());
        if (!added) return;
        renderConfigs();
        renderDevices();
        window.dispatchEvent(new CustomEvent("beautytech:sections-changed"));
      } catch (error) {
        console.warn("No se pudieron actualizar las secciones compartidas.", error);
      }
    }, 30000);
  }
 } catch (error) {
  $("#system-status").textContent = "Error de configuración";
  console.error(error);
  const host = $("#station-configs");
  host.innerHTML = `<p role="alert">No se pudo cargar la configuración. Comprueba que el servidor local está activo y que <code>data/contenido.json</code> existe. ${error.message}</p>`;
 }
}
boot();
