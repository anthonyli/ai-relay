import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { createManifest } from "../src/manifest.js";
import { APP_NAME, APP_VERSION } from "../src/version.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { name: string; version: string };

describe("package version", () => {
  it("drives runtime and manifest versions from package.json", () => {
    expect(APP_NAME).toBe(packageJson.name);
    expect(APP_VERSION).toBe(packageJson.version);
    expect(createManifest([]).app_version).toBe(packageJson.version);
  });
});
