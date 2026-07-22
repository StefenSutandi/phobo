"use server";
import fs from "fs/promises";
import path from "path";

export async function getStickers() {
  try {
    const stickersDir = path.join(process.cwd(), "public", "stickers");
    const files = await fs.readdir(stickersDir);
    return files
      .filter(f => f.endsWith(".png") && !f.startsWith("."))
      .map(f => `/stickers/${f}`);
  } catch (e) {
    console.error("Failed to read stickers:", e);
    return [];
  }
}
