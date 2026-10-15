import DeferredDataPlaceholder from '@/components/user/DeferredDataPlaceholder';

export default function Loading() {
  return <div role="status" aria-label="ページを読み込み中" className="mx-auto max-w-6xl px-4 py-8">
    <DeferredDataPlaceholder blocks={3} />
    <span className="sr-only">ページを読み込んでいます</span>
  </div>;
}
