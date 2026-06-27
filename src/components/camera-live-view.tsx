"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { RoundedPanel } from "@/components/kiosk";

export type CameraLiveViewHandle = {
  stopLiveView: () => void;
  captureFrame: () => { imageDataUrl: string; width: number; height: number };
  getStatus: () => "inactive" | "starting" | "active" | "failed";
};

export const CameraLiveView = forwardRef<CameraLiveViewHandle>((props, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [status, setStatus] = useState<"inactive" | "starting" | "active" | "failed">("inactive");
  const [error, setError] = useState("");
  const [videoDimensions, setVideoDimensions] = useState("");
  const streamRef = useRef<MediaStream | null>(null);

  const stopLiveView = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus("inactive");
    setVideoDimensions("");
  };

  useImperativeHandle(ref, () => ({
    stopLiveView,
    getStatus: () => status,
    captureFrame: () => {
      if (status !== "active" || !videoRef.current) {
        throw new Error("Live view must be active before browser-video capture.");
      }
      const video = videoRef.current;
      if (!video.videoWidth || !video.videoHeight) {
        throw new Error("Video dimensions are not available yet.");
      }
      
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Could not get 2d context for capture.");
      }
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageDataUrl = canvas.toDataURL("image/jpeg", 0.92);
      
      return {
        imageDataUrl,
        width: canvas.width,
        height: canvas.height
      };
    }
  }), [status]);

  const loadDevices = async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter((device) => device.kind === "videoinput");
      console.log("[LiveView] Enumerated video inputs:", videoInputs.map(d => ({ label: d.label, id: d.deviceId })));
      
      setDevices(videoInputs);
      
      const savedId = window.localStorage.getItem("phobo.liveViewDeviceId");
      if (savedId && videoInputs.some((d) => d.deviceId === savedId)) {
        setSelectedDeviceId(savedId);
      } else if (videoInputs.length > 0) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      } else {
        setSelectedDeviceId("");
      }
    } catch (err) {
      console.error("[LiveView] Could not enumerate devices:", err);
    }
  };

  useEffect(() => {
    loadDevices();
    return () => {
      stopLiveView();
    };
  }, []);

  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedDeviceId(newId);
    window.localStorage.setItem("phobo.liveViewDeviceId", newId);
    
    if (status === "active" || status === "starting") {
      stopLiveView();
    }
  };

  const attemptGetUserMedia = async (constraints: MediaStreamConstraints, attemptName: string) => {
    console.log(`[LiveView] Attempt ${attemptName} with constraints:`, JSON.stringify(constraints));
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log(`[LiveView] Attempt ${attemptName} SUCCESS. Track label:`, stream.getVideoTracks()[0]?.label);
      return stream;
    } catch (err) {
      console.warn(`[LiveView] Attempt ${attemptName} FAILED:`, err);
      throw err;
    }
  };

  const startLiveView = async (useGeneric = false) => {
    setError("");
    stopLiveView();
    setStatus("starting");

    let stream: MediaStream | null = null;
    
    try {
      if (useGeneric) {
        stream = await attemptGetUserMedia({ video: true, audio: false }, "Generic");
      } else {
        try {
          stream = await attemptGetUserMedia(
            { video: { deviceId: { exact: selectedDeviceId } }, audio: false },
            "A (exact deviceId)"
          );
        } catch (e1) {
          try {
            stream = await attemptGetUserMedia(
              {
                video: {
                  deviceId: { exact: selectedDeviceId },
                  width: { ideal: 640 },
                  height: { ideal: 480 },
                  frameRate: { ideal: 15, max: 30 }
                },
                audio: false
              },
              "B (ideal constraints)"
            );
          } catch (e2) {
            stream = await attemptGetUserMedia({ video: true, audio: false }, "C (fallback any video)");
          }
        }
      }

      if (!stream) {
        throw new Error("Failed to acquire stream from all attempts");
      }

      streamRef.current = stream;
      
      if (!videoRef.current) {
        throw new Error("Video element ref is null");
      }

      videoRef.current.srcObject = stream;
      
      videoRef.current.onloadedmetadata = () => {
        console.log(`[LiveView] onloadedmetadata fired. Dimensions: ${videoRef.current?.videoWidth}x${videoRef.current?.videoHeight}`);
        setVideoDimensions(`${videoRef.current?.videoWidth}x${videoRef.current?.videoHeight}`);
      };

      await videoRef.current.play();
      console.log("[LiveView] video.play() resolved successfully.");
      setStatus("active");
      
      // Refresh devices to get accurate labels post-permission
      await loadDevices();

    } catch (err) {
      console.error("[LiveView] Final start failure:", err);
      setStatus("failed");
      const errName = err instanceof Error ? err.name : "UnknownError";
      const errMsg = err instanceof Error ? err.message : String(err);
      
      if (errName === "AbortError" || errName === "NotReadableError") {
        setError(`${errName}: Device detected but failed to start. Close other camera apps, reconnect USB Video, then press Refresh Devices. (${errMsg})`);
      } else {
        setError(`${errName}: ${errMsg}`);
      }
    }
  };

  return (
    <RoundedPanel className="camera-panel" style={{ position: "relative", overflow: "hidden" }}>
      {/* ALWAYS render video so ref is never null, just hide it when not active */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          borderRadius: "inherit",
          display: status === "active" ? "block" : "none",
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 1
        }}
      />
      
      {status !== "active" && (
        <div 
          className="camera-live" 
          aria-label="Camera preview placeholder" 
          style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0, zIndex: 0 }} 
        />
      )}
      
      <div
        className="live-view-controls"
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          background: "rgba(0,0,0,0.7)",
          padding: "10px",
          borderRadius: "8px",
          color: "white",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          fontSize: "12px",
          maxWidth: "320px",
          border: "1px solid #555"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>Browser Live View</strong>
          <span style={{ 
            color: status === "active" ? "lightgreen" : status === "starting" ? "yellow" : status === "failed" ? "pink" : "orange", 
            marginLeft: "8px",
            fontWeight: "bold"
          }}>
            {status.toUpperCase()}
          </span>
        </div>
        
        {devices.length > 0 ? (
          <select 
            value={selectedDeviceId} 
            onChange={handleDeviceChange}
            style={{ padding: "4px", borderRadius: "4px", color: "black", maxWidth: "100%" }}
          >
            {devices.map((device, index) => (
              <option key={device.deviceId || index} value={device.deviceId}>
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
        ) : (
          <div style={{ color: "pink" }}>No video devices found</div>
        )}
        
        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
          {status !== "active" && devices.length > 0 && (
            <button 
              type="button" 
              onClick={() => startLiveView(false)}
              disabled={status === "starting"}
              style={{ 
                padding: "6px", 
                background: "#6b46c1", 
                color: "white", 
                border: "none", 
                borderRadius: "4px", 
                cursor: "pointer",
                flex: 1
              }}
            >
              START
            </button>
          )}
          
          <button 
            type="button" 
            onClick={loadDevices}
            style={{ 
              padding: "6px", 
              background: "#444", 
              color: "white", 
              border: "none", 
              borderRadius: "4px", 
              cursor: "pointer",
              flex: 1
            }}
          >
            REFRESH
          </button>
          
          {status !== "active" && (
            <button 
              type="button" 
              onClick={() => startLiveView(true)}
              disabled={status === "starting"}
              style={{ 
                padding: "6px", 
                background: "#993333", 
                color: "white", 
                border: "none", 
                borderRadius: "4px", 
                cursor: "pointer",
                flex: "1 1 100%"
              }}
            >
              TEST GENERIC CAMERA
            </button>
          )}
        </div>
        
        {videoDimensions && status === "active" && (
          <div style={{ fontSize: "11px", color: "lightgray" }}>Res: {videoDimensions}</div>
        )}
        
        {error && <div style={{ color: "pink", fontSize: "11px", wordWrap: "break-word" }}>{error}</div>}
        
        <div style={{ fontSize: "10px", opacity: 0.8, marginTop: "4px" }}>
          Devices detected: {devices.length}
        </div>
      </div>
    </RoundedPanel>
  );
});

CameraLiveView.displayName = "CameraLiveView";
