import {
  BackgroundPicker,
  CameraPanel,
  KioskButton,
  KioskStage,
} from "@/components/kiosk";

export default function Camera() {
  return (
    <KioskStage>
      <CameraPanel />
      <BackgroundPicker />
      <KioskButton href="/preview" className="camera-shoot">
        SHOOT
      </KioskButton>
    </KioskStage>
  );
}
