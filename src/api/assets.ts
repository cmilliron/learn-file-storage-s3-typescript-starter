import { existsSync, mkdirSync } from "fs";
import path from "node:path";

import type { ApiConfig } from "../config";

export function ensureAssetsDir(cfg: ApiConfig) {
  if (!existsSync(cfg.assetsRoot)) {
    mkdirSync(cfg.assetsRoot, { recursive: true });
  }
}

export function getThumbnailUrl(cfg: ApiConfig, filename: string) {
  return `http://localhost:${cfg.port}/assets/${filename}`;
}

export function createDataLink(mediaType: string, thumbnailData: string) {
  return `data:${mediaType};base64,${thumbnailData}`;
}

export function getExtFromMediaType(mediaType: string) {
  const parts = mediaType.split("/");
  if (parts.length !== 2) {
    return ".bin";
  }
  return parts[1];
}

export function getAssetPath(cfg: ApiConfig, filename: string) {
  return path.join(cfg.assetsRoot, filename);
}
