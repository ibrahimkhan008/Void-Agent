import "server-only";
import { IS_DEV } from "lib/const";
import logger from "logger";
import type { FileStorage } from "./file-storage.interface";
import { createLocalFileStorage } from "./local-file-storage";
import { createS3FileStorage } from "./s3-file-storage";
import { createVercelBlobStorage } from "./vercel-blob-storage";

import { storageDriver } from "./storage-driver";
export type { FileStorageDriver } from "./storage-driver";

declare global {
  // eslint-disable-next-line no-var
  var __server__file_storage__: FileStorage | undefined;
}

const createFileStorage = (): FileStorage => {
  logger.info(`Creating file storage: ${storageDriver}`);
  switch (storageDriver) {
    case "vercel-blob":
      return createVercelBlobStorage();
    case "s3":
      return createS3FileStorage();
    case "local":
      return createLocalFileStorage();
    default: {
      const exhaustiveCheck: never = storageDriver;
      throw new Error(`Unsupported file storage driver: ${exhaustiveCheck}`);
    }
  }
};

const serverFileStorage =
  globalThis.__server__file_storage__ || createFileStorage();

if (IS_DEV) {
  globalThis.__server__file_storage__ = serverFileStorage;
}

export { serverFileStorage, storageDriver };
