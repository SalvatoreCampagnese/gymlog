"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { registerSW } from "@/lib/client/push";
import { useStore } from "@/lib/client/store";
import { IconFood, IconHistory, IconPlan, IconToday } from "./Icons";

const TABS = [
  { href: "/", label: "Oggi", Icon: IconToday },
  { href: "/scheda", label: "Scheda", Icon: IconPlan },
  { href: "/dieta", label: "Dieta", Icon: IconFood },
  { href: "/storico", label: "Progressi", Icon: IconHistory },
];

export function TabBar() {
  const path = usePathname();
  useEffect(() => {
    registerSW();
  }, []);
  if (path.startsWith("/allenamento") || path.startsWith("/login")) return null;
  return (
    <div className="tabbar">
      <nav>
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined}>
              <Icon />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function SyncBadge() {
  const { pending, online, syncError, syncNow } = useStore();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  if (!pending) return null;
  const failing = !!syncError;
  return (
    <div className="sync">
      <button
        className={`chip ${failing ? "warn" : ""}`}
        style={{ border: 0, cursor: "pointer", font: "inherit", fontSize: 13 }}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {busy ? "Sincronizzo…" : failing ? `${pending} modifiche non salvate` : "Salvataggio…"}
      </button>
      {open ? (
        <div className="sync-pop">
          <p className="small">
            {pending} modifiche sono salvate sul telefono ma non ancora sul server.
            {syncError ? <><br /><span className="faint">Motivo: {online ? syncError : "sei offline"}.</span></> : null}
          </p>
          <button
            className="btn primary sm block"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await syncNow();
              setBusy(false);
            }}
          >
            {busy ? "Sincronizzo…" : "Sincronizza ora"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
