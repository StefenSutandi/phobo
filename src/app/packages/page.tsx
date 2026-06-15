"use client";

import { useRouter } from "next/navigation";
import { KioskStage, PackageCard } from "@/components/kiosk";
import { packages } from "@/lib/phobo-data";
import { useSessionStore } from "@/lib/session/session-store";

export default function Packages() {
  const router = useRouter();
  const { selectPackage } = useSessionStore();

  function handleSelectPackage(packageId: string) {
    selectPackage(packageId);
    router.push("/payment");
  }

  return (
    <KioskStage>
      <h1 className="packages-title">PILIHAN PAKET FOTO</h1>
      <div className="package-row">
        {packages.map((packageItem) => (
          <PackageCard
            key={packageItem.id}
            title={packageItem.title}
            color={packageItem.color}
            onSelect={() => handleSelectPackage(packageItem.id)}
          />
        ))}
      </div>
    </KioskStage>
  );
}
