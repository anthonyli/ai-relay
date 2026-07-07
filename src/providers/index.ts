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
    fullExcludeRoots: [".tmp", "tmp", "cache", "logs", "plugins"]
  }),
  new FileProvider({
    id: "codex",
    name: "Codex CLI",
    rootName: ".codex",
    versionCommand: "codex",
    versionArgs: ["--version"],
    sessionRoots: ["sessions", "history"],
    fullExcludeRoots: [".tmp", "tmp", "cache", "logs", "plugins"]
  })
];
