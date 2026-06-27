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
          <div className="package-column" key={item.id}>
            <article className={`package-card package-card--${item.color}`}>
              <h2 className="package-title">{item.name}</h2>
              <div className="package-card__content">
                <div className="package-illustration-wrap">
                  <OptionalAsset
                    src={`/assets/figma/illustrations/${packageIllustrations[index]}`}
                    alt=""
                    className={`package-illustration package-illustration--${item.id}`}
                    fallback={<span aria-hidden="true">PHOTO</span>}
                  />
                </div>
                <div className="package-details-grid">
                  <div>{item.frameCount} Frame</div>
                  <div>{item.printCount}x Cetak</div>
                  <div>{item.maxShots} Shoot</div>
                  <div>{item.durationMinutes} menit</div>
                </div>
              </div>
              <div className="package-price">Rp. {item.price.toLocaleString("id-ID")},00</div>
            </article>
            <button
              type="button"
              className={`package-select package-select--${item.color}`}
              onClick={() => { selectPackage(item.id); router.push("/payment"); }}
            >
              SELECT
            </button>
          </div>
        ))}
      </div>
    </KioskStage>
  );
}
