type DeferredDataPlaceholderProps = {
  blocks?: number;
  titleWidthClassName?: string;
};

export default function DeferredDataPlaceholder({
  blocks = 3,
  titleWidthClassName = 'w-36',
}: DeferredDataPlaceholderProps) {
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="rounded-[28px] border border-cream-200 bg-white px-5 py-8 shadow-[0_18px_48px_-40px_rgba(44,26,14,0.28)]">
        <div className="flex items-center gap-3">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-espresso-200 border-t-espresso" />
          <div className={`h-4 animate-pulse rounded-full bg-cream-100 ${titleWidthClassName}`} />
        </div>
        <div className="mt-4 h-3 w-2/3 animate-pulse rounded-full bg-cream-100" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: blocks }).map((_, index) => (
          <div
            key={index}
            className="rounded-[28px] border border-cream-200 bg-white px-5 py-5 shadow-[0_18px_48px_-40px_rgba(44,26,14,0.2)]"
          >
            <div className="h-4 w-24 animate-pulse rounded-full bg-cream-100" />
            <div className="mt-4 h-8 w-2/3 animate-pulse rounded-full bg-cream-100" />
            <div className="mt-3 h-3 w-full animate-pulse rounded-full bg-cream-100" />
            <div className="mt-2 h-3 w-3/4 animate-pulse rounded-full bg-cream-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
