import { appState, stationStates } from "./state.js";
import { loadConfiguration, renderConfigs } from "./configuration.js?v=37";
import { renderDevices } from "./panels.js?v=33";
import { initializeEventEngine } from "./events.js?v=33";
import { initializeAdmin } from "./admin.js?v=43";
import { detectionCapabilities } from "./detection.js";
import { $ } from "./utils.js";
import { initializeMediaControls } from "./media.js?v=39";
import { initializeKiosk } from "./kiosk.js?v=8";
import { preloadCameraDetector } from "./camera.js?v=36";

async function boot() {
 try {
  const config = await loadConfiguration();
    config.stations.forEach(station => appState.stations.set(station.id, { ...station, enabled: station.enabled ?? true, state: station.enabled === false ? stationStates.DISABLED : stationStates.IDLE }));
  renderConfigs();
  renderDevices();
  initializeEventEngine();
  initializeAdmin();
  initializeMediaControls();
  initializeKiosk();
  preloadCameraDetector();
  $("#system-status").textContent = "Sistema preparado";
  console.info("Capacidades del prototipo:", detectionCapabilities);
 } catch (error) {
  $("#system-status").textContent = "Error de configuración";
  console.error(error);
  const host = $("#station-configs");
  host.innerHTML = `<p role="alert">No se pudo cargar la configuración. Comprueba que el servidor local está activo y que <code>data/contenido.json</code> existe. ${error.message}</p>`;
 }
}
boot();
