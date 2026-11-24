'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export default function RecordDialog({ title, busy, onClose, children, wide = false, closeLabel = '立替入力を閉じる' }: {
  title: string; busy: boolean; onClose: () => void; children: ReactNode;
  wide?: boolean; closeLabel?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose), blocked = useRef(busy);
  close.current = onClose; blocked.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary') ?? [])
      .filter(element => element.getClientRects().length > 0);
    (panel.current?.querySelector<HTMLElement>('[data-autofocus]')??controls()[0])?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !blocked.current) { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const elements = controls(), first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus({ preventScroll: true }); };
  }, []);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-label={title} className={`max-h-[90dvh] w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} overflow-y-auto scroll-pt-24 scroll-pb-28 rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl`}>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-800 bg-gray-900 px-5 py-4"><h2 className="text-lg font-semibold text-white">{title}</h2><button type="button" disabled={busy} aria-label={closeLabel} onClick={onClose} className="rounded-lg px-3 py-2 text-gray-300 hover:bg-gray-800 disabled:opacity-40">✕</button></header>
      <div className="p-5">{children}</div>
    </div>
  </div>;
}
