import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { ROLE_COOKIE, SUPABASE_ANON_KEY, SUPABASE_URL, parseRoleCookie } from "./lib/supabase/env";

// Pages that work without a session
const PUBLIC = [/^\/login/, /^\/auth\//, /^\/api\/health$/]; // /api/health: Apple Health import, uses its own token

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY)
    return new NextResponse("Configura NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY", { status: 500 });

  // keep the Supabase session fresh (cookies refreshed on the way in and out)
  let toSet: { name: string; value: string; options?: any }[] = [];
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        toSet = list;
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const finish = (res: NextResponse) => {
    toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
    return res;
  };
  const redirect = (path: string) => {
    const url = req.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    return finish(NextResponse.redirect(url));
  };

  if (PUBLIC.some((r) => r.test(pathname))) {
    if (user && pathname === "/login") return redirect("/");
    return finish(NextResponse.next({ request: req }));
  }

  if (!user) {
    if (pathname.startsWith("/api/")) return finish(NextResponse.json({ error: "Accesso richiesto" }, { status: 401 }));
    req.cookies.delete(ROLE_COOKIE);
    return redirect("/login");
  }

  // role, cached in a cookie (authorization itself is enforced by the API and by Row Level Security)
  let cached = parseRoleCookie(req.cookies.get(ROLE_COOKIE)?.value);
  let roleCookie: string | null = null;
  if (!cached || cached.userId !== user.id) {
    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!data) {
      // a user in Auth without a profile: nothing to show
      await supabase.auth.signOut();
      return redirect("/login");
    }
    cached = { role: data.role, userId: user.id };
    roleCookie = `${data.role}:${user.id}`;
    req.cookies.set(ROLE_COOKIE, roleCookie);
  }

  const isTrainerArea = pathname === "/trainer" || pathname.startsWith("/trainer/") || pathname.startsWith("/api/trainer/");
  if (!pathname.startsWith("/api/")) {
    if (cached.role === "trainer" && !isTrainerArea) return withRole(redirect("/trainer"), roleCookie);
    if (cached.role === "client" && isTrainerArea) return withRole(redirect("/"), roleCookie);
  } else if (isTrainerArea && cached.role !== "trainer") {
    return finish(NextResponse.json({ error: "Riservato al personal trainer" }, { status: 403 }));
  }
  return withRole(finish(NextResponse.next({ request: req })), roleCookie);
}

function withRole(res: NextResponse, value: string | null) {
  if (value) res.cookies.set(ROLE_COOKIE, value, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30 });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.webmanifest|apple-icon.png).*)"],
};
