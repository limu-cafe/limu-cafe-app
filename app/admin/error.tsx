'use client';

export default function AdminError({ reset }: { reset: () => void }) {
  return <div role="alert" className="space-y-4 rounded-2xl border border-amber-500/30 bg-gray-900 p-6 text-white">
    <h1 className="font-semibold">情報を読み込めませんでした</h1>
    <p className="text-sm text-gray-400">通信状態を確認して再読み込みしてください。</p>
    <button type="button" onClick={reset} className="rounded-lg bg-white px-4 py-2 text-sm text-gray-950">再読み込み</button>
  </div>;
}
