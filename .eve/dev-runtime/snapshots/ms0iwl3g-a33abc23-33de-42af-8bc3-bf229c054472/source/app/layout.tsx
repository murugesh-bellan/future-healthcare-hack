import type { Metadata, Viewport } from "next";
import "./styles.css";
import { AnonAuthProvider } from "@/components/AnonAuthProvider";

export const metadata: Metadata = {
  title: "Undertone",
  description: "The listening layer for chronic disease.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AnonAuthProvider>{children}</AnonAuthProvider>
      </body>
    </html>
  );
}
