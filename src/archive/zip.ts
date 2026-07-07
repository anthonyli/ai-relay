import fs from "fs-extra";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import archiver from "archiver";
import yauzl from "yauzl";

export async function createZipFromDirectory(sourceDir: string, outputFile: string): Promise<void> {
  await fs.ensureDir(path.dirname(outputFile));

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outputFile);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    void archive.finalize();
  });
}

export async function extractZip(zipFile: string, destinationDir: string): Promise<void> {
  await fs.ensureDir(destinationDir);

  const zip = await openZip(zipFile);
  await new Promise<void>((resolve, reject) => {
    zip.readEntry();
    zip.on("entry", (entry) => {
      void (async () => {
        try {
          const targetPath = safeJoin(destinationDir, entry.fileName);
          if (/\/$/.test(entry.fileName)) {
            await fs.ensureDir(targetPath);
            zip.readEntry();
            return;
          }

          await fs.ensureDir(path.dirname(targetPath));
          const stream = await openReadStream(zip, entry);
          await pipeline(stream, createWriteStream(targetPath));
          zip.readEntry();
        } catch (error) {
          reject(error);
        }
      })();
    });
    zip.on("end", resolve);
    zip.on("error", reject);
  });
}

export async function readZipText(zipFile: string, fileName: string): Promise<string> {
  const zip = await openZip(zipFile);
  return new Promise<string>((resolve, reject) => {
    zip.readEntry();
    zip.on("entry", (entry) => {
      if (entry.fileName !== fileName) {
        zip.readEntry();
        return;
      }

      void (async () => {
        try {
          const stream = await openReadStream(zip, entry);
          const chunks: Buffer[] = [];
          stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
          stream.on("error", reject);
        } catch (error) {
          reject(error);
        }
      })();
    });
    zip.on("end", () => reject(new Error(`${fileName} not found in backup.`)));
    zip.on("error", reject);
  });
}

export async function listZipEntries(zipFile: string): Promise<string[]> {
  const zip = await openZip(zipFile);
  return new Promise<string[]>((resolve, reject) => {
    const entries: string[] = [];
    zip.readEntry();
    zip.on("entry", (entry) => {
      entries.push(entry.fileName);
      zip.readEntry();
    });
    zip.on("end", () => resolve(entries));
    zip.on("error", reject);
  });
}

async function openZip(zipFile: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipFile, { lazyEntries: true }, (error, zip) => {
      if (error) {
        reject(error);
      } else if (!zip) {
        reject(new Error(`Could not open ${zipFile}`));
      } else {
        resolve(zip);
      }
    });
  });
}

async function openReadStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) {
        reject(error);
      } else if (!stream) {
        reject(new Error(`Could not read ${entry.fileName}`));
      } else {
        resolve(stream);
      }
    });
  });
}

function safeJoin(root: string, entryName: string): string {
  const targetPath = path.resolve(root, entryName);
  const normalizedRoot = path.resolve(root);
  if (!targetPath.startsWith(normalizedRoot + path.sep) && targetPath !== normalizedRoot) {
    throw new Error(`Unsafe zip entry path: ${entryName}`);
  }
  return targetPath;
}

