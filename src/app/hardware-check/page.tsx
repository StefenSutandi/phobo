import Link from "next/link";
import { camera } from "@/lib/hardware/camera-adapter";
import { printer } from "@/lib/hardware/printer-adapter";
import { storage } from "@/lib/hardware/storage-adapter";

export default async function HardwareCheck() {
  const cameraStatus = await camera.getStatus();
  const printerStatus = await printer.getStatus();
  const storageStatus = await storage.getStatus();

  return (
    <main className="admin-page">
      <div className="admin-header">
        <div>
          <span className="mock-badge">MOCK</span>
          <h1>Hardware Status Check</h1>
        </div>
        <Link href="/" className="admin-button">
          Back to Home
        </Link>
      </div>

      <section className="admin-card">
        <h2>Display Mode</h2>
        <p>Kiosk fullscreen / infrared touch panel simulation.</p>
      </section>

      <section className="admin-card">
        <h2>Camera Status (MOCK)</h2>
        <p>Model: {cameraStatus.model}</p>
        <p>Battery: {cameraStatus.batteryLevel}%</p>
        <p>Status: {cameraStatus.connected ? "Connected" : "Disconnected"}</p>
        {cameraStatus.lastError && <p>Error: {cameraStatus.lastError}</p>}
      </section>

      <section className="admin-card">
        <h2>Printer Status (MOCK)</h2>
        <p>Model: {printerStatus.model}</p>
        <p>Paper Count: {printerStatus.paperCount}</p>
        <p>Ink Level: {printerStatus.inkLevel}</p>
        <p>Status: {printerStatus.connected ? "Connected" : "Disconnected"}</p>
        {printerStatus.lastError && <p>Error: {printerStatus.lastError}</p>}
      </section>

      <section className="admin-card">
        <h2>Storage And Sync Status (MOCK)</h2>
        <p>Local Free Space: {storageStatus.localSpace}</p>
        <p>Google Drive Sync: {storageStatus.googleDriveConnected ? "Connected" : "Disconnected"}</p>
        {storageStatus.lastError && <p>Error: {storageStatus.lastError}</p>}
      </section>
    </main>
  );
}
