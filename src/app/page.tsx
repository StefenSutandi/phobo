"use client";

import { useRouter } from "next/navigation";
import { KioskButton, KioskStage, LandingBrand } from "@/components/kiosk";
import { useSessionStore } from "@/lib/session/session-store";

export default function Home() {
  const router = useRouter();
  const { createNewSession } = useSessionStore();

  function startSession() {
    createNewSession();
    router.push("/packages");
  }

  return (
    <KioskStage background="landing">
      <LandingBrand />
      <KioskButton onClick={startSession} variant="orange" className="landing-cta">
        CLICK HERE TO CONTINUE
      </KioskButton>
    </KioskStage>
  );
}
