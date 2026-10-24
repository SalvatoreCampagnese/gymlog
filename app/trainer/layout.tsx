import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignOut } from "@/components/SignOut";

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const { data: me } = user
    ? await sb.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle()
    : { data: null };
  return (
    <div className="trainer">
      <header className="trainer-bar">
        <Link href="/trainer" className="brand">
          GymLog <span className="muted">Personal</span>
        </Link>
        <div className="row" style={{ gap: 12 }}>
          {me ? <span className="muted small hide-sm">{`${me.first_name} ${me.last_name}`.trim()}</span> : null}
          <SignOut className="btn sm ghost" />
        </div>
      </header>
      {children}
    </div>
  );
}
