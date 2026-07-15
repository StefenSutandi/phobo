import type { Metadata } from "next";
import localFont from "next/font/local";
import { SessionProvider } from "@/lib/session/session-store";
import "./globals.css";

const jomhuria = localFont({
  src: "../../public/fonts/jomhuria.woff2",
  weight: "400",
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
      <body className={jomhuria.className}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
