import { useEffect, useId, useRef, useState } from "react";
import { dateISO, monthDays, moveDate, moveMonth } from "./calendar";
import { Icon } from "./Icon";

const full = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeZone: "UTC" });
const short = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeZone: "UTC" });
const heading = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" });
const asDate = (value: string) => new Date(`${value}T12:00:00Z`);

export function DatePicker({ label, value, onChange, min, max, required = false }: {
  label: string; value: string; onChange: (value: string) => void; min?: string; max?: string; required?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [month, setMonth] = useState((value || dateISO(new Date())).slice(0, 7));
  const [cursor, setCursor] = useState(value);
  const id = useId();
  const allowed = (day: string) => (!min || day >= min) && (!max || day <= max);

  useEffect(() => {
    if (dialog.current?.open) dialog.current.querySelector<HTMLButtonElement>(`[data-date="${cursor}"]`)?.focus();
  }, [cursor, month]);

  function close() { dialog.current?.close(); trigger.current?.focus(); }
  function choose(day: string) { onChange(day); close(); }
  function open() {
    let day = value || dateISO(new Date());
    if (min && day < min) day = min;
    if (max && day > max) day = max;
    setMonth(day.slice(0, 7)); setCursor(day);
    dialog.current?.showModal();
    requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>(`[data-date="${day}"]`)?.focus());
  }

  return <div className="date-field">
    <button ref={trigger} type="button" className="date-trigger" aria-label={`${label}: ${value ? full.format(asDate(value)) : "не выбрана"}`}
      aria-haspopup="dialog" aria-controls={id} onClick={open}><span>{value ? short.format(asDate(value)) : "Выбрать дату"}</span><Icon name="calendar" /></button>
    <dialog id={id} ref={dialog} className="paper-dialog calendar-dialog" aria-labelledby={`${id}-title`}
      onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === dialog.current) close(); }}>
      <div className="dialog-content">
        <div className="dialog-heading"><h3 id={`${id}-title`}>{label}</h3><button type="button" onClick={close} aria-label="Закрыть календарь">×</button></div>
        <div className="calendar-heading">
          <button type="button" aria-label="Предыдущий месяц" disabled={!!min && month <= min.slice(0, 7)} onClick={() => setMonth(moveMonth(month, -1))}>←</button>
          <strong aria-live="polite">{heading.format(asDate(`${month}-01`))}</strong>
          <button type="button" aria-label="Следующий месяц" disabled={!!max && month >= max.slice(0, 7)} onClick={() => setMonth(moveMonth(month, 1))}>→</button>
        </div>
        <div className="calendar-week" aria-hidden="true">{["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map(day => <span key={day}>{day}</span>)}</div>
        <div className="calendar-days" role="group" aria-label="Дни месяца" onKeyDown={e => {
          const shifts: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
          if (!(e.key in shifts)) return;
          e.preventDefault();
          const next = moveDate(cursor || `${month}-01`, shifts[e.key]);
          if (allowed(next)) { setCursor(next); setMonth(next.slice(0, 7)); }
        }}>
          {monthDays(month).map(day => <button key={day} type="button" data-date={day} aria-label={full.format(asDate(day))}
            aria-pressed={day === value} aria-current={day === dateISO(new Date()) ? "date" : undefined}
            className={day.slice(0, 7) !== month ? "outside-month" : ""} disabled={!allowed(day)}
            tabIndex={day === cursor || (cursor.slice(0, 7) !== month && day === `${month}-01`) ? 0 : -1}
            onFocus={() => setCursor(day)} onClick={() => choose(day)}>{Number(day.slice(-2))}</button>)}
        </div>
        <div className="dialog-actions">
          <button type="button" disabled={!allowed(dateISO(new Date()))} onClick={() => choose(dateISO(new Date()))}>Сегодня</button>
          {!required && <button type="button" onClick={() => choose("")}>Сбросить</button>}
          <button type="button" onClick={close}>Отмена</button>
        </div>
      </div>
    </dialog>
  </div>;
}
