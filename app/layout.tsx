import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "모두의 AI",
  description: "누구나 편하게 사용하는 AI 어시스턴트",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
