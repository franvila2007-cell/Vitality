import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Vitality',
    short_name: 'Vitality',
    description: 'Your daily coaching dashboard — macros, weight progress, habits, and Vitto.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8f7f3',
    theme_color: '#0b5f5e',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
