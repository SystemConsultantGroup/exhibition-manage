import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "전시 관리자",
  description: "전시 플랫폼 관리자 페이지",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

