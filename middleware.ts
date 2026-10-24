import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authToken } from "./lib/auth";

export async function middleware(req: NextRequest) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/api/login")) return NextResponse.next();
  // Apple Health import from iOS Shortcuts: authenticated by its own token
  if (pathname === "/api/health") return NextResponse.next();
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && cookie === (await authToken(pw))) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.webmanifest|apple-icon.png).*)"],
};
