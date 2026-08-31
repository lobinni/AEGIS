"use client";

import { useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { dismissToast, getToasts, subscribeToasts, type Toast } from "@/lib/toast";

const EMPTY: Toast[] = [];

/** Terminal-style toast stack — hard, visible states like the reference. */
export function Toasts() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, () => EMPTY);

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span className="toast-icon">
            {t.kind === "success" ? (
              <CheckCircle2 size={15} />
            ) : t.kind === "error" ? (
              <AlertTriangle size={15} />
            ) : (
              <Info size={15} />
            )}
          </span>
          <span className="toast-msg">{t.message}</span>
          <button
            type="button"
            className="toast-x"
            aria-label="Dismiss"
            onClick={() => dismissToast(t.id)}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
