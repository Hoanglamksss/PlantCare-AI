import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Leaf, X } from 'lucide-react';

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon" aria-hidden="true"><Leaf size={21} strokeWidth={1.7} /></span>
      <span>PlantCare AI</span>
    </div>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return message ? <p className="notice notice-error" role="alert">{message}</p> : null;
}

export function Dialog({ title, busy, onDismiss, children }: {
  title: string;
  busy: boolean;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onDismiss();
      }}
    >
      <div className="dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button className="button button-plain close-button" aria-label="Đóng" disabled={busy} onClick={onDismiss}><X size={20} aria-hidden="true" /></button>
      </div>
      {children}
    </dialog>
  );
}
