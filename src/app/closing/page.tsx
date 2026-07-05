"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { KioskStage, OptionalAsset } from "@/components/kiosk";

import { useSessionStore } from "@/lib/session/session-store";

export default function Closing() {
  const router = useRouter();
  const { resetSession } = useSessionStore();

  useEffect(() => {
    const id = setTimeout(() => { resetSession(); router.replace("/"); }, 15000);
    return () => clearTimeout(id);
  }, [resetSession, router]);

  const qrAssets = [
    { label: "FEEDBACK", src: "/assets/qr/feedback.png" },
    { label: "FRAME REQUEST", src: "/assets/qr/frame-request.png" },
    { label: "EVENT REGISTRATION", src: "/assets/qr/event-registration.png" },
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
          {qrAssets.map(({ label, src }) => (
            <div className="closing-qr-row" key={label}>
              <div className="closing-qr">
                <img 
                  src={src} 
                  alt={`${label} QR`} 
                  className="qr-image" 
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='12' fill='red'%3EMISSING QR%3C/text%3E%3C/svg%3E";
                  }}
                />
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
