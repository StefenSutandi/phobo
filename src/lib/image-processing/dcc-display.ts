import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { applyChromaKeyIfEnabled, type ChromaKeyOptions } from "./chroma-key";
import { getPhoboEnv } from "../config/phobo-env";

export type GenerateDccDisplayOptions = {
  rawFilePath: string;         // Absolute disk path to captured Canon JPEG
  displayFilePath: string;     // Absolute disk path for output transparent PNG
  background?: { color?: string; imageUrl?: string };
  greenScreenTuning?: ChromaKeyOptions;
};

export type GenerateDccDisplayResult = {
  ok: boolean;
  displayFilePath: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  rawSize: number;
  displaySize: number;
  error?: string;
};

/**
 * Canonical DSLR Display Image Generator.
 * 
 * Takes an absolute filesystem path to a raw Canon DSLR JPEG, reads it directly via fs.readFile,
 * executes Sharp-based chroma keying to produce a transparent PNG subject, writes the PNG to disk,
 * and validates the output file and alpha channel.
 * 
 * NEVER passes absolute filesystem paths to loadImage().
 */
export async function generateDccDisplayImage({
  rawFilePath,
  displayFilePath,
  background,
  greenScreenTuning = {},
}: GenerateDccDisplayOptions): Promise<GenerateDccDisplayResult> {
  const env = getPhoboEnv();

  // 1. Read raw JPEG buffer directly from filesystem
  const rawBuffer = await fs.readFile(rawFilePath);
  const rawMetadata = await sharp(rawBuffer).metadata();
  const width = rawMetadata.width || 0;
  const height = rawMetadata.height || 0;

  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid raw JPEG dimensions: ${width}x${height}`);
  }

  // 2. Process chroma keying on rawBuffer to extract transparent subject
  const transparentBuffer = await applyChromaKeyIfEnabled(
    rawBuffer,
    { color: background?.color || "#f7f3ee", imageUrl: background?.imageUrl },
    greenScreenTuning
  );

  // 3. Ensure destination directory exists and write transparent PNG
  await fs.mkdir(path.dirname(displayFilePath), { recursive: true });
  await fs.writeFile(displayFilePath, transparentBuffer);

  // 4. Verify output file exists and has alpha channel
  const displayMetadata = await sharp(transparentBuffer).metadata();
  const displayStats = await fs.stat(displayFilePath);

  const hasAlpha = Boolean(displayMetadata.hasAlpha && displayMetadata.channels === 4);

  if (env.debugLogs || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
    console.log(
      `[DCC Display Gen] Success | raw: ${rawFilePath} (${rawBuffer.length} bytes, ${width}x${height}) -> display: ${displayFilePath} (${displayStats.size} bytes, channels=${displayMetadata.channels}, hasAlpha=${hasAlpha})`
    );
  }

  return {
    ok: true,
    displayFilePath,
    width,
    height,
    hasAlpha,
    rawSize: rawBuffer.length,
    displaySize: displayStats.size,
  };
}
