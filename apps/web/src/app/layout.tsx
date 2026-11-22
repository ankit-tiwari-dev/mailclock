import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Mailclock — open-source email scheduling", template: "%s · Mailclock" },
  description:
    "Schedule emails from your app, your terminal, or your AI agent over MCP. See what was scheduled, sent, retried, and failed. Self-host with just Postgres.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrument.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
