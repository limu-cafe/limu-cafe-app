'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const STORAGE_KEY = 'limu-install-dismissed';

export default function InstallPromptCard() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const hasDismissed = window.localStorage.getItem(STORAGE_KEY) === '1';
    setDismissed(hasDismissed);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setDismissed(hasDismissed);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const canShow = useMemo(() => Boolean(promptEvent) && !dismissed, [dismissed, promptEvent]);

  if (!canShow) return null;

  const handleInstall = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;

    if (choice.outcome === 'accepted') {
      setPromptEvent(null);
      setDismissed(true);
      window.localStorage.setItem(STORAGE_KEY, '1');
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    window.localStorage.setItem(STORAGE_KEY, '1');
  };

  return (
    <div className="soft-panel relative overflow-hidden">
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-3 top-3 rounded-full p-1 text-espresso-400 transition-colors hover:bg-white hover:text-espresso"
        aria-label="インストール案内を閉じる"
      >
        <X size={16} />
      </button>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2 pr-8">
          <div className="section-kicker">
            <Smartphone size={12} />
            ホーム画面に追加
          </div>
          <div>
            <p className="font-display text-2xl font-bold text-espresso">すぐ開けるようにできます</p>
            <p className="mt-1 text-sm text-espresso-500">
              ホーム画面に追加すると、次回からアプリのように開けます。
            </p>
          </div>
        </div>
        <button type="button" onClick={handleInstall} className="btn-matcha flex items-center justify-center gap-2 px-5 py-3">
          <Download size={16} />
          インストールする
        </button>
      </div>
    </div>
  );
}
