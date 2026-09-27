import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nizalo - Play & Win',
    short_name: 'Nizalo',
    description: 'The ultimate board gaming platform. Play Chess, Dominoes, Baloot and more for real money.',
    start_url: '/',
    display: 'standalone',
    background_color: '#111827', // Tailwind gray-900
    theme_color: '#4F46E5', // Tailwind indigo-600
    icons: [
      {
        src: '/nizalo-favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      }
    ],
  };
}
