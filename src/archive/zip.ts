import fs from "fs-extra";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import archiver from "archiver";
import yauzl from "yauzl";

export interface ZipLimits {
  maxEntries: number;
  maxEntryUncompressedBytes: number;
  maxTotalUncompressedBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 100_000,
  maxEntryUncompressedBytes: 5 * 1024 ** 3,
  maxTotalUncompressedBytes: 20 * 1024 ** 3
};

const DEFAULT_TEXT_LIMIT_BYTES = 1024 * 1024;

export async function createZipFromDirectory(sourceDir: string, outputFile: string): Promise<void> {
  await fs.ensureDir(path.dirname(outputFile));
  const temporaryOutput = path.join(path.dirname(outputFile), `.${path.basename(outputFile)}.${process.pid}.${Date.now()}.tmp`);

  try {
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(temporaryOutput);
      const archive = archiver("zip", { zlib: { level: 9 } });
      let settled = false;

      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      output.on("close", () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      output.on("error", fail);
      archive.on("error", fail);
      archive.on("warning", fail);

      archive.pipe(output);
      archive.directory(sourceDir, false);
      void archive.finalize();
    });
    await fs.move(temporaryOutput, outputFile, { overwrite: true });
  } catch (error) {
    await fs.remove(temporaryOutput);
    throw error;
  }
}

export async function extractZip(
  zipFile: string,
  destinationDir: string,
  options: { limits?: ZipLimits } = {}
): Promise<void> {
  await validateZipArchive(zipFile, options.limits);
  await fs.ensureDir(destinationDir);

  const zip = await openZip(zipFile);
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      zip.close();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
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
          finish(error);
        }
      })();
    });
    zip.on("end", () => finish());
    zip.on("error", finish);
  });
}

export async function readZipText(
  zipFile: string,
  fileName: string,
  maxBytes = DEFAULT_TEXT_LIMIT_BYTES
): Promise<string> {
  await validateZipArchive(zipFile);
  const zip = await openZip(zipFile);
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, value?: string) => {
      if (settled) {
        return;
      }
      settled = true;
      zip.close();
      if (error) {
        reject(error);
      } else {
        resolve(value ?? "");
      }
    };

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
          let totalBytes = 0;
          for await (const chunk of stream as NodeJS.ReadableStream & AsyncIterable<Buffer | string>) {
            const buffer = Buffer.from(chunk);
            totalBytes += buffer.length;
            if (totalBytes > maxBytes) {
              throw new Error(`${fileName} is too large to read safely.`);
            }
            chunks.push(buffer);
          }
          finish(undefined, Buffer.concat(chunks).toString("utf8"));
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    });
    zip.on("end", () => finish(new Error(`${fileName} not found in backup.`)));
    zip.on("error", finish);
  });
}

export async function validateZipArchive(
  zipFile: string,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS
): Promise<void> {
  validateLimits(limits);
  const zip = await openZip(zipFile);
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let entryCount = 0;
    let totalUncompressedBytes = 0;
    const finish = (error?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      zip.close();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    zip.readEntry();
    zip.on("entry", (entry) => {
      try {
        entryCount += 1;
        if (entryCount > limits.maxEntries) {
          throw new Error(`Backup zip entry count exceeds the limit of ${limits.maxEntries}.`);
        }
        if (!isSafeZipEntryName(entry.fileName)) {
          throw new Error(`Unsafe zip entry path: ${entry.fileName}`);
        }
        if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0) {
          throw new Error(`Backup zip entry has an invalid uncompressed size: ${entry.fileName}`);
        }
        if (entry.uncompressedSize > limits.maxEntryUncompressedBytes) {
          throw new Error(`Backup zip single entry exceeds the uncompressed size limit: ${entry.fileName}`);
        }
        totalUncompressedBytes += entry.uncompressedSize;
        if (!Number.isSafeInteger(totalUncompressedBytes) || totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
          throw new Error("Backup zip total uncompressed size exceeds the configured limit.");
        }
        zip.readEntry();
      } catch (error) {
        finish(error);
      }
    });
    zip.on("end", () => finish());
    zip.on("error", finish);
  });
}

export function isSafeZipEntryName(entryName: string): boolean {
  if (!entryName || entryName.includes("\0")) {
    return false;
  }
  const normalized = entryName.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    return false;
  }
  return !normalized.split("/").includes("..");
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
  if (!isSafeZipEntryName(entryName)) {
    throw new Error(`Unsafe zip entry path: ${entryName}`);
  }
  const targetPath = path.resolve(root, entryName);
  const normalizedRoot = path.resolve(root);
  if (!targetPath.startsWith(normalizedRoot + path.sep) && targetPath !== normalizedRoot) {
    throw new Error(`Unsafe zip entry path: ${entryName}`);
  }
  return targetPath;
}

function validateLimits(limits: ZipLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Invalid zip limit ${name}.`);
    }
  }
}
