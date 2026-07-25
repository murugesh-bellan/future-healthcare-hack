import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Undertone",
  description: "The listening layer for chronic disease.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
