'use client';

import { useObjectSelection } from './ObjectWorkspace';

/** A detail view is subordinate to its selected object and survives a linked visit. */
export function useObjectDetailView(allowed: readonly string[]) {
  const [value, setValue] = useObjectSelection('view');
  return [value && allowed.includes(value) ? value : allowed[0], setValue] as const;
}

export default function ObjectDetailNavigation({ options, value, onChange }: {
  options: { id: string; label: string }[]; value: string; onChange: (value: string) => void;
}) {
  return <nav aria-label="選択した対象の情報" className="mt-5 flex flex-wrap gap-x-4 gap-y-1 border-b border-gray-700">
    {options.map(option => <button key={option.id} type="button" aria-current={value === option.id ? 'page' : undefined} onClick={() => onChange(option.id)} className={`border-b-2 px-1 py-3 text-sm ${value === option.id ? 'border-sky-300 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>{option.label}</button>)}
  </nav>;
}
