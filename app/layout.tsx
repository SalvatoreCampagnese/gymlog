import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { ROLE_COOKIE, parseRoleCookie } from "@/lib/supabase/env";
import { StoreProvider } from "@/lib/client/store";
import { TabBar, SyncBadge } from "@/components/Nav";

export const metadata: Metadata = {
  title: "GymLog",
  description: "Schede, allenamenti e dieta del personal",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "GymLog", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1b2531",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // set by the middleware: the client app (diary, offline queue, tab bar) only for clients
  const who = parseRoleCookie((await cookies()).get(ROLE_COOKIE)?.value);
  return (
    <html lang="it">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        {who?.role === "client" ? (
          <StoreProvider userId={who.userId}>
            <SyncBadge />
            {children}
            <TabBar />
          </StoreProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
