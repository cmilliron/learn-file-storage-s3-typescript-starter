import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import {
  createDataLink,
  ensureAssetsDir,
  getAssetPath,
  getExtFromMediaType,
  getThumbnailUrl,
} from "./assets";

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new BadRequestError("Video does not exist");
  }

  if (video.userID != userID) {
    throw new UserForbiddenError("User not authorized");
  }

  const formData = await req.formData();

  const thumbnail: File = formData.get("thumbnail") as File;
  if (!(thumbnail instanceof File)) {
    throw new BadRequestError("Filetype errorr");
  }

  // console.log(thumbnail);
  // console.log(thumbnail.type);

  const MAX_UPLOAD_SIZE = 10 << 20;
  if (thumbnail.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("file size to big");
  }

  const mediaType = thumbnail.type;
  if (!mediaType) {
    throw new BadRequestError("Missing Content-Type for thumbnail");
  }

  // const fileData = await thumbnail.arrayBuffer();
  // if (!fileData) {
  //   throw new Error("Error reading file data");
  // }
  // const buffer = Buffer.from(fileData);
  ensureAssetsDir(cfg);
  const filename = `${videoId}.${getExtFromMediaType(mediaType)}`;
  const destination = getAssetPath(cfg, filename);
  Bun.write(destination, thumbnail);
  // const imageData = buffer.toString("base64");

  // const thumbnailData = createDataLink(mediaType, imageData);

  const thumbnailUrl = getThumbnailUrl(cfg, filename);

  // Update Video in DB
  video.thumbnailURL = thumbnailUrl;
  updateVideo(cfg.db, video);

  return respondWithJSON(200, video);
}
