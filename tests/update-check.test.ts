import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";
import { checkForUpdate, isNewerStableVersion } from "../src/update-check.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => fs.remove(dir)));
});

async function temporaryHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-update-check-"));
  temporaryDirectories.push(dir);
  return dir;
}

describe("stable semantic version comparison", () => {
  it("accepts only newer stable versions", () => {
    expect(isNewerStableVersion("0.1.1", "0.2.0")).toBe(true);
    expect(isNewerStableVersion("1.9.9", "2.0.0")).toBe(true);
    expect(isNewerStableVersion("1.2.3", "1.2.3")).toBe(false);
    expect(isNewerStableVersion("2.0.0", "1.9.9")).toBe(false);
    expect(isNewerStableVersion("1.0.0", "1.1.0-beta.1")).toBe(false);
    expect(isNewerStableVersion("not-a-version", "1.1.0")).toBe(false);
  });
});

describe("npm update check", () => {
  it("returns update information and caches the latest registry version", async () => {
    const homeDir = await temporaryHome();
    let requests = 0;

    const result = await checkForUpdate({
      homeDir,
      currentVersion: "0.1.1",
      packageName: "ai-relay-cli",
      isTTY: true,
      argv: ["node", "airelay", "doctor"],
      env: {},
      now: new Date("2026-07-10T00:00:00.000Z"),
      fetchImpl: async (input) => {
        requests += 1;
        expect(String(input)).toBe("https://registry.npmjs.org/ai-relay-cli/latest");
        return new Response(JSON.stringify({ version: "0.2.0" }), { status: 200 });
      }
    });

    expect(requests).toBe(1);
    expect(result).toEqual({
      currentVersion: "0.1.1",
      latestVersion: "0.2.0",
      installCommand: "npm install -g ai-relay-cli@latest",
      changelogUrl: "https://github.com/anthonyli/ai-relay/blob/main/CHANGELOG.md"
    });
    expect(await fs.readJson(path.join(homeDir, ".airelay", "update-check.json"))).toMatchObject({
      checkedAt: "2026-07-10T00:00:00.000Z",
      latestVersion: "0.2.0"
    });
  });

  it("uses a fresh cache without contacting the registry", async () => {
    const homeDir = await temporaryHome();
    await fs.ensureDir(path.join(homeDir, ".airelay"));
    await fs.writeJson(path.join(homeDir, ".airelay", "update-check.json"), {
      checkedAt: "2026-07-10T00:00:00.000Z",
      latestVersion: "0.2.0"
    });

    const result = await checkForUpdate({
      homeDir,
      currentVersion: "0.1.1",
      isTTY: true,
      argv: ["node", "airelay", "doctor"],
      env: {},
      now: new Date("2026-07-10T01:00:00.000Z"),
      fetchImpl: async () => {
        throw new Error("registry should not be called");
      }
    });

    expect(result?.latestVersion).toBe("0.2.0");
  });

  it("recovers from a corrupt cache by querying the configured registry", async () => {
    const homeDir = await temporaryHome();
    const cacheFile = path.join(homeDir, ".airelay", "update-check.json");
    await fs.ensureDir(path.dirname(cacheFile));
    await fs.writeFile(cacheFile, "not json");

    const result = await checkForUpdate({
      homeDir,
      currentVersion: "0.1.1",
      isTTY: true,
      argv: ["node", "airelay", "doctor"],
      env: { npm_config_registry: "https://registry.example.test/custom/" },
      fetchImpl: async (input) => {
        expect(String(input)).toBe("https://registry.example.test/custom/ai-relay-cli/latest");
        return new Response(JSON.stringify({ version: "0.1.2" }), { status: 200 });
      }
    });

    expect(result?.latestVersion).toBe("0.1.2");
  });

  it("silently skips registry failures, invalid responses, and current versions", async () => {
    const homeDir = await temporaryHome();
    const common = {
      homeDir,
      currentVersion: "0.1.1",
      isTTY: true,
      argv: ["node", "airelay", "doctor"],
      env: {},
      cacheTtlMs: 0
    };

    await expect(checkForUpdate({ ...common, fetchImpl: async () => { throw new Error("offline"); } })).resolves.toBeUndefined();
    await expect(checkForUpdate({ ...common, fetchImpl: async () => new Response("bad", { status: 503 }) })).resolves.toBeUndefined();
    await expect(checkForUpdate({
      ...common,
      fetchImpl: async () => new Response(JSON.stringify({ version: "0.1.1" }), { status: 200 })
    })).resolves.toBeUndefined();
    await expect(checkForUpdate({
      ...common,
      fetchImpl: async () => new Response(JSON.stringify({ version: "0.2.0-beta.1" }), { status: 200 })
    })).resolves.toBeUndefined();
  });

  it.each([
    { name: "non-TTY", isTTY: false, argv: ["node", "airelay", "doctor"], env: {} },
    { name: "JSON output", isTTY: true, argv: ["node", "airelay", "doctor", "--json"], env: {} },
    { name: "CI", isTTY: true, argv: ["node", "airelay", "doctor"], env: { CI: "1" } },
    {
      name: "explicit opt-out",
      isTTY: true,
      argv: ["node", "airelay", "doctor"],
      env: { AIRELAY_NO_UPDATE_CHECK: "1" }
    }
  ])("does not query the registry for $name", async ({ isTTY, argv, env }) => {
    const homeDir = await temporaryHome();
    let called = false;
    const result = await checkForUpdate({
      homeDir,
      currentVersion: "0.1.1",
      isTTY,
      argv,
      env,
      fetchImpl: async () => {
        called = true;
        return new Response(JSON.stringify({ version: "9.9.9" }), { status: 200 });
      }
    });

    expect(result).toBeUndefined();
    expect(called).toBe(false);
  });
});
