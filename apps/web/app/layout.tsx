import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gallery Twin",
  description: "전시 공간 디지털 트윈",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
