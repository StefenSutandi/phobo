import {
  KioskButton,
  KioskStage,
  PhotoResultStrip,
  PreviewComposer,
  StickerPicker,
} from "@/components/kiosk";

export default function Preview() {
  return (
    <KioskStage>
      <PreviewComposer />
      <PhotoResultStrip />
      <StickerPicker />
      <KioskButton href="/result" className="preview-next">
        NEXT
      </KioskButton>
    </KioskStage>
  );
}
