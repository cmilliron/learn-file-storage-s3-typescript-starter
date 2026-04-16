import { respondWithJSON } from "./json";
import { getBearerToken, validateJWT } from "../auth";
import { BadRequestError, UserForbiddenError } from "./errors";
import { getVideo, updateVideo } from "../db/videos";
import { type ApiConfig } from "../config";
import type { BunRequest, S3File } from "bun";
import {
  createHexFileName,
  createS3Link,
  ensureAssetsDir,
  getAssetPath,
  getExtFromMediaType,
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
  const destination = getAssetPath(cfg, filename);
  await Bun.write(destination, videoFile);

  // upload to S3 Bucket
  const tmpFile = Bun.file(destination);
  const s3File: S3File = cfg.s3Client.file(filename);
  await s3File.write(tmpFile, {
    type: mediaType, // Ensures the browser plays it instead of downloading it
  });

  // Update video url in db
  const videoUrl = createS3Link(cfg, filename);
  video.videoURL = videoUrl;
  updateVideo(cfg.db, video);

  //Delete file
  await tmpFile.delete();

  return respondWithJSON(200, null);
}
