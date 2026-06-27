import frameSlots from "@/../public/assets/frames/frame-slots.json";

export type PackageData = {
  id: string;
  name: string;
  frameCount: number;
  printCount: number;
  maxShots: number;
  durationMinutes: number;
  price: number;
  color: "orange" | "brown" | "purple";
};

export type PhotoSlot = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

export type FrameData = {
  id: string;
  name: string;
  templateUrl: string;
  width: number;
  height: number;
  requiredPhotos: number;
  layout: "single" | "triple-strip" | "quad-grid";
  photoSlots: PhotoSlot[];
};

export type BackgroundData = {
  id: string;
  name: string;
  imageUrl?: string;
  color: string;
};

export const packages: PackageData[] = [
  { id: "package-1", name: "PACKAGE 1", frameCount: 1, printCount: 1, maxShots: 3, durationMinutes: 10, price: 35000, color: "orange" },
  { id: "package-2", name: "PACKAGE 2", frameCount: 2, printCount: 2, maxShots: 5, durationMinutes: 15, price: 50000, color: "brown" },
  { id: "package-3", name: "PACKAGE 3", frameCount: 4, printCount: 4, maxShots: 8, durationMinutes: 20, price: 100000, color: "purple" },
];

export const frames: FrameData[] = frameSlots as FrameData[];

const backgroundColors = [
  "#f7f3ee",
  "#d3974d",
  "#a6553a",
  "#591f42",
  "#535a64",
  "#404a4b",
  "#d9d9d9",
  "#f0d7c0",
  "#d7e3df",
  "#e9c7d8",
  "#c7d8e9",
  "#eadfc9",
  "#b9d7c2",
  "#d8c5ea",
  "#f1c1a8",
  "#c8d0d2",
];

export const backgrounds: BackgroundData[] = backgroundColors.map((color, index) => ({
  id: `background-${index + 1}`,
  name: `Background ${index + 1}`,
  color,
}));

export function getFrameById(frameId?: string) {
  return frames.find((frame) => frame.id === frameId) ?? frames[0];
}

export function getBackgroundById(backgroundId?: string) {
  return backgrounds.find((background) => background.id === backgroundId) ?? backgrounds[0];
}

export function getPackageById(packageId?: string) {
  return packages.find((p) => p.id === packageId) ?? packages[0];
}
