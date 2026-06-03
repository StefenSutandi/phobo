"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { CountdownTimer } from "./kiosk/CountdownTimer";

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
  className?: string;
  style?: CSSProperties;
  variant?: "orange" | "purple" | "brown";
  ariaLabel?: string;
};

export function KioskButton({
  children,
  href,
  onClick,
  className = "",
  style,
  variant = "purple",
  ariaLabel,
}: KioskButtonProps) {
  const classes = `kiosk-button kiosk-button--${variant} ${className}`.trim();

  if (href) {
    return (
      <Link href={href} className={classes} style={style} aria-label={ariaLabel}>
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
  href: string;
};

export function PackageCard({ title, color, href }: PackageCardProps) {
  return (
    <div className="package-column">
      <RoundedPanel color={color} className="package-card">
        <p className="package-title">{title}</p>
      </RoundedPanel>
      <KioskButton href={href} variant={color} className="package-select">
        SELECT
      </KioskButton>
    </div>
  );
}

type QrScreenProps = {
  title: string;
  initialSeconds: number;
  completionText: string;
  nextHref?: string;
};

export function QrScreen({
  title,
  initialSeconds,
  completionText,
  nextHref,
}: QrScreenProps) {
  const [isComplete, setIsComplete] = useState(false);
  const content = (
    <>
      <h1 className="qr-title">{title}</h1>
      <div className="qr-box" aria-label={`${title} QR placeholder`} />
      <p className="qr-timer">
        <CountdownTimer
          initialSeconds={initialSeconds}
          onComplete={() => setIsComplete(true)}
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

export function FrameGridScroller() {
  const frames = Array.from({ length: 18 }, (_, index) => index + 1);

  return (
    <div className="frame-scroller" aria-label="Frame thumbnails">
      <div className="frame-grid">
        {frames.map((frame) => (
          <button type="button" className="frame-choice" key={frame} aria-label={`Frame ${frame}`}>
            <span className="frame-choice__top" />
            <span className="frame-choice__bottom" />
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

export function BackgroundPicker() {
  return (
    <RoundedPanel className="background-picker">
      <p className="background-title">PILIH BACKGROUND</p>
      <div className="background-grid">
        {Array.from({ length: 16 }, (_, index) => (
          <button type="button" className="background-choice" key={index} aria-label={`Background ${index + 1}`} />
        ))}
      </div>
    </RoundedPanel>
  );
}

export function PreviewComposer() {
  return (
    <RoundedPanel className="preview-composer">
      <div className="preview-frame" aria-label="Frame preview placeholder" />
    </RoundedPanel>
  );
}

export function PhotoResultStrip() {
  return (
    <RoundedPanel className="photo-strip">
      <p className="strip-title">HASIL FOTO</p>
      <div className="strip-scroll">
        {Array.from({ length: 8 }, (_, index) => (
          <button type="button" className="strip-photo" key={index} aria-label={`Photo result ${index + 1}`} />
        ))}
      </div>
    </RoundedPanel>
  );
}

export function StickerPicker() {
  return (
    <RoundedPanel className="sticker-picker">
      <p className="sticker-title">STICKER</p>
      <div className="sticker-scroll">
        {Array.from({ length: 16 }, (_, index) => (
          <button type="button" className="sticker-choice" key={index} aria-label={`Sticker ${index + 1}`} />
        ))}
      </div>
    </RoundedPanel>
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
