import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { SITE } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
};

/**
 * Embed mode, for TerritoryIQ shown inside the Frontier app (opened through /sso with embed=1): no sidebar and no
 * footer, so it reads as part of Frontier's screen. The flag is kept for the browser tab (sessionStorage), so links
 * inside TerritoryIQ stay embedded, and it runs before first paint so the sidebar never flashes. `?embed=0` turns it off.
 * It adds a <style> to <head> rather than an attribute on <html>, which React resets when it re-renders the root.
 */
const EMBED_SCRIPT = `try{var q=new URLSearchParams(location.search).get("embed");if(q==="1")sessionStorage.setItem("tiq-embed","1");if(q==="0")sessionStorage.removeItem("tiq-embed");if(sessionStorage.getItem("tiq-embed")==="1"){var s=document.createElement("style");s.setAttribute("data-tiq-embed","");s.textContent="[data-app-chrome]{display:none!important}";document.head.appendChild(s)}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: EMBED_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
