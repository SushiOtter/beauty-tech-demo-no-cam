import { appState } from "./state.js";
import { $ } from "./utils.js";
import { listVideos } from "./supabase.js?v=2";
import { GLOBAL_VIDEO_SECTION_ID } from "./supabase-config.js?v=38";

let activeStationId = "";
let playlist = [];
let playlistCursor = 0;
let activeVideoIndex = -1;
let playbackActive = false;
let failedVideoIndexes = new Set();
let fallbackPlaylist = [];

function showVideo(index) {
  const video = $("#kiosk-video");
  if (!playbackActive || !playlist.length) return;
  const videoIndex = index % playlist.length;
  activeVideoIndex = videoIndex;
  const media = playlist[videoIndex];
  playlistCursor = (activeVideoIndex + 1) % playlist.length;
  video.src = media.url;
  video.loop = false;
  video.setAttribute("aria-label", `Vídeo de ${media.name}`);
  $("#kiosk-player").hidden = false;
  $("#kiosk-attract").hidden = true;
  video.play().then(() => {
    if (playbackActive && activeVideoIndex === videoIndex) {
      $("#kiosk-playback-status").textContent = `Reproduciendo ${videoIndex + 1} de ${playlist.length}: ${media.name}`;
    }
  }, error => {
    handleVideoFailure(videoIndex, error);
  });
}

function nextPlayableIndex(startIndex) {
  for (let offset = 0; offset < playlist.length; offset += 1) {
    const index = (startIndex + offset) % playlist.length;
    if (!failedVideoIndexes.has(index)) return index;
  }
  return -1;
}

function handleVideoFailure(index, error) {
  if (!playbackActive || index !== activeVideoIndex || failedVideoIndexes.has(index)) return;
  console.error("No se pudo reproducir el vídeo de la tablet:", error);
  failedVideoIndexes.add(index);
  const nextIndex = nextPlayableIndex(playlistCursor);
  if (nextIndex >= 0) {
    showVideo(nextIndex);
    return;
  }
  playbackActive = false;
  const video = $("#kiosk-video");
  video.pause();
  video.currentTime = 0;
  $("#kiosk-player").hidden = true;
  $("#kiosk-attract").hidden = false;
  $("#kiosk-playback-status").textContent = "No se pudieron reproducir los vídeos de esta sección.";
}

async function loadPlaylist(station) {
  try {
    playlist = (await listVideos(station.id)).map(video => ({
      name: video.name,
      url: video.url
    }));
    $("#kiosk-library-status").textContent = playlist.length
      ? `${playlist.length} vídeo(s) disponibles en esta sección.`
      : "Esta sección todavía no tiene vídeos subidos.";
    $("#kiosk-prompt").textContent = playlist.length
      ? "Los vídeos se reproducen automáticamente, uno tras otro"
      : "Añade vídeos a esta sección desde Administración";
    playlistCursor = 0;
    activeVideoIndex = -1;
    failedVideoIndexes = new Set();
    return playlist.length > 0;
  } catch (error) {
    console.error("No se pudo consultar la biblioteca de vídeos del PC:", error);
    $("#kiosk-library-status").textContent = "No se pudo conectar con la biblioteca de Supabase.";
    $("#kiosk-prompt").textContent = "Comprueba la conexión con la biblioteca online";
    playlist = [];
    failedVideoIndexes = new Set();
    return false;
  }
}

async function loadFallbackVideo() {
  try {
    fallbackPlaylist = await listVideos(GLOBAL_VIDEO_SECTION_ID);
    return fallbackPlaylist.length > 0;
  } catch (error) {
    console.error("No se pudo consultar el vídeo común:", error);
    fallbackPlaylist = [];
    $("#kiosk-library-status").textContent = "No se pudo cargar el vídeo común.";
    return false;
  }
}

async function startKiosk(stationId) {
  const station = appState.stations.get(stationId);
  if (!station?.enabled) {
    $("#toast").textContent = "Selecciona una sección activa antes de iniciar.";
    return;
  }
  activeStationId = stationId;
  playlist = [];
  playlistCursor = 0;
  activeVideoIndex = -1;
  failedVideoIndexes = new Set();
  playbackActive = false;
  appState.kioskMode = true;
  appState.mode = "public";
  appState.presentationMode = false;
  appState.presentationStationId = stationId;
  appState.returnToWorker = true;
  $("#experience-station").value = stationId;
  $("#worker-view").hidden = true;
  $("#admin-view").hidden = true;
  $("#public-view").hidden = false;
  $("#tablet-kiosk").hidden = false;
  $("#admin-lock").hidden = true;
  $("#presentation-exit").hidden = true;
  $("#kiosk-attract").hidden = false;
  $("#kiosk-player").hidden = true;
  $("#kiosk-category").textContent = station.name;
  $("#kiosk-copy").textContent = station.copy || "Descubre nuestros productos y novedades.";
  $("#kiosk-playback-status").textContent = "Cargando los vídeos de la sección…";
  document.body.classList.add("tablet-mode");
  const hasVideos = await loadPlaylist(station);
  const hasFallbackVideo = hasVideos ? false : await loadFallbackVideo();
  if (!appState.kioskMode || activeStationId !== stationId) return;
  if (!hasVideos && hasFallbackVideo) {
    playlist = fallbackPlaylist.map(video => ({ name: video.name, url: video.url }));
    $("#kiosk-library-status").textContent = "No hay vídeos en esta sección; se reproduce el vídeo común.";
  }
  if (!playlist.length) {
    $("#kiosk-playback-status").textContent = "No hay vídeos para reproducir. Sube vídeos a esta sección desde Administración.";
    $("#kiosk-prompt").textContent = "Añade vídeos a esta sección desde Administración";
    return;
  }
  playbackActive = true;
  $("#kiosk-player").hidden = false;
  $("#kiosk-attract").hidden = true;
  showVideo(0);
}

function stopKiosk() {
  playbackActive = false;
  appState.kioskMode = false;
  const video = $("#kiosk-video");
  video.pause();
  video.removeAttribute("src");
  video.load();
  $("#tablet-kiosk").hidden = true;
  $("#public-view").hidden = true;
  $("#worker-view").hidden = false;
  $("#admin-view").hidden = true;
  $("#admin-lock").hidden = false;
  document.body.classList.remove("tablet-mode");
  appState.mode = "admin";
  appState.presentationMode = false;
  appState.presentationStationId = "";
  activeStationId = "";
  playlist = [];
  fallbackPlaylist = [];
  failedVideoIndexes = new Set();
  $("#worker-start")?.focus();
}

export function initializeKiosk() {
  window.addEventListener("beautytech:kiosk-start-requested", event => {
    void startKiosk(event.detail?.stationId);
  });
  window.addEventListener("beautytech:kiosk-stop-requested", stopKiosk);
  $("#kiosk-video").addEventListener("ended", () => {
    if (!playbackActive || activeVideoIndex < 0) return;
    const nextIndex = nextPlayableIndex(playlistCursor);
    if (nextIndex >= 0) showVideo(nextIndex);
  });
  $("#kiosk-video").addEventListener("error", () => {
    if (!playbackActive || !playlist.length) return;
    handleVideoFailure(activeVideoIndex, new Error("Error de carga o reproducción del vídeo."));
  });
  $("#kiosk-stop").addEventListener("click", stopKiosk);
}
