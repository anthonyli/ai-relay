import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { AppConfig } from "../config.js";
import type { RemoteStorage, StorageFileRequest } from "./index.js";

export function createS3Storage(config: AppConfig): RemoteStorage {
  const client = new S3Client({
    region: config.storage.region ?? "us-east-1",
    endpoint: config.storage.endpoint,
    forcePathStyle: config.storage.force_path_style ?? true,
    credentials:
      config.storage.access_key_id && config.storage.secret_access_key
        ? {
            accessKeyId: config.storage.access_key_id,
            secretAccessKey: config.storage.secret_access_key,
            sessionToken: config.storage.session_token
          }
        : undefined
  });

  return {
    async uploadFile(request: StorageFileRequest): Promise<void> {
      await client.send(
        new PutObjectCommand({
          Bucket: request.bucket,
          Key: request.key,
          Body: fs.createReadStream(request.filePath)
        })
      );
    },

    async downloadFile(request: StorageFileRequest): Promise<void> {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: request.bucket,
          Key: request.key
        })
      );

      if (!response.Body) {
        throw new Error(`S3 object ${request.bucket}/${request.key} returned an empty body.`);
      }

      await pipeline(response.Body as NodeJS.ReadableStream, fs.createWriteStream(request.filePath));
    }
  };
}
