"use client";
import { useRouter } from "next/navigation";
import { KioskStage } from "@/components/kiosk";
import { packages } from "@/lib/phobo-data";
import { useSessionStore } from "@/lib/session/session-store";
export default function Packages() {
  const router = useRouter(); const { selectPackage } = useSessionStore();
  return <KioskStage><h1 className="packages-title">PILIHAN PAKET FOTO</h1><div className="package-row">{packages.map(p => <article className={`product-card product-card--${p.color}`} key={p.id}><div className="package-art" aria-hidden="true"><span>PHOTO</span></div><h2>{p.name}</h2><div className="product-details"><span>{p.frameCount} Frame</span><span>{p.printCount}x Cetak</span><span>{p.maxShots} Shoot</span><span>{p.durationMinutes} menit</span></div><strong>Rp. {p.price.toLocaleString("id-ID")},00</strong><button onClick={() => { selectPackage(p.id); router.push("/payment"); }}>SELECT</button></article>)}</div></KioskStage>;
}
