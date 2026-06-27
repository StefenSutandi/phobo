import { readFile, writeFile } from "node:fs/promises";
import { applyChromaKey } from "./src/lib/image-processing/chroma-key.js";
import path from "node:path";

async function run() {
  try {
    const inputPath = process.argv[2];
    const outputPath = "chroma-test-output.png";
    
    if (!inputPath) {
      console.error("Please provide an input image path.");
      process.exit(1);
    }
    
    console.log(`Reading ${inputPath}...`);
    const buffer = await readFile(inputPath);
    
    console.log(`Applying chroma key...`);
    const result = await applyChromaKey(buffer, { color: "#ff0000" }, {
      applyChromaKey: true,
      greenMin: 90,
      greenTolerance: 35,
      greenDominance: 35,
      spillReduction: 0,
      edgeSoftness: 0
    });
    
    await writeFile(outputPath, result);
    console.log(`Saved result to ${outputPath}`);
  } catch (error) {
    console.error("Test failed:", error);
  }
}

run();
