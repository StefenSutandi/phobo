"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { RoundedPanel } from "@/components/kiosk";

export type CameraLiveViewHandle = {
  stopLiveView: () => void;
};

export const CameraLiveView = forwardRef<CameraLiveViewHandle>((props, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);

  const stopLiveView = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  };

  useImperativeHandle(ref, () => ({
    stopLiveView,
  }));

  useEffect(() => {
    async function loadDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((device) => device.kind === "videoinput");
        setDevices(videoInputs);
        const savedId = window.localStorage.getItem("phobo.liveViewDeviceId");
        if (savedId && videoInputs.some((d) => d.deviceId === savedId)) {
          setSelectedDeviceId(savedId);
        } else if (videoInputs.length > 0) {
          setSelectedDeviceId(videoInputs[0].deviceId);
        }
      } catch (err) {
        console.error("Could not enumerate devices:", err);
      }
    }
    loadDevices();
    
    return () => {
      stopLiveView();
    };
  }, []);

  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedDeviceId(newId);
    window.localStorage.setItem("phobo.liveViewDeviceId", newId);
    
    if (isActive) {
      stopLiveView();
    }
  };

  const startLiveView = async () => {
    setError("");
    stopLiveView();

    try {
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsActive(true);
        setHasPermission(true);
        
        // Refresh device list to get true labels if they were blank before permission
        const devices = await navigator.mediaDevices.enumerateDevices();
        setDevices(devices.filter((device) => device.kind === "videoinput"));
      }
    } catch (err) {
      console.error("Failed to start live view:", err);
      setHasPermission(false);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Camera permission denied or device unavailable.");
      }
    }
  };

  return (
    <RoundedPanel className="camera-panel" style={{ position: "relative", overflow: "hidden" }}>
      {isActive ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
        />
      ) : (
        <div className="camera-live" aria-label="Camera preview placeholder" style={{ width: "100%", height: "100%" }} />
      )}
      
      <div
        className="live-view-controls"
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          background: "rgba(0,0,0,0.6)",
          padding: "10px",
          borderRadius: "8px",
          color: "white",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          fontSize: "12px",
          maxWidth: "300px"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>Browser Live View</strong>
          {isActive ? (
            <span style={{ color: "lightgreen", marginLeft: "8px" }}>● ACTIVE</span>
          ) : (
            <span style={{ color: "orange", marginLeft: "8px" }}>INACTIVE</span>
          )}
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
        
        {!isActive && devices.length > 0 && (
          <button 
            type="button" 
            onClick={startLiveView}
            style={{ 
              padding: "6px", 
              background: "#6b46c1", 
              color: "white", 
              border: "none", 
              borderRadius: "4px", 
              cursor: "pointer" 
            }}
          >
            START LIVE VIEW
          </button>
        )}
        
        {error && <div style={{ color: "pink", fontSize: "11px" }}>{error}</div>}
        
        <div style={{ fontSize: "10px", opacity: 0.8, marginTop: "4px" }}>
          Note: Final photo uses Canon command.
        </div>
      </div>
    </RoundedPanel>
  );
});

CameraLiveView.displayName = "CameraLiveView";
