import test from "node:test";
import assert from "node:assert/strict";
import { createRemoteStation } from "../js/configuration.js";

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
