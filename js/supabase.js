import {
  MAX_VIDEO_BYTES,
  SUPABASE_ANON_KEY,
  SUPABASE_BUCKET,
  SUPABASE_URL
} from "./supabase-config.js?v=38";

const MIME_TYPES = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".ogg": "video/ogg"
};
let adminSession = null;

function hasPublicApiKey() {
  if (SUPABASE_ANON_KEY.startsWith("sb_publishable_")) return true;
  if (SUPABASE_ANON_KEY.startsWith("sb_secret_")) return false;
  try {
    const encodedPayload = SUPABASE_ANON_KEY.split(".")[1];
    const base64Payload = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64Payload.padEnd(Math.ceil(base64Payload.length / 4) * 4, "=")));
    return payload.role === "anon";
  } catch {
    return false;
  }
}

function configuredUrl() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Falta configurar la URL y la clave pública de Supabase en js/supabase-config.js.");
  }
  if (!hasPublicApiKey()) {
    throw new Error("Usa únicamente la clave anon o publishable del proyecto; nunca una clave secret o service_role.");
  }
  try {
    const url = new URL(SUPABASE_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error();
    }
    return url.origin;
  } catch {
    throw new Error("La URL de Supabase no es válida. Usa la URL HTTPS del proyecto.");
  }
}

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

async function request(path, { method = "GET", token = "", body, headers = {} } = {}) {
  const url = configuredUrl();
  const authorizationToken = token || (SUPABASE_ANON_KEY.startsWith("eyJ") ? SUPABASE_ANON_KEY : "");
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      ...(authorizationToken ? { Authorization: `Bearer ${authorizationToken}` } : {}),
      ...headers
    },
    ...(body === undefined ? {} : { body: body instanceof Blob ? body : JSON.stringify(body) })
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const message = payload?.msg || payload?.message || payload?.error_description
      || payload?.error || payload?.details || `Error de Supabase (${response.status}).`;
    throw new Error(message);
  }
  return payload;
}

async function activeSession() {
  if (!adminSession) throw new Error("Inicia sesión con la cuenta de administración para continuar.");
  if (adminSession.expiresAt - Date.now() > 60_000) return adminSession;

  try {
    const refreshed = await request("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: adminSession.refreshToken },
      headers: { "Content-Type": "application/json" }
    });
    adminSession = {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      expiresAt: Date.now() + refreshed.expires_in * 1000
    };
    return adminSession;
  } catch (error) {
    adminSession = null;
    throw error;
  }
}

function storageObjectPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function publicVideoUrl(path) {
  return `${configuredUrl()}/storage/v1/object/public/${encodeURIComponent(SUPABASE_BUCKET)}/${storageObjectPath(path)}`;
}

export async function signInAdmin(email, password) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
    headers: { "Content-Type": "application/json" }
  });
  adminSession = {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresAt: Date.now() + result.expires_in * 1000
  };
}

export async function signOutAdmin() {
  try {
    if (adminSession) {
      const session = await activeSession();
      await request("/auth/v1/logout", { method: "POST", token: session.accessToken });
    }
  } finally {
    adminSession = null;
  }
}

export function hasAdminSession() {
  return Boolean(adminSession);
}

export async function listVideoSections() {
  const params = new URLSearchParams({
    select: "id,name",
    order: "name.asc"
  });
  return request(`/rest/v1/video_sections?${params}`);
}

export async function createVideoSection(section) {
  const session = await activeSession();
  const rows = await request("/rest/v1/video_sections", {
    method: "POST",
    token: session.accessToken,
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: section
  });
  return rows[0];
}

export async function deleteVideoSection(sectionId) {
  if (!/^section-[a-z0-9-]+$/.test(sectionId)) {
    throw new Error("Solo se pueden eliminar las secciones añadidas, no las secciones iniciales ni el vídeo de espera global.");
  }
  const session = await activeSession();
  const pageSize = 500;
  const storagePaths = [];
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({
      select: "storage_path",
      section_id: `eq.${sectionId}`,
      order: "id.asc"
    });
    const videos = await request(`/rest/v1/videos?${params}`, {
      headers: { Range: `${offset}-${offset + pageSize - 1}` }
    });
    storagePaths.push(...videos.map(video => video.storage_path));
    if (videos.length < pageSize) break;
  }

  const storageBatchSize = 100;
  for (let offset = 0; offset < storagePaths.length; offset += storageBatchSize) {
    await request(`/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}`, {
      method: "DELETE",
      token: session.accessToken,
      headers: { "Content-Type": "application/json" },
      body: { prefixes: storagePaths.slice(offset, offset + storageBatchSize) }
    });
  }

  const sectionParams = new URLSearchParams({ id: `eq.${sectionId}` });
  const deleted = await request(`/rest/v1/video_sections?${sectionParams}`, {
    method: "DELETE",
    token: session.accessToken,
    headers: { Prefer: "return=representation" }
  });
  if (!deleted?.length) {
    throw new Error("Supabase no eliminó la sección. Comprueba los permisos y que ejecutaste el SQL actualizado.");
  }
  return { videoCount: storagePaths.length };
}

export async function listVideos(sectionId) {
  const params = new URLSearchParams({
    select: "id,section_id,name,storage_path,mime_type,size_bytes,created_at",
    section_id: `eq.${sectionId}`,
    order: "created_at.asc"
  });
  const rows = await request(`/rest/v1/videos?${params}`);
  return rows.map(video => ({
    ...video,
    size: video.size_bytes,
    url: publicVideoUrl(video.storage_path)
  }));
}

export async function uploadVideo(sectionId, file) {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  const mimeType = MIME_TYPES[extension];
  if (!mimeType) throw new Error("Formato no admitido. Usa MP4, WebM u Ogg.");
  if (!file.size || file.size > MAX_VIDEO_BYTES) {
    throw new Error("El vídeo debe pesar entre 1 byte y 50 MB.");
  }

  const session = await activeSession();
  const safeName = file.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 160) || `video${extension}`;
  const storagePath = `${sectionId}/${crypto.randomUUID()}${extension}`;
  await request(`/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${storageObjectPath(storagePath)}`, {
    method: "POST",
    token: session.accessToken,
    headers: {
      "Content-Type": mimeType,
      "x-upsert": "false"
    },
    body: file
  });

  try {
    const rows = await request("/rest/v1/videos", {
      method: "POST",
      token: session.accessToken,
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: {
        section_id: sectionId,
        name: safeName,
        storage_path: storagePath,
        mime_type: mimeType,
        size_bytes: file.size
      }
    });
    return rows[0];
  } catch (error) {
    try {
      await request(`/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}`, {
        method: "DELETE",
        token: session.accessToken,
        headers: { "Content-Type": "application/json" },
        body: { prefixes: [storagePath] }
      });
    } catch (cleanupError) {
      throw new Error(`${error.message} Además, no se pudo limpiar el archivo subido: ${cleanupError.message}`);
    }
    throw error;
  }
}

export async function deleteVideo(video) {
  const session = await activeSession();
  await request(`/rest/v1/videos?id=eq.${encodeURIComponent(video.id)}`, {
    method: "DELETE",
    token: session.accessToken
  });
  await request(`/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}`, {
    method: "DELETE",
    token: session.accessToken,
    headers: { "Content-Type": "application/json" },
    body: { prefixes: [video.storage_path] }
  });
}
