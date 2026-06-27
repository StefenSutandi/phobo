"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BackgroundPicker, KioskButton, KioskStage } from "@/components/kiosk";
import { CameraLiveView, type CameraLiveViewHandle } from "@/components/camera-live-view";
import { backgrounds, getFrameById } from "@/lib/phobo-data";
import { useSessionStore } from "@/lib/session/session-store";
type CaptureResponse={ok:boolean;imageUrl?:string;capturedPhotoUrl?:string;error?:string};
export default function Camera(){
 const router=useRouter(); const {session,hasHydrated,selectBackground,addCapturedPhoto}=useSessionStore(); const live=useRef<CameraLiveViewHandle>(null); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false); const [mode,setMode]=useState("mock");
 useEffect(()=>{fetch("/api/diagnostics").then(r=>r.json()).then(d=>setMode(d.env?.cameraMode||"mock")).catch(()=>{});},[]);
 useEffect(()=>{if(!hasHydrated)return;if(!session?.selectedFrameId)router.replace("/frames");else if(!session.selectedBackgroundId)selectBackground(backgrounds[0].id);},[hasHydrated,session?.selectedFrameId,session?.selectedBackgroundId,router,selectBackground]);
 const count=session?.capturedPhotos.length??0,max=session?.maxShots??8,required=Math.min(getFrameById(session?.selectedFrameId).requiredPhotos,max);
 async function shoot(){if(!session||busy||count>=max)return;setBusy(true);setMessage("");try{let response:Response;if(mode==="browser-video"){if(live.current?.getStatus()!=="active")throw new Error("START LIVE VIEW DULU");const frame=live.current.captureFrame();response=await fetch("/api/camera/browser-frame",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:session.sessionId,imageDataUrl:frame.imageDataUrl})});}else{live.current?.stopLiveView();response=await fetch("/api/camera/capture",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:session.sessionId})});}const data=await response.json() as CaptureResponse;const url=data.capturedPhotoUrl||data.imageUrl;if(!response.ok||!data.ok||!url)throw new Error(data.error||"CAMERA CAPTURE GAGAL");addCapturedPhoto(url);setMessage(`FOTO ${count+1} TERSIMPAN`);}catch(e){setMessage(e instanceof Error?e.message:"CAMERA CAPTURE GAGAL");}finally{setBusy(false);}}
 return <KioskStage><div className="shot-counter">Shoot {Math.min(count+1,max)} / {max}</div><CameraLiveView ref={live} compact={true}/><BackgroundPicker backgrounds={backgrounds.map(b=>b.id)} selectedBackgroundId={session?.selectedBackgroundId} onSelectBackground={selectBackground}/><KioskButton onClick={shoot} className={`camera-shoot ${count>=max?"is-disabled":""}`}>{busy?"...":"SHOOT"}</KioskButton><KioskButton onClick={()=>{ if (count >= required) router.push("/preview"); }} className={`camera-next ${count<required?"is-disabled":""}`}>{`NEXT (${count}/${required})`}</KioskButton>{message&&<p className="kiosk-message camera-message">{message}</p>}</KioskStage>;
}

