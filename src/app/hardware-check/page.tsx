import Link from "next/link";
import { BrowserDiagnostics } from "@/components/hardware/BrowserDiagnostics";
import { getPhoboEnv } from "@/lib/config/phobo-env";
import { camera } from "@/lib/hardware/camera-adapter";
import { printer } from "@/lib/hardware/printer-adapter";
import { storage } from "@/lib/hardware/storage-adapter";

function ModeBadge({ value }: { value: string }) {
  return <span className="mock-badge">{value.toUpperCase()}</span>;
}

export default async function HardwareCheck() {
  const [cameraStatus, printerStatus, storageStatus] = await Promise.all([
    camera.getStatus(),
    printer.getStatus(),
    storage.getStatus(),
  ]);
  const env = getPhoboEnv();
  const appMode = "mock-safe MVP";

  return (
    <main className="admin-page">
      <div className="admin-header">
        <div>
          <span className="mock-badge">CRCS BRING-UP</span>
          <h1>Hardware Status Check</h1>
        </div>
        <Link href="/" className="admin-button">
          Back to Home
        </Link>
      </div>

      <section className="admin-card">
        <h2>App Mode</h2>
        <p>Current app mode: {appMode}</p>
        <p>Real Canon capture, SELPHY printing, Google Drive, and payment gateway are not implemented yet.</p>
      </section>

      <section className="admin-card">
        <h2>Environment Modes</h2>
        <div className="admin-grid">
          <div>
            <ModeBadge value={env.cameraMode} />
            <p>Camera mode</p>
          </div>
          <div>
            <ModeBadge value={env.printerMode} />
            <p>Printer mode</p>
          </div>
          <div>
            <ModeBadge value={env.storageMode} />
            <p>Storage mode</p>
          </div>
          <div>
            <ModeBadge value={env.driveEnabled ? "enabled" : "disabled"} />
            <p>Drive enabled</p>
          </div>
        </div>
        <p>Result directory: {env.resultsDir}</p>
        <p>Configured public base URL: {env.publicBaseUrl}</p>
      </section>

      <BrowserDiagnostics />

      <section className="admin-card">
        <h2>Mock Camera Status</h2>
        <p>Device status shown here is MOCK unless a future real adapter mode is explicitly enabled.</p>
        <p>Model: {cameraStatus.model}</p>
        <p>Battery: {cameraStatus.batteryLevel}%</p>
        <p>Status: {cameraStatus.connected ? "Mock connected" : "Mock disconnected"}</p>
        {cameraStatus.lastError && <p>Error: {cameraStatus.lastError}</p>}
      </section>

      <section className="admin-card">
        <h2>Mock Printer Status</h2>
        <p>Device status shown here is MOCK unless a future real adapter mode is explicitly enabled.</p>
        <p>Model: {printerStatus.model}</p>
        <p>Paper Count: {printerStatus.paperCount}</p>
        <p>Ink Level: {printerStatus.inkLevel}</p>
        <p>Status: {printerStatus.connected ? "Mock connected" : "Mock disconnected"}</p>
        {printerStatus.lastError && <p>Error: {printerStatus.lastError}</p>}
      </section>

      <section className="admin-card">
        <h2>Mock Storage Status</h2>
        <p>Local result storage is active. Google Drive is not implemented yet.</p>
        <p>Local Free Space: {storageStatus.localSpace}</p>
        <p>Mock Google Drive Adapter: {storageStatus.googleDriveConnected ? "Mock connected" : "Mock disconnected"}</p>
        <p>Effective Drive Enabled: {env.driveEnabled ? "Enabled" : "Disabled"}</p>
        {storageStatus.lastError && <p>Error: {storageStatus.lastError}</p>}
      </section>

      <section className="admin-card">
        <h2>Diagnostics API</h2>
        <p>
          Open <Link href="/api/diagnostics">/api/diagnostics</Link> for safe runtime and environment diagnostics.
        </p>
      </section>
    </main>
  );
}
