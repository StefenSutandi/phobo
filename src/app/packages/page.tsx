"use client";

import { useRouter } from "next/navigation";
import { KioskStage, PackageCard } from "@/components/kiosk";
import { useSessionStore } from "@/lib/session/session-store";

const packages = [
  { id: "package-1", title: "PACKAGE 1", color: "orange" as const },
  { id: "package-2", title: "PACKAGE 2", color: "brown" as const },
  { id: "package-3", title: "PACKAGE 3", color: "purple" as const },
];

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
