"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type ResultQrCodeProps = {
  value?: string;
};

export function ResultQrCode({ value }: ResultQrCodeProps) {
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    let isCancelled = false;

    async function generateQrCode() {
      if (!value) {
        setQrDataUrl("");
        return;
      }

      try {
        const nextQrDataUrl = await QRCode.toDataURL(value, {
          margin: 1,
          width: 384,
          color: {
            dark: "#000000",
            light: "#ffffff",
          },
        });

        if (!isCancelled) {
          setQrDataUrl(nextQrDataUrl);
        }
      } catch {
        if (!isCancelled) {
          setQrDataUrl("");
        }
      }
    }

    generateQrCode();

    return () => {
      isCancelled = true;
    };
  }, [value]);

  if (!qrDataUrl) {
    return null;
  }

  return <img src={qrDataUrl} alt="Result QR code" className="qr-image" />;
}
