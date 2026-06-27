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
  previewUrl?: string;
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
  { id: "basic", name: "Basic", frameCount: 1, printCount: 1, maxShots: 8, durationMinutes: 5, price: 45000, color: "orange" },
  { id: "duo", name: "Duo", frameCount: 2, printCount: 2, maxShots: 8, durationMinutes: 7, price: 60000, color: "brown" },
  { id: "premium", name: "Premium", frameCount: 2, printCount: 2, maxShots: 16, durationMinutes: 10, price: 65000, color: "purple" },
];

const tripleStripSlots: PhotoSlot[] = [
  { x: 154, y: 132, width: 592, height: 286 },
  { x: 154, y: 458, width: 592, height: 286 },
  { x: 154, y: 784, width: 592, height: 286 },
];

const quadGridSlots: PhotoSlot[] = [
  { x: 118, y: 144, width: 316, height: 380 },
  { x: 466, y: 144, width: 316, height: 380 },
  { x: 118, y: 574, width: 316, height: 380 },
  { x: 466, y: 574, width: 316, height: 380 },
];

const singleSlots: PhotoSlot[] = [
  { x: 112, y: 140, width: 676, height: 790 },
];

export const frames: FrameData[] = Array.from({ length: 18 }, (_, index) => {
  const frameNumber = index + 1;
  const layout = frameNumber % 3 === 0
    ? "quad-grid"
    : frameNumber % 2 === 0
      ? "single"
      : "triple-strip";

  return {
    id: `frame-${frameNumber}`,
    name: `Frame ${frameNumber}`,
    requiredPhotos: layout === "quad-grid" ? 4 : layout === "single" ? 1 : 3,
    layout,
    photoSlots:
      layout === "quad-grid"
        ? quadGridSlots
        : layout === "single"
          ? singleSlots
          : tripleStripSlots,
  };
});

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
