import { appState } from "./state.js";
import { $, escapeHTML } from "./utils.js";
import { renderDevices } from "./panels.js?v=33";
import { GLOBAL_VIDEO_SECTION_ID, MAX_VIDEO_BYTES } from "./supabase-config.js?v=38";
import {
  deleteVideo,
  hasAdminSession,
  isSupabaseConfigured,
  listVideos,
  signInAdmin,
  signOutAdmin,
  uploadVideo
} from "./supabase.js";

let selectedStationId = "";
let visibleVideos = [];

function currentStation() {
  if (selectedStationId === GLOBAL_VIDEO_SECTION_ID) return null;
  return appState.stations.get(selectedStationId) || [...appState.stations.values()][0] || null;
}

function selectedLabel() {
  return selectedStationId === GLOBAL_VIDEO_SECTION_ID
    ? "el vídeo de espera global"
    : currentStation()?.name || "esta sección";
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderVideoList(videos) {
  const host = $("#media-list");
  if (!videos.length) {
    host.innerHTML = selectedStationId === GLOBAL_VIDEO_SECTION_ID
      ? '<p class="media-empty">Aún no hay vídeo de espera global.</p>'
      : '<p class="media-empty">Aún no hay vídeos en esta sección.</p>';
    return;
  }
  host.innerHTML = videos.map(video => `
    <article class="server-video">
      <div><strong>${escapeHTML(video.name)}</strong><small>${formatSize(video.size)}</small></div>
      <a href="${escapeHTML(video.url)}" target="_blank" rel="noopener noreferrer">Previsualizar</a>
      ${hasAdminSession() ? `<button class="button button-quiet" data-delete-video="${escapeHTML(video.id)}" type="button">Eliminar</button>` : ""}
    </article>`).join("");
}

function setStationVideos(station, videos) {
  station.mediaFiles = videos.map(video => ({
    ...video,
    kind: "video",
    audience: "all"
  }));
  renderDevices();
}

function updateAdminControls() {
  const signedIn = hasAdminSession();
  $("#media-login-form").hidden = signedIn;
  $("#media-logout").hidden = !signedIn;
  const isGlobalVideo = selectedStationId === GLOBAL_VIDEO_SECTION_ID;
  $("#media-upload-files").disabled = !signedIn || (isGlobalVideo && visibleVideos.length > 0);
  $("#media-upload-files").multiple = !isGlobalVideo;
  $("#media-upload").classList.toggle(
    "is-disabled",
    !signedIn || (isGlobalVideo && visibleVideos.length > 0)
  );
  $("#media-upload-title").textContent = isGlobalVideo
    ? "Añadir vídeo de espera para todas las secciones"
    : "Añadir vídeos a esta sección";
  $("#media-upload-copy").textContent = isGlobalVideo
    ? `Se reproduce en bucle mientras no se detecta presencia. Para cambiarlo, elimina el actual y sube otro. MP4, WebM u Ogg · máximo ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))} MB.`
    : `Elige uno o varios archivos. MP4, WebM u Ogg · máximo ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))} MB por vídeo.`;
  renderVideoList(visibleVideos);
}

async function loadSelectedVideos() {
  const station = currentStation();
  const sectionId = selectedStationId;
  if (!station && sectionId !== GLOBAL_VIDEO_SECTION_ID) return false;
  const label = selectedLabel();
  if (!isSupabaseConfigured()) {
    $("#media-list").innerHTML = "";
    $("#media-status").textContent = "Configura la URL y la clave pública de Supabase en js/supabase-config.js para conectar la biblioteca.";
    return false;
  }
  $("#media-status").textContent = `Cargando vídeos de ${label} desde Supabase…`;
  try {
    const videos = await listVideos(sectionId);
    if (sectionId !== selectedStationId) return false;
    visibleVideos = videos;
    if (station) setStationVideos(station, visibleVideos);
    updateAdminControls();
    $("#media-status").textContent = `${visibleVideos.length} vídeo(s) disponibles en Supabase para ${label}.`;
    return true;
  } catch (error) {
    if (sectionId !== selectedStationId) return false;
    visibleVideos = [];
    $("#media-list").innerHTML = "";
    $("#media-status").textContent = `No se pudieron cargar los vídeos de ${label}: ${error.message}`;
    return false;
  }
}

async function handleSignIn(event) {
  event.preventDefault();
  const email = $("#media-admin-email").value.trim();
  const password = $("#media-admin-password").value;
  const button = $("#media-login");
  button.disabled = true;
  $("#media-status").textContent = "Iniciando sesión de administración…";
  try {
    await signInAdmin(email, password);
    $("#media-admin-password").value = "";
    updateAdminControls();
    $("#media-status").textContent = "Sesión iniciada. Ya puedes añadir o eliminar vídeos.";
  } catch (error) {
    $("#media-status").textContent = `No se pudo iniciar sesión: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

async function handleSignOut() {
  const button = $("#media-logout");
  button.disabled = true;
  try {
    await signOutAdmin();
    updateAdminControls();
    $("#media-status").textContent = "Sesión de administración cerrada.";
  } catch (error) {
    updateAdminControls();
    $("#media-status").textContent = `No se pudo cerrar la sesión: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

async function uploadFiles(files) {
  const station = currentStation();
  if ((!station && selectedStationId !== GLOBAL_VIDEO_SECTION_ID) || !files.length) return;
  if (selectedStationId === GLOBAL_VIDEO_SECTION_ID && visibleVideos.length) {
    $("#media-status").textContent = "Elimina el vídeo de espera actual antes de subir otro.";
    return;
  }
  const sectionId = selectedStationId;
  const label = selectedLabel();
  let uploaded = 0;
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    $("#media-status").textContent = `Subiendo ${index + 1}/${files.length}: ${file.name}…`;
    try {
      await uploadVideo(sectionId, file);
      uploaded += 1;
    } catch (error) {
      updateAdminControls();
      $("#media-status").textContent = `No se pudo subir ${file.name}: ${error.message}`;
      return;
    }
  }
  if (!await loadSelectedVideos()) return;
  $("#media-status").textContent = `${uploaded} vídeo(s) guardado(s) en Supabase para ${label}. Ya está disponible para las tablets.`;
}

async function handleDeleteVideo(videoId) {
  const video = visibleVideos.find(item => item.id === videoId);
  if (!video) {
    $("#media-status").textContent = "No se encontró el vídeo seleccionado. Actualiza la lista e inténtalo de nuevo.";
    return;
  }
  if (!window.confirm(`¿Eliminar "${video.name}" de la biblioteca de Supabase?`)) return;
  try {
    const label = selectedLabel();
    await deleteVideo(video);
    if (!await loadSelectedVideos()) return;
    $("#media-status").textContent = `Se eliminó ${video.name} de ${label}.`;
  } catch (error) {
    updateAdminControls();
    $("#media-status").textContent = `No se pudo eliminar el vídeo: ${error.message}`;
  }
}

export function initializeMediaControls() {
  const select = $("#media-station");
  if (!select) return;
  select.innerHTML = [...appState.stations.values()]
    .map(station => `<option value="${escapeHTML(station.id)}">${escapeHTML(station.name)}</option>`)
    .join("") + `<option value="${GLOBAL_VIDEO_SECTION_ID}">Vídeo de espera · todas las secciones</option>`;
  selectedStationId = select.value;
  $("#media-slots").innerHTML = `
    <form id="media-login-form" class="media-admin-login">
      <p>Inicia sesión con la cuenta de administración de Supabase para gestionar la biblioteca.</p>
      <label for="media-admin-email">Correo de administración
        <input id="media-admin-email" type="email" autocomplete="username" required>
      </label>
      <label for="media-admin-password">Contraseña
        <span class="media-password-control">
          <input id="media-admin-password" type="password" autocomplete="current-password" required>
          <button id="media-password-toggle" class="media-password-toggle" type="button" aria-label="Mostrar contraseña" title="Mostrar contraseña" aria-pressed="false">
            <svg class="media-password-eye" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            <svg class="media-password-eye-off" viewBox="0 0 24 24" aria-hidden="true" hidden><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"></path><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a15.7 15.7 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10.7 10.7 0 0 0 4-.8"></path></svg>
          </button>
        </span>
      </label>
      <button id="media-login" class="button button-secondary" type="submit">Iniciar sesión</button>
    </form>
    <button id="media-logout" class="button button-quiet" type="button" hidden>Cerrar sesión</button>
    <label id="media-upload" class="media-upload is-disabled" for="media-upload-files">
      <strong id="media-upload-title">Añadir vídeos a esta sección</strong>
      <span id="media-upload-copy">Elige uno o varios archivos. MP4, WebM u Ogg · máximo ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))} MB por vídeo.</span>
      <input id="media-upload-files" type="file" accept="video/mp4,video/webm,video/ogg,.mp4,.webm,.ogv,.ogg" multiple disabled>
    </label>
    <div id="media-list" class="server-video-list" aria-live="polite"></div>`;
  updateAdminControls();
  $("#media-login-form").addEventListener("submit", event => void handleSignIn(event));
  $("#media-password-toggle").addEventListener("click", event => {
    const button = event.currentTarget;
    const password = $("#media-admin-password");
    const visible = password.type === "password";
    password.type = visible ? "text" : "password";
    button.setAttribute("aria-label", visible ? "Ocultar contraseña" : "Mostrar contraseña");
    button.setAttribute("title", visible ? "Ocultar contraseña" : "Mostrar contraseña");
    button.setAttribute("aria-pressed", String(visible));
    button.querySelector(".media-password-eye").hidden = visible;
    button.querySelector(".media-password-eye-off").hidden = !visible;
  });
  $("#media-logout").addEventListener("click", () => void handleSignOut());
  select.addEventListener("change", () => {
    selectedStationId = select.value;
    visibleVideos = [];
    updateAdminControls();
    void loadSelectedVideos();
  });
  $("#media-upload-files").addEventListener("change", event => {
    const files = [...event.target.files];
    event.target.value = "";
    void uploadFiles(files);
  });
  $("#media-list").addEventListener("click", event => {
    const button = event.target.closest("[data-delete-video]");
    if (button) void handleDeleteVideo(button.dataset.deleteVideo);
  });
  void loadSelectedVideos();
}
