"use client";

import { useEffect, useState } from "react";

type BrowserInfo = {
  userAgent: string;
  language: string;
  platform: string;
  viewport: string;
  touchPoints: number;
  origin: string;
};

export function BrowserDiagnostics() {
  const [browserInfo, setBrowserInfo] = useState<BrowserInfo | null>(null);

  useEffect(() => {
    function readBrowserInfo() {
      setBrowserInfo({
        userAgent: window.navigator.userAgent,
        language: window.navigator.language,
        platform: window.navigator.platform,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        touchPoints: window.navigator.maxTouchPoints,
        origin: window.location.origin,
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
    </section>
  );
}
