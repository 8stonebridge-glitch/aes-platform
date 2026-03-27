import type { Metadata } from "next";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "AES",
  description: "Artifact Execution System — Operator Console",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
