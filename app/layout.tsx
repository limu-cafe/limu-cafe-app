import type { Metadata } from 'next';
import { Playfair_Display, Noto_Sans_JP, JetBrains_Mono } from 'next/font/google';
import '@/styles/globals.css';
import { Toaster } from 'react-hot-toast';

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});

const noto = Noto_Sans_JP({
  subsets: ['latin'],
  variable: '--font-noto',
  weight: ['300', '400', '500', '700'],
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'LIMU喫茶',
  description: '研究室のオンライン購買',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={`${playfair.variable} ${noto.variable} ${jetbrains.variable}`}>
      <body className="texture-bg min-h-screen">
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#2C1A0E',
              color: '#FDFAF5',
              borderRadius: '12px',
              fontFamily: 'Noto Sans JP, sans-serif',
            },
          }}
        />
      </body>
    </html>
  );
}
