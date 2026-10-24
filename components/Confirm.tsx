"use client";

/** Bottom-sheet confirmation used instead of the browser's confirm(). */
export function Confirm({
  title,
  body,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="sheet-backdrop" style={{ zIndex: 70 }} onClick={onCancel}>
      <div className="sheet stack" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2>{title}</h2>
        {body ? <div className="muted">{body}</div> : null}
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn ghost grow" onClick={onCancel}>Annulla</button>
          <button className={`btn grow ${danger ? "danger" : "go"}`} style={danger ? { background: "var(--red)", color: "#fff", border: 0 } : undefined} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
