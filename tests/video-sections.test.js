import test from "node:test";
import assert from "node:assert/strict";
import { createRemoteStation } from "../js/configuration.js";
import { deleteVideoSection, signInAdmin, signOutAdmin } from "../js/supabase.js";

test("remote sections get tablet-ready defaults for every content range", () => {
  const station = createRemoteStation({ id: "section-tratamientos-1234", name: "Tratamientos" });

  assert.equal(station.id, "section-tratamientos-1234");
  assert.equal(station.name, "Tratamientos");
  assert.equal(station.remoteSection, true);
  assert.equal(station.enabled, true);
  assert.deepEqual(Object.keys(station.ageContent), ["18-29", "30-44", "45-59", "60+", "all"]);
  assert.equal(station.ageContent.all.headline, "Descubre Tratamientos");
  assert.deepEqual(station.tags, []);
});

test("remote section data rejects unsafe identifiers and invalid names", () => {
  assert.throws(() => createRemoteStation({ id: "section/nueva", name: "Nueva" }));
  assert.throws(() => createRemoteStation({ id: "section-nueva", name: " ".repeat(49) }));
});

test("only newly added sections can be marked for deletion", () => {
  const added = createRemoteStation({ id: "section-navidad-1234", name: "Navidad" });
  const builtIn = { ...added, id: "apparatology", remoteSection: false };
  const waitVideo = { ...added, id: "global", remoteSection: false };

  assert.equal(added.remoteSection, true);
  assert.equal(builtIn.remoteSection, false);
  assert.equal(waitVideo.remoteSection, false);
});

test("deleting an added section removes its videos and never targets built-in sections", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ path: url.pathname, method: init.method || "GET", body: init.body });
    if (url.pathname === "/auth/v1/token") {
      return Response.json({ access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600 });
    }
    if (url.pathname === "/rest/v1/videos") {
      return Response.json([
        { storage_path: "section-navidad/video-1.mp4" },
        { storage_path: "section-navidad/video-2.webm" }
      ]);
    }
    if (url.pathname === "/storage/v1/object/beauty-videos") return Response.json({});
    if (url.pathname === "/rest/v1/video_sections") return Response.json([{ id: "section-navidad" }]);
    if (url.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
    throw new Error(`Unexpected request: ${url.pathname}`);
  };

  try {
    await assert.rejects(deleteVideoSection("global"), /Solo se pueden eliminar/);
    await assert.rejects(deleteVideoSection("apparatology"), /Solo se pueden eliminar/);
    assert.equal(calls.length, 0);

    await signInAdmin("admin@example.com", "test-password");
    const result = await deleteVideoSection("section-navidad");
    assert.equal(result.videoCount, 2);
    assert.deepEqual(calls.map(call => call.path), [
      "/auth/v1/token",
      "/rest/v1/videos",
      "/storage/v1/object/beauty-videos",
      "/rest/v1/video_sections"
    ]);
    assert.deepEqual(JSON.parse(calls[2].body).prefixes, [
      "section-navidad/video-1.mp4",
      "section-navidad/video-2.webm"
    ]);
  } finally {
    await signOutAdmin();
    globalThis.fetch = originalFetch;
  }
});
