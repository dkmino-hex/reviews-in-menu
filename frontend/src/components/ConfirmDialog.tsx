import { useEffect, useId, useRef } from "react";

export function ConfirmDialog({ title, text, confirm, cancel }: { title: string; text: string; confirm: () => void; cancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  return <dialog className="paper-dialog" ref={dialog} aria-labelledby={id} aria-describedby={`${id}-text`}
    onCancel={e => { e.preventDefault(); cancel(); }} onClick={e => { if (e.target === dialog.current) cancel(); }}>
    <div className="dialog-content">
      <h2 id={id}>{title}</h2><p id={`${id}-text`}>{text}</p>
      <div className="dialog-actions"><button type="button" autoFocus onClick={cancel}>Отмена</button><button type="button" onClick={confirm}>Подтвердить</button></div>
    </div>
  </dialog>;
}
