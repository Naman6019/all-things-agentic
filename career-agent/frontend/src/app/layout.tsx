import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Career Agent — Job Search Workspace",
  description: "Review matched roles, understand the evidence, and keep every application moving.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
