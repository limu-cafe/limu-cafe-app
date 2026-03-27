export default function PendingPage() {
  return (
    <div className="min-h-screen texture-bg flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="font-display font-bold text-2xl text-espresso mb-2">
          承認待ちです
        </h1>
        <p className="text-espresso-400 text-sm leading-relaxed">
          管理者がアカウントを承認するまでお待ちください。<br />
          承認されたらSlackでお知らせします。
        </p>
      </div>
    </div>
  );
}
