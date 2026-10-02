import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: "tripwire: an exit plan your keeper cannot break",
  description: "Write your MON sell lines once and sign with a passkey. Each sale is a stop or a target. A keeper sells only once MON reaches your line in the direction you chose, never below your floor, only to you, and the contract checks every sale.",
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = { themeColor: "#07080a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
