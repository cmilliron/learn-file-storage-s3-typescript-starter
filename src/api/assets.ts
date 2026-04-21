import { existsSync, mkdirSync } from "fs";
import path, { parse } from "node:path";
import { randomBytes } from "node:crypto";

import type { ApiConfig } from "../config";

export function ensureAssetsDir(cfg: ApiConfig) {
  if (!existsSync(cfg.assetsRoot)) {
    mkdirSync(cfg.assetsRoot, { recursive: true });
  }
}

export function ensureTmpDir() {
  if (!existsSync("./tmp")) {
    mkdirSync("./tmp", { recursive: true });
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

export function createHexFileName() {
  return randomBytes(32).toString("base64url");
}

export function createS3Link(cfg: ApiConfig, fileKey: string) {
  return `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${fileKey}`;
}

export async function getVideoAspectRatio(filepath: string) {
  const proc = Bun.spawn(
    [
      "ffprobe",
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      filepath,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const stdoutText = await new Response(proc.stdout).json();
  const stderrText = await new Response(proc.stderr).text();

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`ffprobe error: ${stderrText}`);
  }

  if (!stdoutText.streams || stdoutText.streams.length === 0) {
    throw new Error("No video streams found");
  }

  console.log(stdoutText);
  console.log(stderrText);

  // if (!stderrText) {
  //   throw new Error("meta data error");
  // }
  const height = stdoutText["streams"][0].height as string;
  const width = stdoutText["streams"][0].width as string;
  console.log(`${height}:${width}`);

  if (parseInt(height) > parseInt(width)) {
    console.log("portrait");
    return "portrait";
  } else if (parseInt(height) < parseInt(width)) {
    console.log("landscape");
    return "landscape";
  } else {
    console.log("other");
    return "other";
  }
}
