export interface CameraStatus {
  connected: boolean;
  model: string;
  batteryLevel?: number;
  lastError?: string;
}

export class CameraAdapter {
  async getStatus(): Promise<CameraStatus> {
    return {
      connected: true,
      model: "Mock Canon 700D",
      batteryLevel: 100, // Dummy battery
    };
  }

  async captureImage(): Promise<string> {
    console.log("[Camera] Capturing image...");
    return "https://via.placeholder.com/600x400.png?text=Captured+Photo";
  }
}

export const camera = new CameraAdapter();
