"use client";

/** Logs out and wipes the local copies of the diary on this device. */
export function SignOut({ className = "btn ghost block" }: { className?: string }) {
  return (
    <form
      action="/auth/signout"
      method="post"
      onSubmit={() => {
        (window as any).__glSignedOut = true;
        try {
          Object.keys(localStorage).filter((k) => k.startsWith("gl.")).forEach((k) => localStorage.removeItem(k));
        } catch {}
      }}
    >
      <button className={className}>Esci</button>
    </form>
  );
}
