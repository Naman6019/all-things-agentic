import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TalentOS — Opportunity Intelligence",
  description: "TalentOS by AllStackLabs. Autonomous opportunity intelligence and dual-stream career agent.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
