'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import AdminLocation from '@/components/admin/AdminLocation';
import { Menu, X } from 'lucide-react';

export default function AdminShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); menuButton.current?.focus(); }
      if (event.key === 'Tab') {
        const elements = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open]);

  return <div className="flex h-[100dvh] overflow-hidden bg-gray-950">
    <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-800 bg-gray-950 px-4 lg:hidden">
      <button ref={menuButton} type="button" onClick={() => setOpen(true)} aria-label="管理メニューを開く" aria-expanded={open} className="rounded-lg p-2 text-white"><Menu size={22} /></button>
      <span className="font-display font-bold text-white">☕ LIMU喫茶 管理者</span>
    </header>
    <div className="hidden shrink-0 lg:block">{sidebar}</div>
    {open && <div ref={dialog} className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="管理メニュー">
      <button type="button" className="absolute inset-0 bg-black/60" aria-label="管理メニューを閉じる" onClick={() => setOpen(false)} />
      <div className="relative h-full w-72">
        <button ref={closeButton} type="button" onClick={() => { setOpen(false); menuButton.current?.focus(); }} aria-label="閉じる" className="absolute right-2 top-3 z-10 rounded-lg bg-gray-800 p-2 text-white"><X size={18} /></button>
        {sidebar}
      </div>
    </div>}
    <main id="admin-content" className="min-w-0 flex-1 overflow-y-auto pt-14 lg:pt-0">
      <div className="mx-auto max-w-7xl p-4 sm:p-6"><AdminLocation/>{children}</div>
    </main>
  </div>;
}
