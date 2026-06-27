"use client";

import { useRouter } from "next/navigation";
import { KioskStage, OptionalAsset } from "@/components/kiosk";
import { packages } from "@/lib/phobo-data";
import { useSessionStore } from "@/lib/session/session-store";

const packageIllustrations = ["package-basic.png", "package-duo.png", "package-premium.png"];

export default function Packages() {
  const router = useRouter();
  const { selectPackage } = useSessionStore();

  return (
    <KioskStage>
      <h1 className="packages-title">PILIHAN PAKET FOTO</h1>
      <div className="package-row">
        {packages.map((item, index) => (
          <article className={`product-card product-card--${item.color}`} key={item.id}>
            <div className="package-art">
              <OptionalAsset
                src={`/assets/figma/illustrations/${packageIllustrations[index]}`}
                alt=""
                className="package-art__image"
                fallback={<span aria-hidden="true">PHOTO</span>}
              />
            </div>
            <h2>{item.name}</h2>
            <div className="product-details">
              <span>{item.frameCount} Frame</span>
              <span>{item.printCount}x Cetak</span>
              <span>{item.maxShots} Shoot</span>
              <span>{item.durationMinutes} menit</span>
            </div>
            <strong>Rp. {item.price.toLocaleString("id-ID")},00</strong>
            <button onClick={() => { selectPackage(item.id); router.push("/payment"); }}>
              SELECT
            </button>
          </article>
        ))}
      </div>
    </KioskStage>
  );
}
