import { KioskButton, KioskStage, LandingBrand } from "@/components/kiosk";

export default function Home() {
  return (
    <KioskStage background="landing">
      <LandingBrand />
      <KioskButton href="/packages" variant="orange" className="landing-cta">
        CLICK HERE TO CONTINUE
      </KioskButton>
    </KioskStage>
  );
}
