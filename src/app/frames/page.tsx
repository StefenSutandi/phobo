import {
  FrameGridScroller,
  KioskButton,
  KioskStage,
  RoundedPanel,
} from "@/components/kiosk";

export default function Frames() {
  return (
    <KioskStage>
      <h1 className="frames-title">FRAME</h1>
      <RoundedPanel className="frame-panel" />
      <FrameGridScroller />
      <KioskButton href="/camera" className="frame-next">
        NEXT
      </KioskButton>
    </KioskStage>
  );
}
