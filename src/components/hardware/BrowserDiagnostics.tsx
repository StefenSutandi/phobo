"use client";

import { useEffect, useState } from "react";

type BrowserInfo = {
  userAgent: string;
  language: string;
  platform: string;
  viewport: string;
  touchPoints: number;
  origin: string;
  mediaDevicesSupport: boolean;
  videoInputsCount: number;
  savedDeviceId: string | null;
};

export function BrowserDiagnostics() {
  const [browserInfo, setBrowserInfo] = useState<BrowserInfo | null>(null);

  useEffect(() => {
    async function readBrowserInfo() {
      let videoInputsCount = 0;
      let mediaDevicesSupport = false;

      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        mediaDevicesSupport = true;
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          videoInputsCount = devices.filter((d) => d.kind === "videoinput").length;
        } catch {
          // Ignore
        }
      }

      setBrowserInfo({
        userAgent: window.navigator.userAgent,
        language: window.navigator.language,
        platform: window.navigator.platform,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        touchPoints: window.navigator.maxTouchPoints,
        origin: window.location.origin,
        mediaDevicesSupport,
        videoInputsCount,
        savedDeviceId: window.localStorage.getItem("phobo.liveViewDeviceId"),
      });
    }

    readBrowserInfo();
    window.addEventListener("resize", readBrowserInfo);

    return () => window.removeEventListener("resize", readBrowserInfo);
  }, []);

  if (!browserInfo) {
    return (
      <section className="admin-card">
        <h2>Browser Info</h2>
        <p>Loading browser diagnostics...</p>
      </section>
    );
  }

  return (
    <section className="admin-card">
      <h2>Browser Info</h2>
      <p>User agent: {browserInfo.userAgent}</p>
      <p>Language: {browserInfo.language}</p>
      <p>Platform: {browserInfo.platform}</p>
      <p>Viewport: {browserInfo.viewport}</p>
      <p>Touch points: {browserInfo.touchPoints}</p>
      <p>Current origin/base URL: {browserInfo.origin}</p>
      
      <h3 style={{ marginTop: "1rem" }}>Live View Capability</h3>
      <p>Browser MediaDevices Support: {browserInfo.mediaDevicesSupport ? "Yes" : "No"}</p>
      <p>Video Devices Detected: {browserInfo.videoInputsCount}</p>
      <p>Selected Live View Device: {browserInfo.savedDeviceId || "None"}</p>
      <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
        * Note: Live view is a browser overlay. Final still capture is executed via backend Canon command mode.
      </p>
    </section>
  );
}
