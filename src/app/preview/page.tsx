"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KioskButton, KioskStage, PhotoResultStrip, PreviewComposer, StickerPicker } from "@/components/kiosk";
import { getFrameById, backgrounds } from "@/lib/phobo-data";
import { useSessionStore } from "@/lib/session/session-store";
import { getStickers } from "./actions";

export default function Preview(){
 const router=useRouter(); const {session,hasHydrated,selectPhotos,setFinalImageUrl,setPrintImageUrl,setDriveUrl}=useSessionStore(); const [saving,setSaving]=useState(false);const [error,setError]=useState("");
 const [stickersList, setStickersList] = useState<string[]>([]);
 useEffect(()=>{if(hasHydrated&&!session?.capturedPhotos.length)router.replace("/camera");},[hasHydrated,session?.capturedPhotos.length,router]);
 useEffect(() => { getStickers().then(setStickersList); }, []);
 const frame=getFrameById(session?.selectedFrameId); const needed=frame.requiredPhotos; const selected=session?.selectedPhotoIndices??[];
 const chosen=selected.length>0?selected.map(i=>session?.capturedPhotos[i]).filter((x):x is { raw: string; display: string }=>Boolean(x)):(session?.capturedPhotos??[]);
 const chosenDisplayUrls=chosen.map(p=>p.display);
 const allDisplayUrls=(session?.capturedPhotos??[]).map(p=>p.display);
 function toggle(i:number){const next=selected.includes(i)?selected.filter(x=>x!==i):selected.length<needed?[...selected,i]:[...selected.slice(1),i];selectPhotos(next);}
 const isReady = chosen.length >= needed;
 const background = backgrounds.find(bg => bg.id === session?.selectedBackgroundId) || backgrounds[0];

 useEffect(() => {
    if (process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true" && chosenDisplayUrls.length > 0) {
      console.log(`[Preview DIAGNOSTICS] /preview uses keyed photo: yes (url: ${chosenDisplayUrls[0]})`);
    }
  }, [chosenDisplayUrls]);

 async function next(){if(!isReady||!session||saving)return;setSaving(true);setError("");try{const r=await fetch("/api/results/compose",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:session.sessionId,capturedPhotos:chosen,selectedFrameId:session.selectedFrameId,selectedBackgroundId:session.selectedBackgroundId,packageId:session.packageId,stickers:session.stickers,options:session.greenScreenTuning})});const d=await r.json();if(!r.ok||!d.ok||!d.finalImageUrl||!d.printImageUrl)throw new Error(d.error||"Failed to compose result");setFinalImageUrl(d.finalImageUrl);setPrintImageUrl(d.printImageUrl);if(d.driveUrl)setDriveUrl(d.driveUrl);router.push("/result");}catch(e){setError(e instanceof Error?e.message:"Failed to compose result");}finally{setSaving(false);}}
 return <KioskStage><h1 className="preview-heading">PREVIEW FRAME</h1><div style={{ display: 'flex', gap: '20px', width: '100%' }}><div style={{ flex: 1 }}><PreviewComposer frame={frame} photoUrls={chosenDisplayUrls} background={background}/></div><div style={{ width: '300px' }}><StickerPicker stickers={stickersList} /></div></div><PhotoResultStrip photos={allDisplayUrls} selectedIndices={selected} onTogglePhoto={toggle}/><KioskButton className="preview-next" onClick={next} disabled={!isReady || saving}>{saving?"PROCESSING...":"NEXT"}</KioskButton>{!isReady&&<p className="kiosk-message" style={{ color: "#ffaa00", top: "82%" }}>Butuh {needed} foto untuk frame ini. Kamu baru punya {chosen.length} foto.</p>}{error&&<p className="kiosk-message">{error}</p>}</KioskStage>;
}
