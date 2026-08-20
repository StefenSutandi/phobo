"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState, useRef } from "react";
import { CountdownTimer } from "./kiosk/CountdownTimer";
import type { FrameData } from "@/lib/phobo-data";
import { getBackgroundById } from "@/lib/phobo-data";
import type { StickerPlacement, CapturedPhoto } from "@/lib/session/session-types";
import { getPhotoDisplayUrl, getPhotoRawUrl, isValidImgSrc } from "@/lib/session/session-types";
import { useSessionStore } from "@/lib/session/session-store";

type KioskStageProps = {
  children: ReactNode;
  background?: "landing" | "main";
};

export function KioskStage({ children, background = "main" }: KioskStageProps) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function updateScale() {
      const padding = 36;
      const availableWidth = Math.max(window.innerWidth - padding, 1);
      const availableHeight = Math.max(window.innerHeight - padding, 1);
      setScale(Math.min(1, availableWidth / 750, availableHeight / 440));
    }

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  return (
    <main className="kiosk-shell">
      <section
        className={`kiosk-stage kiosk-stage--${background}`}
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </section>
    </main>
  );
}

type KioskButtonProps = {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  variant?: "orange" | "purple" | "brown";
  ariaLabel?: string;
};

export function KioskButton({
  children,
  href,
  onClick,
  disabled = false,
  className = "",
  style,
  variant = "purple",
  ariaLabel,
}: KioskButtonProps) {
  const classes = `kiosk-button kiosk-button--${variant} ${className}`.trim();

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        style={style}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        <span className="kiosk-button__label">{children}</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      style={style}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <span className="kiosk-button__label">{children}</span>
    </button>
  );
}

type RoundedPanelProps = {
  children?: ReactNode;
  className?: string;
  color?: "orange" | "brown" | "purple";
  style?: CSSProperties;
};

