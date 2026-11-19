import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "CivicPulse · 시민 제보와 추적",
    template: "%s · CivicPulse",
  },
  description:
    "사진과 위치로 동네의 문제를 기록하고, 공개 여부를 직접 결정하고, 처리 과정을 함께 추적하는 시민 참여 프로토타입입니다.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f4ef",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
