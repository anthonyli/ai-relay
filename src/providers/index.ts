import { FileProvider } from "./provider.js";
import type { Provider } from "./provider.js";

export const providers: Provider[] = [
  new FileProvider({
    id: "claude",
    name: "Claude Code",
    rootName: ".claude",
    versionCommand: "claude",
    versionArgs: ["--version"],
    sessionRoots: ["projects", "sessions", "conversations"],
    configFiles: ["settings.json", "settings.local.json"]
  }),
  new FileProvider({
    id: "codex",
    name: "Codex CLI",
    rootName: ".codex",
    versionCommand: "codex",
    versionArgs: ["--version"],
    sessionRoots: ["sessions"],
    configFiles: ["config.toml"]
  })
];