export function RoundedPanel({
  children,
  className = "",
  color = "orange",
  style,
}: RoundedPanelProps) {
  return (
    <div className={`rounded-panel rounded-panel--${color} ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

type PackageCardProps = {
  title: string;
  color: "orange" | "brown" | "purple";
  onSelect?: () => void;
};

export function PackageCard({ title, color, onSelect }: PackageCardProps) {
  return (
    <div className="package-column">
      <RoundedPanel color={color} className="package-card">
        <p className="package-title">{title}</p>
      </RoundedPanel>
      <KioskButton onClick={onSelect} variant={color} className="package-select">
        SELECT
      </KioskButton>
    </div>
  );
}

type QrScreenProps = {
  title: string;
  initialSeconds: number;
  completionText: string;
  onComplete?: () => void;
  nextHref?: string;
  qrContent?: ReactNode;
};

export function QrScreen({
  title,
  initialSeconds,
  completionText,
  onComplete,
  nextHref,
  qrContent,
}: QrScreenProps) {
  const [isComplete, setIsComplete] = useState(false);
  const content = (
    <>
      <h1 className="qr-title">{title}</h1>
      <div className="qr-box" aria-label={`${title} QR placeholder`}>
        {qrContent}
      </div>
      <p className="qr-timer">
        <CountdownTimer
          initialSeconds={initialSeconds}
          onComplete={() => {
            setIsComplete(true);
            onComplete?.();
          }}
        />
      </p>
      {isComplete && <p className="qr-status">{completionText}</p>}
    </>
  );

  if (!nextHref) {
    return content;
  }

  return (
    <Link href={nextHref} className="qr-link" aria-label={`${title}, continue`}>
      {content}
    </Link>
  );
}

type FrameGridScrollerProps = {
  frames: FrameData[];
  selectedFrameId?: string;
  onSelectFrame?: (frameId: string) => void;
};

export function FrameGridScroller({
  frames,
  selectedFrameId,
  onSelectFrame,
}: FrameGridScrollerProps) {

  return (
    <div className="frame-scroller" aria-label="Frame thumbnails">
      <div className="frame-grid">
        {frames.map((frame) => (
          <button
            type="button"
            className={`frame-choice ${selectedFrameId === frame.id ? "is-selected" : ""}`}
            key={frame.id}
            aria-label={`Select ${frame.name}`} aria-pressed={selectedFrameId === frame.id}
            onClick={() => onSelectFrame?.(frame.id)}
          >
            <img src={frame.templateUrl} alt="" className="frame-choice__image" />
            <span className="frame-choice__label">{frame.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function CameraPanel() {
  return (
    <RoundedPanel className="camera-panel">
      <div className="camera-live" aria-label="Camera preview placeholder" />
    </RoundedPanel>
  );
}

type BackgroundPickerProps = {
  backgrounds: { id: string; name: string; imageUrl?: string; color: string }[];
  selectedBackgroundId?: string;
  onSelectBackground?: (backgroundId: string) => void;
  disabled?: boolean;
};

export function BackgroundPicker({
  backgrounds,
  selectedBackgroundId,
  onSelectBackground,
  disabled = false,
}: BackgroundPickerProps) {
  return (
    <RoundedPanel className="background-picker">
      <p className="background-title">PILIH BACKGROUND</p>
      <div className="background-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", overflowY: "auto", padding: "10px" }}>
        {backgrounds.map((bg) => (
          <button
            type="button"
            className={`background-choice ${selectedBackgroundId === bg.id ? "is-selected" : ""}`}
            disabled={disabled}
            style={{ 
              width: "100%", 
              aspectRatio: "3/4", 
              borderRadius: "12px", 
              border: selectedBackgroundId === bg.id ? "4px solid #8e44ad" : "4px solid transparent",
              background: bg.imageUrl ? `url('${bg.imageUrl}') center/cover` : bg.color,
              padding: 0,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.75 : 1,
              transition: "opacity 0.2s, border 0.2s"
            }}
            key={bg.id}
            aria-label={bg.name}
            onClick={() => {
              if (!disabled) {
                onSelectBackground?.(bg.id);
              }
            }}
          />
        ))}
      </div>
    </RoundedPanel>
  );
}

export function StickerPicker({ stickers }: { stickers: string[] }) {
  const { addSticker } = useSessionStore();
  if (process.env.NEXT_PUBLIC_PHOBO_STICKERS_ENABLED === "false") return null;
  if (!stickers || stickers.length === 0) return null;

  return (
    <RoundedPanel className="sticker-picker">
      <p className="background-title" style={{ left: 0, width: "100%", fontSize: "clamp(16px, 3vw, 24px)" }}>PILIH STICKER</p>
      <div className="sticker-scroll">
        {stickers.map((src, i) => (
          <button
            key={i}
            onClick={() => addSticker({ src, x: 600, y: 900, width: 300, height: 300, rotation: 0, zIndex: Date.now() })}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
          >
            <img src={src} alt="sticker" style={{ width: '100%', height: 'auto', objectFit: 'contain' }} />
          </button>
        ))}
      </div>
    </RoundedPanel>
  );
}

type PreviewComposerProps = { 
  frame: FrameData; 
  photoUrls?: (CapturedPhoto | string)[]; 
  photoSlotAssignments?: (number | null)[];
  capturedPhotos?: CapturedPhoto[];
  selectedBackgroundId?: string;
  background?: any;
  onSlotClick?: (slotIndex: number) => void;
  activeSlotIndex?: number | null;
  dragOverSlotIndex?: number | null;
  onSlotPointerUp?: (slotIndex: number) => void;
};

export function PreviewComposer({ 
  frame, 
  photoUrls, 
  photoSlotAssignments, 
  capturedPhotos, 
  selectedBackgroundId, 
  background,
  onSlotClick,
  activeSlotIndex,
  dragOverSlotIndex,
  onSlotPointerUp,
}: PreviewComposerProps) {
    const { session, updateSticker, removeSticker } = useSessionStore();
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeStickerId, setActiveStickerId] = useState<string | null>(null);
    const [failedSlots, setFailedSlots] = useState<Record<number, boolean>>({});

    const handlePointerDown = (e: React.PointerEvent, id: string, type: 'drag' | 'resize' | 'rotate') => {
      e.preventDefault();
      setActiveStickerId(id);
      const sticker = session?.stickers.find(s => s.id === id);
      if (!sticker) return;
      
      const startX = e.clientX;
      const startY = e.clientY;
      const startStickerX = sticker.x;
      const startStickerY = sticker.y;
      const startWidth = sticker.width;
      const startRotation = sticker.rotation;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const scaleX = 1200 / rect.width;
        const scaleY = 1800 / rect.height;
        
        const dx = (moveEvent.clientX - startX) * scaleX;
        const dy = (moveEvent.clientY - startY) * scaleY;
        
        if (type === 'drag') {
          updateSticker(id, { x: startStickerX + dx, y: startStickerY + dy });
        } else if (type === 'resize') {
          // simple diagonal resize based on dx
          updateSticker(id, { width: Math.max(50, startWidth + dx) });
        } else if (type === 'rotate') {
          // simple rotation based on dx for simplicity
          updateSticker(id, { rotation: startRotation + dx / 5 });
        }
      };

      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    };

    return <RoundedPanel className="preview-composer"><div className="preview-frame" ref={containerRef} aria-label={`${frame.name} preview`} style={{ 
      aspectRatio: `${frame.width} / ${frame.height}`,
      width: frame.width >= frame.height ? '100%' : 'auto',
      height: frame.height >= frame.width ? '100%' : 'auto',
      position: 'relative'
    }}>
      {frame.photoSlots.map((photoSlot, index) => { 
        let photoItem: CapturedPhoto | string | null = null;

        if (Array.isArray(photoSlotAssignments) && photoSlotAssignments.length > index) {
          const assignedIdx = photoSlotAssignments[index];
          if (assignedIdx !== null && assignedIdx !== undefined && Array.isArray(capturedPhotos) && capturedPhotos[assignedIdx]) {
            photoItem = capturedPhotos[assignedIdx];
          }
        } else if (Array.isArray(photoUrls) && photoUrls.length > 0) {
          photoItem = photoUrls[index % photoUrls.length];
        }

        let slotBgId = selectedBackgroundId;
        if (photoItem && typeof photoItem === "object" && photoItem.backgroundId) {
          slotBgId = photoItem.backgroundId;
        }
        const slotBgObj = getBackgroundById(slotBgId) || background;

        const displayUrl = getPhotoDisplayUrl(photoItem);
        const activeSrc = isValidImgSrc(displayUrl) ? displayUrl : "";

        const slotRatio = photoSlot.width / photoSlot.height;
        const useContain = slotRatio < 0.8;
        const isSelected = activeSlotIndex === index;
        const isDragOver = dragOverSlotIndex === index;
        const isFailed = Boolean(failedSlots[index]);

        return (
          <div 
            className="preview-frame__slot" 
            key={`${photoSlot.x}-${photoSlot.y}-${index}`} 
            data-slot-index={index}
            onClick={() => onSlotClick && onSlotClick(index)}
            onPointerUp={() => onSlotPointerUp && onSlotPointerUp(index)}
            style={{
              zIndex: 2, 
              left:`${photoSlot.x/frame.width*100}%`,
              top:`${photoSlot.y/frame.height*100}%`,
              width:`${photoSlot.width/frame.width*100}%`,
              height:`${photoSlot.height/frame.height*100}%`,
              position:'absolute',
              transform:photoSlot.rotation?`rotate(${photoSlot.rotation}deg)`:undefined, 
              overflow: 'hidden',
              cursor: 'pointer',
              border: isDragOver 
                ? '3px solid #ffd700' 
                : isSelected 
                  ? '3px solid #00ffff' 
                  : '1px dashed rgba(255,255,255,0.4)',
              boxShadow: isDragOver 
                ? '0 0 15px #ffd700' 
                : isSelected 
                  ? '0 0 15px #00ffff' 
                  : 'none',
              transition: 'border 0.2s, box-shadow 0.2s'
            }}
          >
            {slotBgObj ? (
              slotBgObj.imageUrl ? (
                <img src={slotBgObj.imageUrl} alt="" style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }} />
              ) : (
                <div style={{ position: "absolute", width: "100%", height: "100%", backgroundColor: slotBgObj.color || "#d9d9d9", zIndex: 0 }} />
              )
            ) : background ? (
              background.imageUrl ? (
                <img src={background.imageUrl} alt="" style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }} />
              ) : (
                <div style={{ position: "absolute", width: "100%", height: "100%", backgroundColor: background.color || "#d9d9d9", zIndex: 0 }} />
              )
            ) : null}

            {isFailed ? (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.7)", color: "#ff6b6b", fontSize: "11px", fontWeight: "bold", textAlign: "center", padding: "6px", zIndex: 1 }}>
                <span style={{ fontSize: "18px", marginBottom: "4px" }}>⚠️</span>
                <span>PREVIEW FOTO GAGAL DIMUAT</span>
              </div>
            ) : activeSrc ? (
              <img 
                src={activeSrc} 
                alt={`Slot ${index + 1}`} 
                style={{ position: "absolute", width: "100%", height: "100%", objectFit: useContain ? "contain" : "cover", objectPosition: useContain ? "bottom" : "center", zIndex: 1 }} 
                onError={() => {
                  console.warn(`[PreviewComposer Diagnostics] Slot ${index} image failed to load. Display URL: ${displayUrl}`);
                  setFailedSlots(prev => ({ ...prev, [index]: true }));
                }}
              />
            ) : (
              <div style={{ position: "absolute", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", color: "#fff", fontSize: "12px", zIndex: 1, textShadow: "0 1px 2px #000" }}>
                <span style={{ fontSize: "20px" }}>📷</span>
                <span>Slot {index + 1}</span>
              </div>
            )}
            {(process.env.NEXT_PUBLIC_CAMERA_DEBUG === "true" || process.env.PHOBO_DEBUG_LOGS === "true") && (
              <div style={{position: "absolute", top: 0, left: 0, right: 0, bottom: 0, border: "2px solid red", zIndex: 3, pointerEvents: "none", color: "red", fontSize: "10px", padding: "2px"}}>
                Slot {index} | Mode: {useContain ? 'smart-cover' : 'cover'}<br/>
                Src: {activeSrc ? activeSrc.slice(0, 20) : "NONE"}<br/>
                Bg: {slotBgId}
              </div>
            )}
          </div>
        );
      })}
      <img src={frame.templateUrl} alt={frame.name} className="preview-frame__template" style={{ position: "absolute", zIndex: 10, pointerEvents: "none", width: "100%", height: "100%", top: 0, left: 0 }} />
      {session?.stickers.map(sticker => {
        const isActive = activeStickerId === sticker.id;
        return (
          <div key={sticker.id} style={{
            position: 'absolute',
            left: `${(sticker.x / 1200) * 100}%`,
            top: `${(sticker.y / 1800) * 100}%`,
            width: `${(sticker.width / 1200) * 100}%`,
            transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)`,
            zIndex: sticker.zIndex,
            border: isActive ? '3px dashed #00f' : 'none'
          }}>
            <img src={sticker.src} style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'none' }} onPointerDown={(e) => handlePointerDown(e, sticker.id, 'drag')} />
          </div>
        )
      })}
    </div>
    {activeStickerId && session?.stickers.find(s => s.id === activeStickerId) && (() => {
        const activeSticker = session.stickers.find(s => s.id === activeStickerId)!;
        const btnStyle = { width: '48px', height: '48px', borderRadius: '50%', background: '#8e44ad', color: 'white', border: 'none', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' };
        return (
          <div style={{ position: 'absolute', right: '-70px', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: '12px', zIndex: 100 }}>
            <button onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); updateSticker(activeStickerId, { width: Math.max(50, activeSticker.width - 50) }); }} style={btnStyle}>-</button>
            <button onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); updateSticker(activeStickerId, { width: activeSticker.width + 50 }); }} style={btnStyle}>+</button>
            <button onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); updateSticker(activeStickerId, { rotation: activeSticker.rotation - 15 }); }} style={btnStyle}>↺</button>
            <button onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); updateSticker(activeStickerId, { rotation: activeSticker.rotation + 15 }); }} style={btnStyle}>↻</button>
            <button onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); removeSticker(activeStickerId); setActiveStickerId(null); }} style={{...btnStyle, background: '#e74c3c'}}>🗑</button>
            <button onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setActiveStickerId(null); }} style={{...btnStyle, background: '#95a5a6', fontSize: '16px'}}>OK</button>
          </div>
        );
      })()}
  </RoundedPanel>;
  }

