import { KioskStage, QrScreen } from "@/components/kiosk";

export default function Result() {
  return (
    <KioskStage>
      <QrScreen
        title="SCAN THE RESULT !!!"
        initialSeconds={300}
        completionText="SESSION ENDED"
        nextHref="/"
      />
    </KioskStage>
  );
}
