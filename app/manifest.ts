import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LIMU喫茶',
    short_name: 'LIMU喫茶',
    description: '研究室のオンライン購買アプリ',
    start_url: '/',
    display: 'standalone',
    background_color: '#fdfaf5',
    theme_color: '#2c1a0e',
    icons: [
      {
        src: '/icon?size=192',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon?size=512',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
