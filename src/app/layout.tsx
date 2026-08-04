import type { Metadata } from "next";
import { SessionProvider } from "@/lib/session/session-store";
import "./globals.css";

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
      <body suppressHydrationWarning>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
