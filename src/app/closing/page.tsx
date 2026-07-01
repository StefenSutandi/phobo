"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { KioskStage, OptionalAsset } from "@/components/kiosk";
import { ResultQrCode } from "@/components/kiosk/ResultQrCode";
import { useSessionStore } from "@/lib/session/session-store";

export default function Closing() {
  const router = useRouter();
  const { resetSession } = useSessionStore();

  useEffect(() => {
    const id = setTimeout(() => { resetSession(); router.replace("/"); }, 15000);
    return () => clearTimeout(id);
  }, [resetSession, router]);

  const links: [string, string | undefined][] = [
    ["FEEDBACK", process.env.NEXT_PUBLIC_FEEDBACK_URL],
    ["FRAME REQUEST", process.env.NEXT_PUBLIC_FRAME_REQUEST_URL],
    ["EVENT REGISTRATION", process.env.NEXT_PUBLIC_EVENT_REGISTRATION_URL],
  ];

  return (
    <main className="closing-page">
      <div className="closing-stage">
        <OptionalAsset
          src="/assets/figma/illustrations/closing.png"
          alt="Closing artwork"
          className="closing-art"
        />

        <div className="closing-qr-list">
          {links.map(([label, url]) => (
            <div className="closing-qr-row" key={label}>
              <div className="closing-qr">
                <ResultQrCode value={url || `https://phobo.local/${label.toLowerCase().replaceAll(" ", "-")}`} />
              </div>
              <span className="closing-label">{label}</span>
            </div>
          ))}
        </div>

        <button className="closing-home-button" onClick={() => { resetSession(); router.push("/"); }}>
          HOME
        </button>
      </div>
    </main>
  );
}
