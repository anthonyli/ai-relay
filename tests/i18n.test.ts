import { describe, expect, it } from "vitest";
import { detectLanguage, t } from "../src/i18n.js";

describe("i18n", () => {
  it("detects Chinese from POSIX locale environment variables", () => {
    expect(detectLanguage({ LANG: "zh_CN.UTF-8" })).toBe("zh");
    expect(detectLanguage({ LC_MESSAGES: "zh_TW.UTF-8", LANG: "en_US.UTF-8" })).toBe("zh");
  });

  it("falls back to Chinese when no locale can be detected", () => {
    expect(detectLanguage({ LANG: "en_US.UTF-8" })).toBe("en");
    expect(detectLanguage({}, [])).toBe("zh");
  });

  it("uses macOS AppleLanguages when shell locale is neutral", () => {
    expect(detectLanguage({ LANG: "C.UTF-8", LC_ALL: "C.UTF-8" }, ["zh-Hans-CN", "en-US"])).toBe("zh");
  });

  it("renders translated messages with variables", () => {
    expect(t("import.confirm", { language: "zh", overwrite: "false" })).toBe("确认开始导入？现有文件默认保留。");
    expect(t("export.created", { language: "en", output: "/tmp/backup.zip" })).toBe("Backup created: /tmp/backup.zip");
  });
});
