import { KioskStage, PackageCard } from "@/components/kiosk";

export default function Packages() {
  return (
    <KioskStage>
      <h1 className="packages-title">PILIHAN PAKET FOTO</h1>
      <div className="package-row">
        <PackageCard title="PACKAGE 1" color="orange" href="/payment" />
        <PackageCard title="PACKAGE 2" color="brown" href="/payment" />
        <PackageCard title="PACKAGE 3" color="purple" href="/payment" />
      </div>
    </KioskStage>
  );
}
