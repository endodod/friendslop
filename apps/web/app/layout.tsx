import type { Metadata, Viewport } from "next";
import "@fontsource/lilita-one";
import "@fontsource-variable/inter";
import "./globals.css";
import { BRANDING } from "@party-game/shared";

export const metadata: Metadata = {
  title: BRANDING.name,
  description: BRANDING.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d0b1a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
