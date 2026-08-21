import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "TalentOS — Autonomous Opportunity Intelligence",
  description:
    "TalentOS. Autonomous dual-stream career and freelance client intelligence pipeline on Google Cloud & Vertex AI.",
  openGraph: {
    title: "TalentOS — Autonomous Opportunity Intelligence",
    description:
      "Autonomous dual-stream career and freelance client intelligence pipeline on Google Cloud & Vertex AI.",
    images: [{ url: "/brand/talentos-lockup.png", width: 1333, height: 276, alt: "TalentOS" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#090d10",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* App Router has no pages/_document; the rule below only applies to the
            Pages Router. Worth revisiting as next/font/google, which self-hosts
            the files at build time and removes this round trip entirely. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-surface-0 text-slate-100 antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
