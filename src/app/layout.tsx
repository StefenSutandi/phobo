import type { Metadata } from "next";
import { Jomhuria } from "next/font/google";
import "./globals.css";

const jomhuria = Jomhuria({
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Phobo Photobox Kiosk",
  description: "Next-generation photobox kiosk system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={jomhuria.className}>{children}</body>
    </html>
  );
}
