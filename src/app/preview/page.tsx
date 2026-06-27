"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KioskButton, KioskStage, PhotoResultStrip, PreviewComposer, StickerPicker } from "@/components/kiosk";
import { getFrameById } from "@/lib/phobo-data";
import { useSessionStore } from "@/lib/session/session-store";
export default function Preview(){
 const router=useRouter(); const {session,hasHydrated,selectPhotos,selectSticker,setFinalImageUrl,setPrintImageUrl}=useSessionStore(); const [saving,setSaving]=useState(false);const [error,setError]=useState("");
 useEffect(()=>{if(hasHydrated&&!session?.capturedPhotos.length)router.replace("/camera");},[hasHydrated,session?.capturedPhotos.length,router]);
 const frame=getFrameById(session?.selectedFrameId); const needed=frame.requiredPhotos; const selected=session?.selectedPhotoIndices??[];
 const chosen=selected.length>0?selected.map(i=>session?.capturedPhotos[i]).filter((x):x is string=>Boolean(x)):(session?.capturedPhotos??[]);
 function toggle(i:number){const next=selected.includes(i)?selected.filter(x=>x!==i):selected.length<needed?[...selected,i]:[...selected.slice(1),i];selectPhotos(next);}
 async function next(){if(!session||saving)return;setSaving(true);setError("");try{const r=await fetch("/api/results/compose",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:session.sessionId,capturedPhotos:chosen,selectedFrameId:session.selectedFrameId,selectedBackgroundId:session.selectedBackgroundId,packageId:session.packageId,selectedStickerId:session.selectedStickerId,options:session.greenScreenTuning})});const d=await r.json();if(!r.ok||!d.ok||!d.finalImageUrl||!d.printImageUrl)throw new Error(d.error||"Failed to compose result");setFinalImageUrl(d.finalImageUrl);setPrintImageUrl(d.printImageUrl);router.push("/result");}catch(e){setError(e instanceof Error?e.message:"Failed to compose result");}finally{setSaving(false);}}
 return <KioskStage><h1 className="preview-heading">PREVIEW FRAME</h1><PreviewComposer frame={frame} photoUrls={chosen}/><PhotoResultStrip photos={session?.capturedPhotos??[]} selectedIndices={selected} onTogglePhoto={toggle}/><StickerPicker selectedStickerId={session?.selectedStickerId} onSelectSticker={selectSticker}/><KioskButton className="preview-next" onClick={next}>{saving?"PROCESSING...":"NEXT"}</KioskButton>{error&&<p className="kiosk-message">{error}</p>}</KioskStage>;
}
