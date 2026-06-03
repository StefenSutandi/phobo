export interface StorageStatus {
  localSpace: string;
  googleDriveConnected: boolean;
  lastError?: string;
}

export class StorageAdapter {
  async getStatus(): Promise<StorageStatus> {
    return {
      localSpace: "120GB Free",
      googleDriveConnected: true,
    };
  }

  async saveSessionState(sessionId: string, data: any): Promise<void> {
    console.log(`[Storage] Saving session state for ${sessionId}:`, data);
  }
}

export const storage = new StorageAdapter();
