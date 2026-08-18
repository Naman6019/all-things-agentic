import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TalentOS — Autonomous Opportunity Intelligence",
  description: "TalentOS by AllStackLabs. Autonomous dual-stream career and freelance client intelligence pipeline on Google Cloud & Vertex AI.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#080c0e] text-slate-100 antialiased selection:bg-emerald-500/20 selection:text-emerald-300">
        {children}
      </body>
    </html>
  );
}
