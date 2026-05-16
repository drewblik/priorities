import type { MetadataRoute } from 'next';

/** PWA manifest (Next metadata route → /manifest.webmanifest). M20:
 *  installable + standalone display; static-asset caching is handled by
 *  the service worker. No offline data (explicit v1 non-goal). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Priorities',
    short_name: 'Priorities',
    description: 'Your priorities, planned by their advocates.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#3b82f6',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
