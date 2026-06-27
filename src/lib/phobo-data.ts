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
  width: 1200;
  height: 1800;
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

const slot = (x: number, y: number, width: number, height: number): PhotoSlot => ({ x, y, width, height });
const doubleFourGrid = [slot(54,198,482,361),slot(54,585,472,353),slot(54,972,472,353),slot(54,1358,482,361),slot(664,198,482,361),slot(664,585,472,353),slot(664,972,472,353),slot(664,1358,482,361)];

// First-pass map measured from gray regions in the supplied opaque RGB exports.
// Designs containing two printed copies intentionally reuse selected photos.
const frameMaps: Array<Pick<FrameData, "requiredPhotos" | "layout" | "photoSlots">> = [
  ...Array.from({ length: 5 }, () => ({ requiredPhotos: 4 as const, layout: "quad-grid" as const, photoSlots: doubleFourGrid })),
  { requiredPhotos:1,layout:"single",photoSlots:[slot(43,235,518,1258),slot(627,235,518,1258)] },
  { requiredPhotos:3,layout:"triple-strip",photoSlots:[slot(64,192,474,521),slot(64,743,474,475),slot(64,1248,475,521),slot(644,190,474,521),slot(644,740,474,475),slot(644,1245,474,522)] },
  { requiredPhotos:3,layout:"triple-strip",photoSlots:[slot(116,294,400,349),slot(116,768,400,349),slot(116,1268,400,348),slot(668,281,400,349),slot(666,755,400,350),slot(666,1255,400,350)] },
  { requiredPhotos:4,layout:"quad-grid",photoSlots:doubleFourGrid },
  { requiredPhotos:2,layout:"quad-grid",photoSlots:[slot(108,127,419,530),slot(105,870,423,534),slot(674,127,418,534),slot(674,874,419,533)] },
  { requiredPhotos:1,layout:"single",photoSlots:[slot(80,413,1040,1284)] },
  { requiredPhotos:2,layout:"quad-grid",photoSlots:[slot(483,546,647,641),slot(72,1245,370,435)] },
  { requiredPhotos:1,layout:"single",photoSlots:[slot(59,739,1083,884)] },
  { requiredPhotos:1,layout:"single",photoSlots:[slot(0,249,1200,994)] },
  { requiredPhotos:3,layout:"triple-strip",photoSlots:[slot(0,359,383,543),slot(496,487,383,413),slot(931,361,269,538)] },
  { requiredPhotos:1,layout:"single",photoSlots:[slot(258,288,680,946)] },
  { requiredPhotos:3,layout:"triple-strip",photoSlots:[slot(78,4,472,511),slot(78,666,472,511),slot(728,4,471,511)] },
  { requiredPhotos:4,layout:"quad-grid",photoSlots:[slot(0,519,584,361),slot(616,519,584,341),slot(0,1047,584,361),slot(616,1047,584,341)] },
];

export const frames: FrameData[] = frameMaps.map((map,index) => ({ id:`frame-${index+1}`,name:`Frame ${index+1}`,templateUrl:`/assets/frames/${index+1}.png`,width:1200,height:1800,...map }));
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
