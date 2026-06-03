export interface PrinterStatus {
  connected: boolean;
  model: string;
  paperCount?: number;
  inkLevel?: string;
  lastError?: string;
}

export class PrinterAdapter {
  async getStatus(): Promise<PrinterStatus> {
    return {
      connected: true,
      model: "Mock Canon SELPHY CP1500",
      paperCount: 18,
      inkLevel: "OK",
    };
  }

  async print(imageUrl: string): Promise<boolean> {
    console.log(`[Printer] Printing image from ${imageUrl}...`);
    return true;
  }
}

export const printer = new PrinterAdapter();
