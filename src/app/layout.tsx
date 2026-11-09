import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { SyncProvider } from "@/components/SyncProvider";

export const metadata: Metadata = {
  title: "KubeCon Companion",
  description: "Plan your KubeCon: travel-aware schedule, live gap filling and hallway connections. Powered by Elasticsearch.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Nav />
        <SyncProvider />
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">{children}</main>
      </body>
    </html>
  );
}
