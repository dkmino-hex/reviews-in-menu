import { useEffect, useRef, useState, type ReactNode } from "react";

export function ScrollArea({ label, children }: { label: string; children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ left: 0, max: 0 });
  useEffect(() => {
    const element = viewport.current!;
    const update = () => setScroll({ left: element.scrollLeft, max: Math.max(0, element.scrollWidth - element.clientWidth) });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    element.addEventListener("scroll", update, { passive: true });
    update();
    return () => { observer.disconnect(); element.removeEventListener("scroll", update); };
  }, [children]);
  return <div className="scroll-area">
    <div className="scroll-viewport" ref={viewport} role="region" aria-label={label} tabIndex={0}>{children}</div>
    {scroll.max > 1 && <div className="scroll-controls">
      <span className="scroll-hint">Листайте в стороны</span>
      <input className="paper-scrollbar" type="range" min={0} max={scroll.max} step={1} value={Math.min(scroll.max, scroll.left)}
        aria-label={`Прокрутка: ${label}`} aria-valuetext={`${Math.round(scroll.left / scroll.max * 100)}%`}
        onChange={e => { viewport.current!.scrollLeft = Number(e.target.value); }} />
    </div>}
  </div>;
}
