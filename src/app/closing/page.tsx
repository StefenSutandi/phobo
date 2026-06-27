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
    ["Feedback", process.env.NEXT_PUBLIC_FEEDBACK_URL],
    ["Frame Request", process.env.NEXT_PUBLIC_FRAME_REQUEST_URL],
    ["Event Registration", process.env.NEXT_PUBLIC_EVENT_REGISTRATION_URL],
  ];

  return (
    <KioskStage>
      <OptionalAsset
        src="/assets/figma/illustrations/closing.png"
        alt=""
        className="closing-illustration"
      />
      <div className="closing-qr-column">
        {links.map(([label, url]) => (
          <div key={label}>
            <ResultQrCode value={url || `https://phobo.local/${label.toLowerCase().replaceAll(" ", "-")}`} />
            <span>{label}</span>
          </div>
        ))}
      </div>
      <h1 className="closing-title">SEE U LATER</h1>
      <button className="closing-home" onClick={() => { resetSession(); router.push("/"); }}>HOME</button>
    </KioskStage>
  );
}
