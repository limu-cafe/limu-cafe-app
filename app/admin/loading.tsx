export default function AdminLoading() {
  return <div role="status" aria-label="ページを読み込み中" className="space-y-5 animate-pulse">
    <div className="h-8 w-40 rounded-lg bg-gray-800" />
    <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((key) => <div key={key} className="h-20 rounded-2xl bg-gray-900" />)}</div>
    <div className="h-48 rounded-2xl bg-gray-900" />
    <span className="sr-only">ページを読み込んでいます</span>
  </div>;
}
