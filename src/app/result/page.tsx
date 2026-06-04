"use client";

import { KioskStage, QrScreen } from "@/components/kiosk";
import { useSessionStore } from "@/lib/session/session-store";

export default function Result() {
  const { session } = useSessionStore();

  return (
    <KioskStage>
      <QrScreen
        title="SCAN THE RESULT !!!"
        initialSeconds={300}
        completionText="SESSION ENDED"
      />
      <p className="dev-note">
        {session?.finalImageUrl
          ? `Final image ready: ${session.finalImageUrl.slice(0, 72)}...`
          : "No final image generated yet."}
      </p>
    </KioskStage>
  );
}
