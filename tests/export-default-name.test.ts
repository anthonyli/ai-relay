import { describe, expect, it } from "vitest";
import { defaultBackupName } from "../src/commands/export.js";

describe("export default backup name", () => {
  it("includes a timestamp and unique suffix to avoid name conflicts", () => {
    const first = defaultBackupName(new Date("2026-07-08T08:17:23.456Z"));
    const second = defaultBackupName(new Date("2026-07-08T08:17:23.456Z"));

    expect(first).toMatch(/^backup_20260708T081723_456_[a-f0-9]{8}\.zip$/);
    expect(second).toMatch(/^backup_20260708T081723_456_[a-f0-9]{8}\.zip$/);
    expect(first).not.toBe(second);
  });
});