type PhotoResultStripProps = {
  photos?: (CapturedPhoto | string)[];
  selectedIndices?: number[];
  slotAssignments?: (number | null)[];
  selectedPhotoIndex?: number | null;
  selectedBackgroundId?: string;
  aspectRatio?: number;
  onTogglePhoto?: (index: number) => void;
  onPointerDownPhoto?: (e: React.PointerEvent, index: number) => void;
};

export function PhotoResultStrip({ 
  photos = [], 
  selectedIndices = [], 
  slotAssignments,
  selectedPhotoIndex,
  selectedBackgroundId,
  aspectRatio = 1.5,
  onTogglePhoto,
  onPointerDownPhoto,
}: PhotoResultStripProps) {
  const [failedThumbnails, setFailedThumbnails] = useState<Record<number, boolean>>({});
  const visiblePhotos = photos.length > 0 ? photos : Array.from({ length: 4 }, () => "");

  return (
    <RoundedPanel className="photo-strip">
      <p className="strip-title">HASIL FOTO</p>
      <div className="strip-scroll">
        {visiblePhotos.map((photoItem, index) => {
          const displayUrl = getPhotoDisplayUrl(photoItem);
          const activeSrc = isValidImgSrc(displayUrl) ? displayUrl : "";
          const isFailed = Boolean(failedThumbnails[index]);

          let bgId = selectedBackgroundId;
          if (photoItem && typeof photoItem === "object" && photoItem.backgroundId) {
            bgId = photoItem.backgroundId;
          }
          const bgObj = getBackgroundById(bgId);

          const slotIndex = Array.isArray(slotAssignments) ? slotAssignments.findIndex(a => a === index) : -1;
          const isSelected = selectedPhotoIndex === index || selectedIndices.includes(index);

          return (
            <button 
              type="button" 
              className={`strip-photo ${isSelected ? "is-selected" : ""}`} 
              key={`${index}-${typeof photoItem === 'string' ? photoItem : photoItem?.raw}`} 
              aria-label={`Photo result ${index + 1}`} 
              onClick={() => onTogglePhoto?.(index)}
              onPointerDown={(e) => onPointerDownPhoto?.(e, index)}
              style={{
                position: "relative",
                overflow: "hidden",
                width: "100%",
                aspectRatio: `${aspectRatio}`,
                borderRadius: "8px",
                border: isSelected ? "3px solid #00ffff" : "2px solid transparent",
                boxShadow: isSelected ? "0 0 10px #00ffff" : "none",
                touchAction: "pan-y",
                padding: 0,
                flexShrink: 0
              }}
            >
              {bgObj && (bgObj.imageUrl ? (
                <img src={bgObj.imageUrl} alt="" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }} />
              ) : (
                <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: bgObj.color || "#d9d9d9", zIndex: 0 }} />
              ))}

              {isFailed ? (
                <div style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(0,0,0,0.65)",
                  color: "#ff6b6b",
                  fontSize: "10px",
                  fontWeight: "bold",
                  textAlign: "center",
                  padding: "4px",
                  zIndex: 1
                }}>
                  <span style={{ fontSize: "14px", marginBottom: "2px" }}>⚠️</span>
                  <span>FOTO GAGAL DIMUAT</span>
                </div>
              ) : activeSrc ? (
                <img 
                  src={activeSrc} 
                  alt="" 
                  className="strip-photo__image" 
                  style={{ position: "relative", zIndex: 1, objectFit: "cover", width: "100%", height: "100%" }}
                  onError={() => {
                    console.warn(`[PhotoResultStrip Diagnostics] Thumbnail ${index} image failed to load. Display URL: ${displayUrl}`);
                    setFailedThumbnails(prev => ({ ...prev, [index]: true }));
                  }}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#333", color: "#aaa", fontSize: "14px", position: "relative", zIndex: 1 }}>
                  📷 {index + 1}
                </div>
              )}

              {slotIndex >= 0 && (
                <div style={{
                  position: "absolute",
                  top: "4px",
                  right: "4px",
                  backgroundColor: "#2ecc71",
                  color: "#ffffff",
                  fontWeight: "bold",
                  fontSize: "11px",
                  padding: "2px 6px",
                  borderRadius: "10px",
                  zIndex: 3,
                  boxShadow: "0 2px 4px rgba(0,0,0,0.6)"
                }}>
                  S{slotIndex + 1}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </RoundedPanel>
  );
}



type OptionalAssetProps = {
  src: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
};

export function OptionalAsset({ src, alt, className = "", fallback }: OptionalAssetProps) {
  const [missing, setMissing] = useState(false);

  if (missing) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setMissing(true)}
    />
  );
}

export function LandingBrand() {
  return (
    <div className="landing-brand" aria-hidden="true">
      <Image
        src="/assets/figma/illustrations/opening.png"
        alt=""
        width={2381}
        height={1501}
        priority
        sizes="560px"
        className="landing-brand__image"
      />
    </div>
  );
}
