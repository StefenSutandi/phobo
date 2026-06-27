"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { CountdownTimer } from "./kiosk/CountdownTimer";
import type { FrameData } from "@/lib/phobo-data";

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
      setScale(Math.min(availableWidth / 750, availableHeight / 440));
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
  backgrounds?: string[];
  selectedBackgroundId?: string;
  onSelectBackground?: (backgroundId: string) => void;
};

export function BackgroundPicker({
  backgrounds = Array.from({ length: 16 }, (_, index) => `background-${index + 1}`),
  selectedBackgroundId,
  onSelectBackground,
}: BackgroundPickerProps) {
  return (
    <RoundedPanel className="background-picker">
      <p className="background-title">PILIH BACKGROUND</p>
      <div className="background-grid">
        {backgrounds.map((backgroundId) => (
          <button
            type="button"
            className={`background-choice ${selectedBackgroundId === backgroundId ? "is-selected" : ""}`}
            key={backgroundId}
            aria-label={backgroundId}
            onClick={() => onSelectBackground?.(backgroundId)}
          />
        ))}
      </div>
    </RoundedPanel>
  );
}

type PreviewComposerProps = { frame: FrameData; photoUrls: string[] };

export function PreviewComposer({ frame, photoUrls }: PreviewComposerProps) {
    return <RoundedPanel className="preview-composer"><div className="preview-frame" aria-label={`${frame.name} preview`}>
      {frame.photoSlots.map((photoSlot,index) => { const photoUrl=photoUrls[index % Math.max(1, photoUrls.length)]; return <div className="preview-frame__slot" key={`${photoSlot.x}-${photoSlot.y}-${index}`} style={{zIndex: 1, left:`${photoSlot.x/frame.width*100}%`,top:`${photoSlot.y/frame.height*100}%`,width:`${photoSlot.width/frame.width*100}%`,height:`${photoSlot.height/frame.height*100}%`,transform:photoSlot.rotation?`rotate(${photoSlot.rotation}deg)`:undefined}}>{photoUrl&&<img src={photoUrl} alt={`Selected photo ${(index%Math.max(1, photoUrls.length))+1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}</div>;})}
      <img src={frame.templateUrl} alt={frame.name} className="preview-frame__template" style={{ position: "relative", zIndex: 10, pointerEvents: "none" }} />
    </div></RoundedPanel>;
  }
type PhotoResultStripProps = {
  photos?: string[];
  selectedIndices?: number[];
  onTogglePhoto?: (index: number) => void;
};

export function PhotoResultStrip({ photos = [], selectedIndices = [], onTogglePhoto }: PhotoResultStripProps) {
  const visiblePhotos = photos.length > 0 ? photos : Array.from({ length: 4 }, () => "");

  return (
    <RoundedPanel className="photo-strip">
      <p className="strip-title">HASIL FOTO</p>
      <div className="strip-scroll">
        {visiblePhotos.map((photoUrl, index) => (
          <button type="button" className={`strip-photo ${selectedIndices.includes(index) ? "is-selected" : ""}`} key={`${photoUrl}-${index}`} aria-label={`Photo result ${index + 1}`} onClick={() => onTogglePhoto?.(index)}>
            {photoUrl && <img src={photoUrl} alt="" className="strip-photo__image" />}
          </button>
        ))}
      </div>
    </RoundedPanel>
  );
}

export function StickerPicker({ selectedStickerId, onSelectSticker }: { selectedStickerId?: string; onSelectSticker?: (id: string) => void }) {
  return (
    <RoundedPanel className="sticker-picker">
      <p className="sticker-title">STICKER</p>
      <div className="sticker-scroll">
        {Array.from({ length: 16 }, (_, index) => (
          <button type="button" className={`sticker-choice ${selectedStickerId === `sticker-${index + 1}` ? "is-selected" : ""}`} key={index} aria-label={`Sticker ${index + 1}`} onClick={() => onSelectSticker?.(`sticker-${index + 1}`)} />
        ))}
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
        src="/assets/brand/phobo-hero-clean.png"
        alt=""
        fill
        priority
        sizes="508px"
        className="landing-brand__image"
      />
    </div>
  );
}
