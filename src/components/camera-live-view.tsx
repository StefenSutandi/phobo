"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from "react";
import { RoundedPanel } from "@/components/kiosk";
import type { GreenScreenTuning } from "@/lib/session/session-types";

export type CameraPreviewProvider = "digicamcontrol" | "browser-video";

export type CameraLiveViewHandle = {
  stopLiveView: () => void;
  captureFrame: () => { rawImageDataUrl: string; displayImageDataUrl: string; width: number; height: number };
  getStatus: () => "inactive" | "starting" | "active" | "recovering" | "failed";
  getActiveProvider: () => CameraPreviewProvider;
  freezeFrame: () => string | null;
  isReady: () => boolean;
  restartLiveView: () => Promise<void>;
  switchToProvider?: (provider: CameraPreviewProvider) => Promise<void>;
};

export type CameraLiveViewProps = {
  compact?: boolean;
  selectedBackgroundUrl?: string;
  autoStart?: boolean;
  tuning?: GreenScreenTuning;
  preferredProvider?: CameraPreviewProvider;
  captureMode?: string;
  onProviderChange?: (provider: CameraPreviewProvider) => void;
};

export const CameraLiveView = forwardRef<CameraLiveViewHandle, CameraLiveViewProps>((
  {
    compact = false,
    selectedBackgroundUrl,
    autoStart = false,
    tuning,
    preferredProvider,
    captureMode,
    onProviderChange,
  },
  ref
) => {
  const initialProvider: CameraPreviewProvider =
    preferredProvider || (captureMode === "digicamcontrol" ? "digicamcontrol" : "browser-video");

  const [activeProvider, setActiveProvider] = useState<CameraPreviewProvider>(initialProvider);
  const activeProviderRef = useRef<CameraPreviewProvider>(initialProvider);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);
  const statusOverlayRef = useRef<HTMLDivElement>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [status, setStatus] = useState<"inactive" | "starting" | "active" | "recovering" | "failed">("inactive");
  const statusRef = useRef<"inactive" | "starting" | "active" | "recovering" | "failed">("inactive");

  const [error, setError] = useState("");
  const [videoDimensions, setVideoDimensions] = useState("");
  const [selectedResolution, setSelectedResolution] = useState<string>("auto");
  const [zoom, setZoom] = useState<number>(1.0);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);

  const [keyColor, setKeyColor] = useState<string>("#00ff00");
  const [similarity, setSimilarity] = useState<number>(0.2);
  const [smoothness, setSmoothness] = useState<number>(0.1);
  const [showDebugMask, setShowDebugMask] = useState<boolean>(false);
  const [segmentationMode, setSegmentationMode] = useState<boolean>(false);

  // Browser video stream refs
  const streamRef = useRef<MediaStream | null>(null);
  const readySamplesRef = useRef<number>(0);

  // DCC live stream refs
  const dccPollingActiveRef = useRef<boolean>(false);
  const dccFetchAbortControllerRef = useRef<AbortController | null>(null);
  const currentDccImageRef = useRef<HTMLImageElement | ImageBitmap | null>(null);
  const lastFrameSequenceRef = useRef<number>(0);
  const lastFrameTimestampRef = useRef<number>(0);
  const freshFrameProgressRef = useRef<number>(0);
  const firstRecoveryFreshFrameAtRef = useRef<number>(0);

  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundImgRef = useRef<HTMLImageElement | null>(null);
  const animationFrameId = useRef<number>(0);
  const didAutoStartRef = useRef(false);

  const updateStatus = (newStatus: "inactive" | "starting" | "active" | "recovering" | "failed") => {
    statusRef.current = newStatus;
    setStatus(newStatus);
  };

  const setProvider = (provider: CameraPreviewProvider) => {
    activeProviderRef.current = provider;
    setActiveProvider(provider);
    onProviderChange?.(provider);
  };

  const stopLiveView = useCallback(() => {
    // 1. Stop DCC polling
    dccPollingActiveRef.current = false;
    if (dccFetchAbortControllerRef.current) {
      dccFetchAbortControllerRef.current.abort();
      dccFetchAbortControllerRef.current = null;
    }
    if (
      currentDccImageRef.current &&
      "close" in currentDccImageRef.current &&
      typeof (currentDccImageRef.current as ImageBitmap).close === "function"
    ) {
      (currentDccImageRef.current as ImageBitmap).close();
    }
    currentDccImageRef.current = null;
    freshFrameProgressRef.current = 0;
    firstRecoveryFreshFrameAtRef.current = 0;

    // 2. Stop browser video
    readySamplesRef.current = 0;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    updateStatus("inactive");
    setVideoDimensions("");
  }, []);

  const isReady = useCallback((): boolean => {
    if (activeProviderRef.current === "digicamcontrol") {
      const img = currentDccImageRef.current;
      const isImgValid = Boolean(img && img.width > 0 && img.height > 0);
      const ready = Boolean(
        (statusRef.current === "active" || statusRef.current === "starting" || statusRef.current === "recovering") &&
        isImgValid &&
        freshFrameProgressRef.current >= 2
      );
      return ready;
    }

    // Browser video readiness
    const video = videoRef.current;
    const track = streamRef.current?.getVideoTracks()[0];
    const isTrackLive = Boolean(track && track.readyState === "live" && track.enabled);
    const videoHasFrames = Boolean(
      statusRef.current === "active" &&
      isTrackLive &&
      video &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    );

    if (videoHasFrames) {
      readySamplesRef.current += 1;
    } else {
      readySamplesRef.current = 0;
    }

    return videoHasFrames && readySamplesRef.current >= 2;
  }, []);

  const freezeFrame = useCallback((): string | null => {
    try {
      const canvas = canvasRef.current;
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        return canvas.toDataURL("image/jpeg", 0.9);
      }

      if (activeProviderRef.current === "digicamcontrol") {
        const dccImg = currentDccImageRef.current;
        if (dccImg && dccImg.width > 0 && dccImg.height > 0) {
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = dccImg.width;
          tempCanvas.height = dccImg.height;
          const ctx = tempCanvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(dccImg, 0, 0);
            return tempCanvas.toDataURL("image/jpeg", 0.9);
          }
        }
      } else {
        const video = videoRef.current;
        if (video && video.videoWidth > 0 && video.videoHeight > 0) {
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = video.videoWidth;
          tempCanvas.height = video.videoHeight;
          const ctx = tempCanvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0);
            return tempCanvas.toDataURL("image/jpeg", 0.9);
          }
        }
      }
    } catch (err) {
      console.warn("[Camera Preview] freezeFrame failed:", err);
    }
    return null;
  }, []);

  const startBrowserLiveView = async (useGeneric = false) => {
    setError("");
    updateStatus("starting");

    let stream: MediaStream | null = null;

    try {
      if (useGeneric) {
        stream = await attemptGetUserMedia({ video: true, audio: false }, "Generic");
      } else {
        const tryRes = async (width: number, height: number, name: string) => {
          return await attemptGetUserMedia(
            {
              video: {
                ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
                width: { ideal: width },
                height: { ideal: height },
                frameRate: { ideal: 30 },
              },
              audio: false,
            },
            name
          );
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
        setVideoDimensions(`${videoRef.current?.videoWidth}x${videoRef.current?.videoHeight}`);
      };

      await videoRef.current.play();
      updateStatus("active");

      if (process.env.PHOBO_DEBUG_LOGS === "true" || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
        console.log(
          `[Camera Preview] PreferredProvider=${initialProvider} ActiveProvider=browser-video State=active`
        );
      }

      await loadDevices();
    } catch (err) {
      console.error("[LiveView] Final start failure:", err);
      updateStatus("failed");
      const errName = err instanceof Error ? err.name : "UnknownError";
      const errMsg = err instanceof Error ? err.message : String(err);

      if (errName === "AbortError" || errName === "NotReadableError") {
        setError(
          `${errName}: Device detected but failed to start. Close other camera apps, reconnect USB Video, then press Refresh Devices. (${errMsg})`
        );
      } else {
        setError(`${errName}: ${errMsg}`);
      }
    }
  };

  const startDccLiveView = useCallback(async () => {
    setError("");
    updateStatus("starting");

    const preferred = initialProvider;
    console.log(
      `[Camera Preview] PreferredProvider=${preferred} ActiveProvider=digicamcontrol DccEndpoint=/api/camera/live-frame State=starting`
    );

    if (dccPollingActiveRef.current) return;
    dccPollingActiveRef.current = true;

    let consecutiveFailures = 0;

const DCC_POLL_INTERVAL_MS = 500;

    const pollLoop = async () => {
      while (dccPollingActiveRef.current && activeProviderRef.current === "digicamcontrol") {
        try {
          const controller = new AbortController();
          dccFetchAbortControllerRef.current = controller;

          const res = await fetch("/api/camera/live-frame", {
            cache: "no-store",
            signal: controller.signal,
          });

          if (!res.ok) {
            throw new Error(`DCC proxy HTTP ${res.status}`);
          }

          const seqHeader = res.headers.get("X-Frame-Sequence");
          const isNewHeader = res.headers.get("X-Frame-New");
          const seq = seqHeader ? Number.parseInt(seqHeader, 10) : 0;
          const isNew = isNewHeader === "1";

          const blob = await res.blob();
          if (blob.size < 100) {
            throw new Error("Received truncated or empty DCC frame blob");
          }

          // Decode image blob
          let decoded: ImageBitmap | HTMLImageElement;
          if (typeof window !== "undefined" && typeof window.createImageBitmap === "function") {
            try {
              decoded = await createImageBitmap(blob);
            } catch (err) {
              decoded = await new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                const url = URL.createObjectURL(blob);
                img.onload = () => {
                  URL.revokeObjectURL(url);
                  resolve(img);
                };
                img.onerror = reject;
                img.src = url;
              });
            }
          } else {
            decoded = await new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              const url = URL.createObjectURL(blob);
              img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
              };
              img.onerror = reject;
              img.src = url;
            });
          }

          const w = "videoWidth" in decoded ? (decoded as any).videoWidth : decoded.width;
          const h = "videoHeight" in decoded ? (decoded as any).videoHeight : decoded.height;

          if (w > 0 && h > 0) {
            consecutiveFailures = 0;

            const isAdvancing = isNew && seq > lastFrameSequenceRef.current;
            if (isAdvancing) {
              const now = Date.now();
              if (freshFrameProgressRef.current === 0) {
                freshFrameProgressRef.current = 1;
                firstRecoveryFreshFrameAtRef.current = now;
                lastFrameSequenceRef.current = seq;
              } else {
                if (now - firstRecoveryFreshFrameAtRef.current <= 4000) {
                  freshFrameProgressRef.current += 1;
                  lastFrameSequenceRef.current = seq;
                } else {
                  // Window expired (>4s); restart progress with this fresh frame
                  freshFrameProgressRef.current = 1;
                  firstRecoveryFreshFrameAtRef.current = now;
                  lastFrameSequenceRef.current = seq;
                }
              }
            } else {
              // Stale or duplicate poll: do NOT increment, do NOT immediately reset.
              // If waiting on a single fresh frame and window expires (>4s), reset back to 0.
              if (freshFrameProgressRef.current === 1 && Date.now() - firstRecoveryFreshFrameAtRef.current > 4000) {
                freshFrameProgressRef.current = 0;
                firstRecoveryFreshFrameAtRef.current = 0;
              }
              // If sequence regressed (e.g. DCC server restarted and reset sequence):
              if (seq < lastFrameSequenceRef.current) {
                lastFrameSequenceRef.current = seq;
                freshFrameProgressRef.current = 0;
                firstRecoveryFreshFrameAtRef.current = 0;
              }
            }

            // Dispose old ImageBitmap to prevent GPU memory leak
            if (
              currentDccImageRef.current &&
              "close" in currentDccImageRef.current &&
              typeof (currentDccImageRef.current as ImageBitmap).close === "function"
            ) {
              (currentDccImageRef.current as ImageBitmap).close();
            }

            currentDccImageRef.current = decoded;
            setVideoDimensions(`${w}x${h}`);

            if ((statusRef.current === "starting" || statusRef.current === "recovering") && freshFrameProgressRef.current >= 2) {
              updateStatus("active");
              console.log(
                `[Camera Preview] PreferredProvider=${preferred} ActiveProvider=digicamcontrol DccEndpoint=/api/camera/live-frame State=active`
              );
            }
          }
        } catch (err) {
          if (!dccPollingActiveRef.current) break;
          consecutiveFailures += 1;
          freshFrameProgressRef.current = 0;
          firstRecoveryFreshFrameAtRef.current = 0;

          // If starting and DCC fails 3 consecutive times (~1.5-2s), fall back to browser-video
          if (statusRef.current === "starting" && consecutiveFailures >= 3) {
            console.log("[Camera Preview] DCC unavailable, falling back to browser-video");
            dccPollingActiveRef.current = false;
            setProvider("browser-video");
            await startBrowserLiveView(false);
            return;
          }
        }

        // Native DCC webserver cadence
        await new Promise((r) => setTimeout(r, DCC_POLL_INTERVAL_MS));
      }
    };

    pollLoop();
  }, [initialProvider]);

  const restartLiveView = useCallback(async () => {
    if (activeProviderRef.current === "digicamcontrol") {
      if (process.env.PHOBO_DEBUG_LOGS === "true" || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
        console.log("[Camera Preview] ActiveProvider=digicamcontrol State=recovering");
      }
      freshFrameProgressRef.current = 0;
      firstRecoveryFreshFrameAtRef.current = 0;
      if (!dccPollingActiveRef.current) {
        await startDccLiveView();
      }
    } else {
      if (process.env.PHOBO_DEBUG_LOGS === "true" || process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true") {
        console.log("[Camera Preview] ActiveProvider=browser-video State=recovering");
      }
      await startBrowserLiveView(false);
    }
  }, [startDccLiveView]);

  const switchToProvider = async (provider: CameraPreviewProvider) => {
    stopLiveView();
    setProvider(provider);
    if (provider === "digicamcontrol") {
      await startDccLiveView();
    } else {
      await startBrowserLiveView(false);
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      stopLiveView,
      getStatus: () => statusRef.current,
      getActiveProvider: () => activeProviderRef.current,
      isReady,
      freezeFrame,
      restartLiveView,
      switchToProvider,
      captureFrame: () => {
        const isDcc = activeProviderRef.current === "digicamcontrol";
        const dccImg = currentDccImageRef.current;
        const video = videoRef.current;

        const sourceReady = isDcc
          ? Boolean(statusRef.current === "active" && dccImg && dccImg.width > 0 && dccImg.height > 0)
          : Boolean(
              statusRef.current === "active" &&
                video &&
                video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                video.videoWidth > 0 &&
                video.videoHeight > 0
            );

        if (!sourceReady) {
          throw new Error("Live view must be active and ready before captureFrame.");
        }

        const sourceElement = isDcc ? dccImg! : video!;
        const sourceWidth = "videoWidth" in sourceElement ? (sourceElement as any).videoWidth : sourceElement.width;
        const sourceHeight =
          "videoHeight" in sourceElement ? (sourceElement as any).videoHeight : sourceElement.height;

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
        if (!ctx) throw new Error("Could not get 2d context for capture.");

        ctx.drawImage(sourceElement, srcX, srcY, targetWidth, targetHeight, 0, 0, canvas.width, canvas.height);
        const rawImageDataUrl = canvas.toDataURL("image/jpeg", 0.92);

        const displayCanvas = document.createElement("canvas");
        displayCanvas.width = sourceWidth;
        displayCanvas.height = sourceHeight;
        const dCtx = displayCanvas.getContext("2d");

        if (dCtx) {
          if (offscreenCanvasRef.current && tuning?.applyChromaKey !== false) {
            dCtx.drawImage(
              offscreenCanvasRef.current,
              srcX,
              srcY,
              targetWidth,
              targetHeight,
              0,
              0,
              displayCanvas.width,
              displayCanvas.height
            );
          } else {
            dCtx.drawImage(
              sourceElement,
              srcX,
              srcY,
              targetWidth,
              targetHeight,
              0,
              0,
              displayCanvas.width,
              displayCanvas.height
            );
          }
        }

        const displayImageDataUrl = displayCanvas.toDataURL("image/png");

        return {
          rawImageDataUrl,
          displayImageDataUrl,
          width: canvas.width,
          height: canvas.height,
        };
      },
    }),
    [stopLiveView, isReady, freezeFrame, restartLiveView, zoom, offsetX, offsetY, tuning]
  );

  const loadDevices = async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter((device) => device.kind === "videoinput");

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

  const attemptGetUserMedia = async (constraints: MediaStreamConstraints, attemptName: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (err) {
      console.warn(`[LiveView] Attempt ${attemptName} FAILED:`, err);
      throw err;
    }
  };

  useEffect(() => {
    if (!autoStart) return;
    if (didAutoStartRef.current) return;
    didAutoStartRef.current = true;

    if (activeProviderRef.current === "digicamcontrol") {
      startDccLiveView().catch((error) => {
        console.error("[CameraLiveView] DCC auto-start failed, attempting browser fallback:", error);
        setProvider("browser-video");
        startBrowserLiveView(false);
      });
    } else {
      startBrowserLiveView(false).catch((error) => {
        console.error("[CameraLiveView] Browser video auto-start failed:", error);
        updateStatus("failed");
        setError("Camera failed to start. Check permission/device.");
      });
    }
  }, [autoStart, startDccLiveView]);

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

  // Main Canvas Rendering Loop
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
      const drawBg = () => {
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
      };

      // Always draw the clean background on the main canvas
      drawBg();

      const debugCanvas = debugCanvasRef.current;
      const debugCtx = debugCanvas?.getContext("2d", { willReadFrequently: true });
      if (showDebugMask && debugCanvas && debugCtx) {
        if (debugCanvas.width !== canvas.width || debugCanvas.height !== canvas.height) {
          debugCanvas.width = canvas.width;
          debugCanvas.height = canvas.height;
        }
        debugCtx.fillStyle = "#000";
        debugCtx.fillRect(0, 0, debugCanvas.width, debugCanvas.height);
      }

      // Determine active source element (DCC Image/Bitmap or Browser Video)
      const isDcc = activeProviderRef.current === "digicamcontrol";
      const dccImg = currentDccImageRef.current;
      const video = videoRef.current;

      const sourceReady = isDcc
        ? Boolean(statusRef.current === "active" && dccImg && dccImg.width > 0 && dccImg.height > 0)
        : Boolean(
            statusRef.current === "active" &&
              video &&
              video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
              video.videoWidth > 0 &&
              video.videoHeight > 0
          );

      const sourceElement: HTMLImageElement | ImageBitmap | HTMLVideoElement | null = isDcc ? dccImg : video;

      if (sourceReady && sourceElement) {
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
          offCtx.drawImage(sourceElement, 0, 0, offscreen.width, offscreen.height);
          const frame = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
          const data = frame.data;

          let keyedPixels = 0;
          const totalPixels = data.length / 4;

          const greenMin = tuning?.greenMin ?? 70;
          const greenTolerance = tuning?.greenTolerance ?? 35;
          const edgeSoftness = tuning?.edgeSoftness ?? 2;
          const applyChromaKey = tuning?.applyChromaKey ?? true;

          if (applyChromaKey) {
            for (let i = 0; i < data.length; i += 4) {
              const r = data[i],
                g = data[i + 1],
                b = data[i + 2];

              const maxRB = Math.max(r, b);
              const diff = g - maxRB;
              const threshold = greenTolerance * 0.5;

              let alpha = 1;
              if (g >= greenMin && diff > threshold && g > maxRB * 1.1) {
                if (edgeSoftness > 0 && diff < threshold + edgeSoftness * 2) {
                  alpha = 1 - (diff - threshold) / (edgeSoftness * 2);
                } else {
                  alpha = 0;
                }
              }

              if (alpha < 1) {
                keyedPixels += 1 - alpha;
              }

              if (showDebugMask) {
                const maskVal = Math.floor(alpha * 255);
                data[i] = maskVal;
                data[i + 1] = maskVal;
                data[i + 2] = maskVal;
                data[i + 3] = 255;
              } else {
                data[i + 3] = Math.floor(alpha * 255);
              }
            }
          }
          offCtx.putImageData(frame, 0, 0);

          const keyedRatio = keyedPixels / totalPixels;

          if (showDebugMask && debugCanvas && debugCtx) {
            const w = debugCanvas.width / 2;
            const h = debugCanvas.height / 2;

            // TL: Raw Source
            debugCtx.drawImage(sourceElement, 0, 0, w, h);

            // TR: Selected Background
            if (bgImg && bgImg.complete) {
              debugCtx.drawImage(bgImg, w, 0, w, h);
            } else {
              debugCtx.fillStyle = "#888";
              debugCtx.fillRect(w, 0, w, h);
            }

            // BL: Mask
            debugCtx.drawImage(offscreen, 0, h, w, h);

            // BR: Final composite
            debugCtx.save();
            debugCtx.beginPath();
            debugCtx.rect(w, h, w, h);
            debugCtx.clip();
            debugCtx.translate(w, h);
            debugCtx.scale(0.5, 0.5);
            if (bgImg && bgImg.complete) {
              const imgRatio = bgImg.width / bgImg.height;
              const canvasRatio = debugCanvas.width / debugCanvas.height;
              let drawWidth = debugCanvas.width;
              let drawHeight = debugCanvas.height;
              let drawX = 0;
              let drawY = 0;
              if (imgRatio > canvasRatio) {
                drawWidth = debugCanvas.height * imgRatio;
                drawX = (debugCanvas.width - drawWidth) / 2;
              } else {
                drawHeight = debugCanvas.width / imgRatio;
                drawY = (debugCanvas.height - drawHeight) / 2;
              }
              debugCtx.drawImage(bgImg, drawX, drawY, drawWidth, drawHeight);
            } else {
              debugCtx.fillStyle = "#d9d9d9";
              debugCtx.fillRect(0, 0, debugCanvas.width, debugCanvas.height);
            }
            debugCtx.drawImage(offscreen, 0, 0);
            debugCtx.restore();

            debugCtx.fillStyle = "white";
            debugCtx.font = "20px sans-serif";
            debugCtx.fillText(`Raw (${isDcc ? "DCC" : "Browser"})`, 10, 30);
            debugCtx.fillText("Background", w + 10, 30);
            debugCtx.fillText(`Mask (Ratio: ${(keyedRatio * 100).toFixed(1)}%)`, 10, h + 30);
            debugCtx.fillText("Final Composite", w + 10, h + 30);
          }

          // Always draw the clean keyed source on the main canvas
          ctx.drawImage(offscreen, 0, 0);

          if (statusOverlayRef.current) {
            if (process.env.NEXT_PUBLIC_CAMERA_DEBUG !== "true") {
              statusOverlayRef.current.style.display = "none";
            } else {
              statusOverlayRef.current.style.display = "flex";
              if (keyedRatio < 0.05) {
                statusOverlayRef.current.innerText = "No green screen detected.";
                statusOverlayRef.current.style.color = "white";
              } else {
                statusOverlayRef.current.innerText = `Green screen detected: ${(keyedRatio * 100).toFixed(0)}%`;
                statusOverlayRef.current.style.color = "#00ff00";
              }
            }
          }
        }
      } else {
        if (statusOverlayRef.current) {
          statusOverlayRef.current.style.display = "flex";
          statusOverlayRef.current.style.color = "white";
          statusOverlayRef.current.innerText =
            statusRef.current === "starting"
              ? isDcc
                ? "Connecting to digiCamControl..."
                : "Starting camera..."
              : statusRef.current === "recovering"
              ? "Recovering camera preview..."
              : "Camera inactive";
        }
      }
    };

    animationFrameId.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animationFrameId.current);
  }, [showDebugMask, tuning]);

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
  }, [stopLiveView]);

  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedDeviceId(newId);
    window.localStorage.setItem("phobo.liveViewDeviceId", newId);

    if (activeProvider === "browser-video" && (status === "active" || status === "starting")) {
      stopLiveView();
    }
  };

  const handleResolutionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const res = e.target.value;
    setSelectedResolution(res);
    window.localStorage.setItem("phobo.liveViewResolution", res);

    if (activeProvider === "browser-video" && (status === "active" || status === "starting")) {
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

  const tx = -offsetX * (1 - 1 / zoom);
  const ty = -offsetY * (1 - 1 / zoom);

  return (
    <RoundedPanel className="camera-panel camera-main-panel" style={{ position: "relative", overflow: "hidden" }}>
      <video ref={videoRef} autoPlay playsInline muted style={{ display: "none" }} />
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
          transformOrigin: "center center",
        }}
      />
      {showDebugMask && (
        <canvas
          ref={debugCanvasRef}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "inherit",
            display: "block",
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: 2,
            transform: `scale(${zoom}) translate(${tx}%, ${ty}%)`,
            transformOrigin: "center center",
          }}
        />
      )}
      <div
        ref={statusOverlayRef}
        style={{
          position: "absolute",
          top: "10%",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 3,
          backgroundColor: "rgba(0,0,0,0.6)",
          padding: "8px 16px",
          borderRadius: "8px",
          color: "white",
          fontSize: "24px",
          fontWeight: "bold",
          textAlign: "center",
          pointerEvents: "none",
          display: "none",
        }}
      />

      {/* Debug UI requirement: Preview Source and State when NEXT_PUBLIC_CAMERA_DEBUG=true */}
      {process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true" && (
        <div
          className="camera-debug-hud"
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            backgroundColor: "rgba(15, 23, 42, 0.9)",
            border: "1px solid rgba(56, 189, 248, 0.4)",
            padding: "8px 14px",
            borderRadius: "8px",
            color: "#ffffff",
            zIndex: 80,
            fontSize: "12px",
            fontFamily: "monospace",
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <span style={{ color: "#94a3b8" }}>Preview Source:</span>
            <strong style={{ color: activeProvider === "digicamcontrol" ? "#38bdf8" : "#fbbf24" }}>
              {activeProvider === "digicamcontrol" ? "DCC" : "Browser Video"}
            </strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <span style={{ color: "#94a3b8" }}>State:</span>
            <strong
              style={{
                color:
                  status === "active"
                    ? "#4ade80"
                    : status === "recovering"
                    ? "#fbbf24"
                    : status === "starting"
                    ? "#facc15"
                    : "#f87171",
              }}
            >
              {status.toUpperCase()}
            </strong>
          </div>
        </div>
      )}

      {/* Detailed Diagnostics Controls: Only visible when debug enabled */}
      <div
        className="live-view-controls"
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          background: "rgba(0,0,0,0.85)",
          padding: "10px",
          borderRadius: "8px",
          color: "white",
          zIndex: 70,
          display:
            process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true"
              ? compact && status === "active"
                ? "none"
                : "flex"
              : "none",
          flexDirection: "column",
          gap: "8px",
          fontSize: "12px",
          maxWidth: "320px",
          border: "1px solid #555",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>Camera Live View</strong>
          <span
            style={{
              color:
                status === "active"
                  ? "lightgreen"
                  : status === "starting"
                  ? "yellow"
                  : status === "failed"
                  ? "pink"
                  : "orange",
              marginLeft: "8px",
              fontWeight: "bold",
            }}
          >
            {status.toUpperCase()}
          </span>
        </div>

        <div style={{ display: "flex", gap: "6px" }}>
          <button
            type="button"
            onClick={() => switchToProvider("digicamcontrol")}
            style={{
              flex: 1,
              padding: "4px 8px",
              background: activeProvider === "digicamcontrol" ? "#0284c7" : "#334155",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "11px",
              fontWeight: activeProvider === "digicamcontrol" ? "bold" : "normal",
            }}
          >
            DCC
          </button>
          <button
            type="button"
            onClick={() => switchToProvider("browser-video")}
            style={{
              flex: 1,
              padding: "4px 8px",
              background: activeProvider === "browser-video" ? "#0284c7" : "#334155",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "11px",
              fontWeight: activeProvider === "browser-video" ? "bold" : "normal",
            }}
          >
            Browser Video
          </button>
        </div>

        {activeProvider === "browser-video" && (
          <>
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
          </>
        )}

        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
          {status !== "active" && (
            <button
              type="button"
              onClick={() => (activeProvider === "digicamcontrol" ? startDccLiveView() : startBrowserLiveView(false))}
              disabled={status === "starting"}
              style={{
                padding: "6px",
                background: "#6b46c1",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                flex: 1,
              }}
            >
              START
            </button>
          )}

          <button
            type="button"
            onClick={activeProvider === "digicamcontrol" ? startDccLiveView : loadDevices}
            style={{
              padding: "6px",
              background: "#444",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              flex: 1,
            }}
          >
            REFRESH
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
          <label style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
            <span>Zoom: {zoom.toFixed(2)}x</span>
            <input
              type="range"
              min="1"
              max="1.5"
              step="0.01"
              value={zoom}
              onChange={handleZoomChange}
              style={{ width: "120px" }}
            />
          </label>
          <label style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
            <span>Offset X: {offsetX}%</span>
            <input
              type="range"
              min="-50"
              max="50"
              step="1"
              value={offsetX}
              onChange={handleOffsetXChange}
              style={{ width: "120px" }}
            />
          </label>
          <label style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
            <span>Offset Y: {offsetY}%</span>
            <input
              type="range"
              min="-50"
              max="50"
              step="1"
              value={offsetY}
              onChange={handleOffsetYChange}
              style={{ width: "120px" }}
            />
          </label>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            marginTop: "4px",
            borderTop: "1px solid #555",
            paddingTop: "4px",
          }}
        >
          <strong>Chroma Key Tuning</strong>
          <label style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
            <span>Key Color:</span>
            <input type="color" value={keyColor} onChange={(e) => setKeyColor(e.target.value)} />
          </label>
          <label style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
            <span>Similarity: {similarity.toFixed(2)}</span>
            <input
              type="range"
              min="0.01"
              max="1.0"
              step="0.01"
              value={similarity}
              onChange={(e) => setSimilarity(parseFloat(e.target.value))}
              style={{ width: "120px" }}
            />
          </label>
          <label style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
            <span>Smoothness: {smoothness.toFixed(2)}</span>
            <input
              type="range"
              min="0"
              max="1.0"
              step="0.01"
              value={smoothness}
              onChange={(e) => setSmoothness(parseFloat(e.target.value))}
              style={{ width: "120px" }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", marginTop: "4px" }}>
            <input type="checkbox" checked={showDebugMask} onChange={(e) => setShowDebugMask(e.target.checked)} />
            Show Mask Preview
          </label>
        </div>

        {error && <div style={{ color: "pink", fontSize: "11px", wordWrap: "break-word" }}>{error}</div>}
      </div>
    </RoundedPanel>
  );
});

CameraLiveView.displayName = "CameraLiveView";
