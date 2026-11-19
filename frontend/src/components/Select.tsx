import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "./Icon";

type Option = { value: string; label: string; disabled?: boolean };

export function Select({ label, options, value, defaultValue = "", onChange, name, required = false, disabled = false }: {
  label: string; options: Option[]; value?: string; defaultValue?: string;
  onChange?: (value: string) => void; name?: string; required?: boolean; disabled?: boolean;
}) {
  const [internal, setInternal] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef({ text: "", time: 0 });
  const id = useId();
  const selected = value ?? internal;

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    setInternal(option.value);
    onChange?.(option.value);
    setInvalid(false);
    setOpen(false);
    trigger.current?.focus();
  }

  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    const enabled = options.map((o, i) => o.disabled ? -1 : i).filter(i => i >= 0);
    if (!enabled.length) return;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const current = enabled.indexOf(open ? active : options.findIndex(o => o.value === selected));
      const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 :
        Math.max(0, Math.min(enabled.length - 1, current + (event.key === "ArrowUp" ? -1 : 1)));
      setActive(enabled[next]);
      setOpen(true);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active);
      else { setActive(Math.max(0, options.findIndex(o => o.value === selected && !o.disabled))); setOpen(true); }
    } else if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      setOpen(false);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      search.current = { text: (now - search.current.time < 600 ? search.current.text : "") + event.key.toLocaleLowerCase("ru"), time: now };
      const found = enabled.find(i => options[i].label.toLocaleLowerCase("ru").startsWith(search.current.text));
      if (found !== undefined) { setActive(found); setOpen(true); }
    }
  }

  return <div className="select-field" ref={root}>
    <select className="select-native" name={name} value={selected} required={required} disabled={disabled} tabIndex={-1} aria-hidden="true"
      onChange={e => { setInternal(e.target.value); onChange?.(e.target.value); }}
      onInvalid={e => { e.preventDefault(); setInvalid(true); trigger.current?.focus(); }}>
      {options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
    <button type="button" className="select-trigger" ref={trigger} role="combobox" aria-label={label}
      aria-expanded={open} aria-controls={id} aria-haspopup="listbox" aria-required={required || undefined}
      aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined}
      aria-activedescendant={open ? `${id}-${active}` : undefined} disabled={disabled} onKeyDown={keyboard}
      onClick={() => { setActive(Math.max(0, options.findIndex(o => o.value === selected && !o.disabled))); setOpen(!open); }}>
      <span>{options.find(o => o.value === selected)?.label ?? "Выберите значение"}</span><Icon name="chevron" />
    </button>
    {open && <ul id={id} className="select-options" role="listbox" aria-label={label}>
      {options.map((option, index) => <li key={option.value} id={`${id}-${index}`} role="option"
        aria-selected={selected === option.value} aria-disabled={option.disabled || undefined}
        className={index === active ? "is-active" : ""} onPointerMove={() => { if (!option.disabled) setActive(index); }}
        onPointerDown={e => e.preventDefault()} onClick={() => choose(index)}>{option.label}<span aria-hidden="true">{selected === option.value ? "✓" : ""}</span></li>)}
    </ul>}
    {invalid && <small id={`${id}-error`} role="alert">Выберите значение</small>}
  </div>;
}
