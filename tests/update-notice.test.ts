import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCli } from "../src/cli.js";
import type { UpdateInfo } from "../src/update-check.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((dir) => fs.remove(dir)));
});

describe("CLI update notice", () => {
  it("prints an available update after a successful command", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "airelay-update-notice-"));
    temporaryDirectories.push(home);
    const argv = ["node", "airelay", "--home", home, "doctor"];
    const update: UpdateInfo = {
      currentVersion: "0.1.1",
      latestVersion: "0.2.0",
      installCommand: "npm install -g ai-relay-cli@latest",
      changelogUrl: "https://github.com/anthonyli/ai-relay/blob/main/CHANGELOG.md"
    };
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value) => output.push(String(value)));

    await createCli({
      argv,
      env: { AIRELAY_LANG: "en" },
      stdoutIsTTY: true,
      checkForUpdate: async (options) => {
        expect(options.homeDir).toBe(home);
        expect(options.argv).toBe(argv);
        return update;
      }
    }).parseAsync(argv);

    expect(output.join("\n")).toContain("0.1.1");
    expect(output.join("\n")).toContain("0.2.0");
    expect(output.join("\n")).toContain("npm install -g ai-relay-cli@latest");
    expect(output.join("\n")).toContain("CHANGELOG.md");
  });
});
