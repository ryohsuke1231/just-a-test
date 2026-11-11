import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE_NAME } from "@/content/articles";

export const metadata: Metadata = {
  title: SITE_NAME,
  robots: { index: false, follow: false }, // 検索エンジンに載せない
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
