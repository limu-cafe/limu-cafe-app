'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';

/** Selection belongs to the URL, but changing it does not reload the collection. */
export function useObjectSelection(parameter: string, initial: string | null = null) {
  const searchParams = useSearchParams();
  const selectedId = searchParams.get(parameter) ?? initial;
  const select = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set(parameter, id); else url.searchParams.delete(parameter);
    if (url.href !== window.location.href) window.history.pushState(null, '', url);
  };
  return [selectedId, select] as const;
}

export default function ObjectWorkspace({ collection, detail, selected, label, onClose }: {
  collection: ReactNode; detail: ReactNode; selected: boolean; label: string; onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const wasSelected = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (selected && !wasSelected.current) returnFocus.current = document.activeElement as HTMLElement | null;
    if (selected && !wasSelected.current && window.matchMedia('(max-width: 1279px)').matches) {
      panel.current?.focus({ preventScroll: true });
      const main = document.getElementById('admin-content');
      if (main) main.scrollTop = 0;
    }
    if (!selected && wasSelected.current) returnFocus.current?.focus({ preventScroll: true });
    wasSelected.current = selected;
  }, [selected]);
  return <div className={`grid items-start gap-5 ${selected ? 'xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]' : 'mx-auto max-w-3xl'}`}>
    <div className={`min-w-0 ${selected ? 'hidden xl:block' : ''}`}>{collection}</div>
    {selected && <section ref={panel} tabIndex={-1} aria-label={label} className="min-w-0 rounded-2xl border border-gray-700 bg-gray-900 outline-hidden xl:sticky xl:top-6">
      <div className="flex items-center justify-between border-b border-gray-800 px-5 py-3">
        <span className="text-xs font-medium text-gray-400">{label}</span>
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-sky-400"><span className="xl:hidden">一覧に戻る</span><span className="hidden xl:inline">詳細を閉じる</span></button>
      </div>
      <div className="p-5">{detail}</div>
    </section>}
  </div>;
}
