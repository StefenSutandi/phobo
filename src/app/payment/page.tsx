import { KioskStage, QrScreen } from "@/components/kiosk";

export default function Payment() {
  return (
    <KioskStage>
      <QrScreen
        title="SCAN FOR PAYMENT"
        initialSeconds={120}
        completionText="PAYMENT TIMEOUT"
        nextHref="/frames"
      />
    </KioskStage>
  );
}
