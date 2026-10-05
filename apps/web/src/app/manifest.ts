import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nizalo - منصة نيزالو للرياضات الذهنية',
    short_name: 'نيزالو | Nizalo',
    description: 'المنصة العربية الأولى للألعاب الذهنية التنافسية. العب الشطرنج، الدومينو، اللودو، طاولة الزهر، الداما، والرياضيات السريعة.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#07090e',
    theme_color: '#ff6b00',
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/nizalo-favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
