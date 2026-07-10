import { describe, expect, it } from "vitest";
import { createManifest, parseManifest } from "../src/manifest.js";
import type { ExportedClient } from "../src/types.js";

const codexClient: ExportedClient = {
  type: "codex",
  name: "Codex CLI",
  version: "1.0.0",
  root_dir: "/tmp/.codex",
  session_count: 1,
  exported_session_count: 1,
  export_mode: "sessions",
  privacy_exclusions: ["auth files"]
};

function rawManifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...createManifest([codexClient]), ...overrides });
}

describe("backup manifest validation", () => {
  it("accepts a valid manifest and the historical aisession app name", () => {
    expect(parseManifest(rawManifest()).clients[0]?.type).toBe("codex");
    expect(parseManifest(rawManifest({ app: "aisession" })).app).toBe("aisession");
  });

  it.each([
    ["missing clients", { clients: undefined }],
    ["empty clients", { clients: [] }],
    ["invalid timestamp", { created_at: "not-a-date" }],
    ["invalid config version", { config_version: "3" }],
    ["invalid manifest version", { version: 2 }]
  ])("rejects %s", (_name, overrides) => {
    expect(() => parseManifest(rawManifest(overrides))).toThrow(/Invalid ai-relay backup manifest/);
  });

  it("rejects duplicate client types", () => {
    expect(() => parseManifest(rawManifest({ clients: [codexClient, { ...codexClient }] }))).toThrow(/clients/);
  });

  it.each([
    ["negative count", { ...codexClient, session_count: -1 }],
    ["fractional count", { ...codexClient, exported_session_count: 0.5 }],
    ["unsupported client", { ...codexClient, type: "cursor" }],
    ["invalid export mode", { ...codexClient, export_mode: "everything" }],
    ["invalid exclusions", { ...codexClient, privacy_exclusions: "auth" }]
  ])("rejects a client with %s", (_name, client) => {
    expect(() => parseManifest(rawManifest({ clients: [client] }))).toThrow(/clients/);
  });

  it("does not echo an invalid field value in the error", () => {
    const privateValue = "do-not-echo-this-private-value";
    expect(() => parseManifest(rawManifest({ created_at: privateValue }))).toThrowError(
      expect.not.stringContaining(privateValue)
    );
  });

  it("rejects invalid JSON with a stable error", () => {
    expect(() => parseManifest("{broken")).toThrow(/^Invalid ai-relay backup manifest:/);
  });
});
