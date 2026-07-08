import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const homeDir = path.resolve(process.env.AIRELAY_HOME || os.homedir());
const configDir = path.join(homeDir, ".airelay");
const configFile = path.join(configDir, "config.yml");

fs.mkdirSync(configDir, { recursive: true });

if (!fs.existsSync(configFile)) {
  fs.writeFileSync(
    configFile,
    ['version: "1.1"', "storage:", "  type: local", "cloud_sync:", "  enabled: false", ""].join("\n"),
    { mode: 0o600 }
  );
}
