import { respondWithJSON } from "./json";
import { getBearerToken, validateJWT } from "../auth";
import { BadRequestError, UserForbiddenError } from "./errors";
import { getVideo, updateVideo, type Video } from "../db/videos";
import { type ApiConfig } from "../config";
import type { BunRequest, S3File } from "bun";
import {
  createHexFileName,
  createS3Link,
  ensureAssetsDir,
  getAssetPath,
  getExtFromMediaType,
  getVideoAspectRatio,
} from "./assets";

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const MAX_UPLOAD_SIZE = 1 << 30;

  // Get video ID from parameters
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  // Parse JWT Token for user ID
  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  // Validate Video User against token
  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new BadRequestError("Video does not exist");
  }
  if (video.userID != userID) {
    throw new UserForbiddenError("User not authorized");
  }

  // Parse video
  const formData = await req.formData();
  const videoFile = formData.get("video") as File;
  if (!(videoFile instanceof File)) {
    throw new BadRequestError("Video file missing");
  }
  // Validate size
  if (videoFile.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("file size to big");
  }

  // Validate file type
  const mediaType = videoFile.type;
  if (mediaType !== "video/mp4") {
    throw new BadRequestError("not a valid video type");
  }

  // Temporarily save file
  ensureAssetsDir(cfg);
  const filename = `${createHexFileName()}.${getExtFromMediaType(mediaType)}`;
  let destination = getAssetPath(cfg, filename);
  await Bun.write(destination, videoFile);

  // upload to S3 Bucket
  const fastFile = await processVideoForFastStart(destination);
  await Bun.file(destination).delete();
  const tmpFile = Bun.file(fastFile);
  const aspectRatio = await getVideoAspectRatio(fastFile);
  const key = `${aspectRatio}/${filename}`;
  const s3File: S3File = cfg.s3Client.file(key);
  await s3File.write(tmpFile, {
    type: mediaType, // Ensures the browser plays it instead of downloading it
  });

  // Update video url in db
  // const videoUrl = createS3Link(cfg, key);
  const videoUrl = `${key}`;
  video.videoURL = videoUrl;
  updateVideo(cfg.db, video);

  //Delete file
  await tmpFile.delete();

  const presignedVideo = dbVideoToSignedVideo(cfg, video);
  return respondWithJSON(200, presignedVideo);
}

async function processVideoForFastStart(inputFilePath: string) {
  const outputFilePath = inputFilePath.split(".mp4")[0] + ".processed.mp4";
  const process = Bun.spawn(
    [
      "ffmpeg",
      "-i",
      inputFilePath,
      "-movflags",
      "faststart",
      "-map_metadata",
      "0",
      "-codec",
      "copy",
      "-f",
      "mp4",
      outputFilePath,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const stdOut = process.stdout;
  const stdErr = process.stderr;

  const exitCode = await process.exited;

  if (exitCode !== 0) {
    throw new Error(`ffprobe error: ${stdErr}`);
  }

  return outputFilePath;
}

async function generatePresignedURL(
  cfg: ApiConfig,
  key: string,
  expireTime: number,
) {
  const presignedUrl = cfg.s3Client.presign(`${key}`, {
    expiresIn: expireTime,
  });
  // console.log(presignedUrl);
  return presignedUrl;
}

export async function dbVideoToSignedVideo(cfg: ApiConfig, video: Video) {
  if (!video.videoURL) {
    return video;
  }
  const presignedUrl = await generatePresignedURL(
    cfg,
    video.videoURL as string,
    5 * 60,
  );
  video.videoURL = presignedUrl;
  return video;
}
