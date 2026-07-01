"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { RoundedPanel } from "@/components/kiosk";
import { getBackgroundById } from "@/lib/phobo-data";

export type CameraLiveViewHandle = {
  stopLiveView: () => void;
  captureFrame: () => { imageDataUrl: string; width: number; height: number };
  getStatus: () => "inactive" | "starting" | "active" | "failed";
};

export const CameraLiveView = forwardRef<CameraLiveViewHandle, { compact?: boolean; selectedBackgroundUrl?: string; autoStart?: boolean }>(({ compact = false, selectedBackgroundUrl, autoStart = false }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [status, setStatus] = useState<"inactive" | "starting" | "active" | "failed">("inactive");
  const [error, setError] = useState("");
  const [videoDimensions, setVideoDimensions] = useState("");
  const [selectedResolution, setSelectedResolution] = useState<string>("auto");
  const [zoom, setZoom] = useState<number>(1.0);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
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
      const video = videoRef.current;
      const videoReady = video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0;
      if (status !== "active" || !videoReady) {
        throw new Error("Live view must be active and ready before browser-video capture.");
      }
      
      const sourceElement = canvasRef.current || video;
      const sourceWidth = sourceElement.width || video.videoWidth;
      const sourceHeight = sourceElement.height || video.videoHeight;
      
      const targetWidth = sourceWidth / zoom;
      const targetHeight = sourceHeight / zoom;
      
      const maxOffsetX = (sourceWidth - targetWidth) / 2;
      const maxOffsetY = (sourceHeight - targetHeight) / 2;
      
      const centerSrcX = sourceWidth / 2 + (offsetX / 50) * maxOffsetX;
      const centerSrcY = sourceHeight / 2 + (offsetY / 50) * maxOffsetY;
      
      const srcX = centerSrcX - targetWidth / 2;
      const srcY = centerSrcY - targetHeight / 2;

      const canvas = document.createElement("canvas");
      canvas.width = sourceWidth;
      canvas.height = sourceHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Could not get 2d context for capture.");
      }
      
      ctx.drawImage(sourceElement, srcX, srcY, targetWidth, targetHeight, 0, 0, canvas.width, canvas.height);
      const imageDataUrl = canvas.toDataURL("image/jpeg", 0.92);
      
      return {
        imageDataUrl,
        width: canvas.width,
        height: canvas.height
      };
    }
  }), [status, zoom, offsetX, offsetY]);

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

  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundImgRef = useRef<HTMLImageElement | null>(null);
  const animationFrameId = useRef<number>(0);
  const didAutoStartRef = useRef(false);

  useEffect(() => {
    if (!autoStart) return;
    if (didAutoStartRef.current) return;
    didAutoStartRef.current = true;
    startLiveView().catch((error) => {
      console.error("[CameraLiveView] Auto-start failed:", error);
      setStatus("failed");
      setError("Camera failed to start. Check permission/device.");
    });
  }, [autoStart]);

  useEffect(() => {
    if (!selectedBackgroundUrl) {
      backgroundImgRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = selectedBackgroundUrl;
    backgroundImgRef.current = img;
  }, [selectedBackgroundUrl]);

  useEffect(() => {
    const drawFrame = () => {
      animationFrameId.current = requestAnimationFrame(drawFrame);
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      if (canvas.width !== 1280 || canvas.height !== 720) {
        canvas.width = 1280;
        canvas.height = 720;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const bgImg = backgroundImgRef.current;
      if (bgImg && bgImg.complete) {
        const imgRatio = bgImg.width / bgImg.height;
        const canvasRatio = canvas.width / canvas.height;
        let drawWidth = canvas.width;
        let drawHeight = canvas.height;
        let drawX = 0;
        let drawY = 0;
        if (imgRatio > canvasRatio) {
            drawWidth = canvas.height * imgRatio;
            drawX = (canvas.width - drawWidth) / 2;
        } else {
            drawHeight = canvas.width / imgRatio;
            drawY = (canvas.height - drawHeight) / 2;
        }
        ctx.drawImage(bgImg, drawX, drawY, drawWidth, drawHeight);
      } else {
        ctx.fillStyle = "#d9d9d9";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      
      const video = videoRef.current;
      const videoReady = video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0;
      
      if (status === "active" && videoReady) {
        if (!offscreenCanvasRef.current) {
          offscreenCanvasRef.current = document.createElement("canvas");
        }
        const offscreen = offscreenCanvasRef.current;
        if (offscreen.width !== canvas.width || offscreen.height !== canvas.height) {
          offscreen.width = canvas.width;
          offscreen.height = canvas.height;
        }

        const offCtx = offscreen.getContext("2d", { willReadFrequently: true });
        if (offCtx) {
          offCtx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
          const frame = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
          const data = frame.data;
          
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2];
            if (g >= 90 && g - r >= 35 && g - b >= 35 && g > r + 14 && g > b + 14) {
              data[i+3] = 0;
            }
          }
          offCtx.putImageData(frame, 0, 0);
          ctx.drawImage(offscreen, 0, 0);
        }
      } else {
        // Draw overlay text if camera not ready
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "white";
        ctx.font = "32px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(status === "starting" ? "Starting camera..." : "Camera inactive", canvas.width / 2, canvas.height / 2);
      }
    };

    animationFrameId.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animationFrameId.current);
  }, [status, selectedBackgroundUrl]);

  useEffect(() => {
    loadDevices();
    
    const savedRes = window.localStorage.getItem("phobo.liveViewResolution");
    if (savedRes) setSelectedResolution(savedRes);
    
    const savedZoom = window.localStorage.getItem("phobo.liveViewZoom");
    if (savedZoom) setZoom(parseFloat(savedZoom));
    
    const savedOffsetX = window.localStorage.getItem("phobo.liveViewOffsetX");
    if (savedOffsetX) setOffsetX(parseFloat(savedOffsetX));
    
    const savedOffsetY = window.localStorage.getItem("phobo.liveViewOffsetY");
    if (savedOffsetY) setOffsetY(parseFloat(savedOffsetY));

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

  const handleResolutionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const res = e.target.value;
    setSelectedResolution(res);
    window.localStorage.setItem("phobo.liveViewResolution", res);
    
    if (status === "active" || status === "starting") {
      stopLiveView();
    }
  };

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setZoom(val);
    window.localStorage.setItem("phobo.liveViewZoom", val.toString());
  };

  const handleOffsetXChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setOffsetX(val);
    window.localStorage.setItem("phobo.liveViewOffsetX", val.toString());
  };

  const handleOffsetYChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setOffsetY(val);
    window.localStorage.setItem("phobo.liveViewOffsetY", val.toString());
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
        const tryRes = async (width: number, height: number, name: string) => {
          return await attemptGetUserMedia({
            video: {
              ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
              width: { ideal: width },
              height: { ideal: height },
              frameRate: { ideal: 30 }
            },
            audio: false
          }, name);
        };

        if (selectedResolution !== "auto") {
          const [w, h] = selectedResolution.split("x").map(Number);
          try {
            stream = await tryRes(w, h, `Selected (${w}x${h})`);
          } catch (e) {
            console.warn("[LiveView] Failed selected resolution, falling back to auto");
          }
        }
        
        if (!stream) {
          try {
            stream = await tryRes(1920, 1080, "Auto 1080p");
          } catch (e1) {
            try {
              stream = await tryRes(1280, 720, "Auto 720p");
            } catch (e2) {
              try {
                stream = await tryRes(640, 480, "Auto 480p");
              } catch (e3) {
                stream = await attemptGetUserMedia({ video: true, audio: false }, "Fallback any video");
              }
            }
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

  const tx = -offsetX * (1 - 1 / zoom);
  const ty = -offsetY * (1 - 1 / zoom);

  return (
    <RoundedPanel className="camera-panel camera-main-panel" style={{ position: "relative", overflow: "hidden" }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ display: "none" }}
      />
      <canvas
        ref={canvasRef}
        className="camera-preview-canvas"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          borderRadius: "inherit",
          display: "block",
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 1,
          transform: `scale(${zoom}) translate(${tx}%, ${ty}%)`,
          transformOrigin: "center center"
        }}
      />
      
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
          display: process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true" ? (compact && status === "active" ? "none" : "flex") : "none",
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
          <>
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
            <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
              <select
                value={selectedResolution}
                onChange={handleResolutionChange}
                style={{ padding: "4px", borderRadius: "4px", color: "black", flex: 1 }}
              >
                <option value="auto">Auto Res</option>
                <option value="1920x1080">1920x1080</option>
                <option value="1280x720">1280x720</option>
                <option value="640x480">640x480</option>
              </select>
              {videoDimensions && status === "active" && (
                <span style={{ fontSize: "11px", color: "lightgreen" }}>{videoDimensions}</span>
              )}
            </div>
          </>
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

        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
          <label style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
            <span>Zoom: {zoom.toFixed(2)}x</span>
            <input type="range" min="1" max="1.5" step="0.01" value={zoom} onChange={handleZoomChange} style={{ width: "120px" }} />
          </label>
          <label style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
            <span>Offset X: {offsetX}%</span>
            <input type="range" min="-50" max="50" step="1" value={offsetX} onChange={handleOffsetXChange} style={{ width: "120px" }} />
          </label>
          <label style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
            <span>Offset Y: {offsetY}%</span>
            <input type="range" min="-50" max="50" step="1" value={offsetY} onChange={handleOffsetYChange} style={{ width: "120px" }} />
          </label>
        </div>
        
        {error && <div style={{ color: "pink", fontSize: "11px", wordWrap: "break-word" }}>{error}</div>}
        
        <div style={{ fontSize: "10px", opacity: 0.8, marginTop: "4px" }}>
          Devices detected: {devices.length}
        </div>
      </div>
    </RoundedPanel>
  );
});

CameraLiveView.displayName = "CameraLiveView";

