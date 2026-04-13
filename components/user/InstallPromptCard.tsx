'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { useUserLocale } from './UserLocaleProvider';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const STORAGE_KEY = 'limu-install-dismissed';

export default function InstallPromptCard() {
  const { locale } = useUserLocale();
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const copy =
    locale === 'en'
      ? {
          close: 'Close install prompt',
          kicker: 'Add to home screen',
          title: 'Open it like an app',
          description: 'Add it to your home screen so you can launch it faster next time.',
          action: 'Install',
        }
      : {
          close: 'インストール案内を閉じる',
          kicker: 'ホーム画面に追加',
          title: 'すぐ開けるようにできます',
          description: 'ホーム画面に追加すると、次回からアプリのように開けます。',
          action: 'インストールする',
        };

  useEffect(() => {
    const hasDismissed = window.localStorage.getItem(STORAGE_KEY) === '1';
    setDismissed(hasDismissed);
    const mobileQuery = window.matchMedia('(max-width: 767px)');

    const updateIsMobile = () => {
      setIsMobile(mobileQuery.matches);
    };

    updateIsMobile();

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setDismissed(hasDismissed);
    };

    mobileQuery.addEventListener('change', updateIsMobile);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      mobileQuery.removeEventListener('change', updateIsMobile);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const canShow = useMemo(() => isMobile && Boolean(promptEvent) && !dismissed, [dismissed, isMobile, promptEvent]);

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
        aria-label={copy.close}
      >
        <X size={16} />
      </button>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2 pr-8">
          <div className="section-kicker">
            <Smartphone size={12} />
            {copy.kicker}
          </div>
          <div>
            <p className="font-display text-2xl font-bold text-espresso">{copy.title}</p>
            <p className="mt-1 text-sm text-espresso-500">
              {copy.description}
            </p>
          </div>
        </div>
        <button type="button" onClick={handleInstall} className="btn-matcha flex items-center justify-center gap-2 px-5 py-3">
          <Download size={16} />
          {copy.action}
        </button>
      </div>
    </div>
  );
}
