import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Archivo, IBM_Plex_Sans, IBM_Plex_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { IncomingChallengeWatcher } from "@/components/play/IncomingChallengeWatcher";
import { TournamentReadyWatcher } from "@/components/tournaments/TournamentReadyWatcher";
import { AuthPopupProvider } from "@/lib/auth-popup-context";
import { AuthPopup, AuthPopupAutoOpen } from "@/components/auth/AuthPopup";
import { PolicyReacceptanceModal } from "@/components/legal/PolicyReacceptanceModal";
import { I18nProvider } from "@/lib/i18n/context";
import { SUPPORTED_LOCALE_CODES, DEFAULT_LOCALE, directionFor, isSupportedLocale } from "@/lib/i18n/locale";
import { RESOURCES } from "@/lib/i18n/resources";
import "../../styles/globals.css";

// Self-hosted by Next.js at build time -- no runtime request to Google Fonts,
// per the brand guidelines' typography system (docs/brand/BRAND_GUIDELINES.md
// §5): Archivo for display, IBM Plex Sans for UI, IBM Plex Mono for every
// tabular figure (clocks, money, ratings), IBM Plex Sans Arabic as a real
// first-class face, never an auto-fallback.
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600", "700"], variable: "--font-plex-arabic", display: "swap" });

export function generateStaticParams() {
  return SUPPORTED_LOCALE_CODES.map((locale) => ({ locale }));
}

type MetaCopy = { title: string; description: string };

// Pulled from the same locale resources every component translates from
// (packages/i18n/locales/*.json, "meta" namespace) -- SEO title/description
// copy is real, hand-written per language, not derived from other in-page
// strings, but it lives in the one place that already has to stay complete
// for all ten locales (see packages/i18n's own "every locale has the same
// key set" test) rather than a second map that could silently fall behind.
function metaFor(locale: string): MetaCopy {
  const resource = RESOURCES[locale as keyof typeof RESOURCES] as { meta?: MetaCopy } | undefined;
  return resource?.meta ?? (RESOURCES[DEFAULT_LOCALE] as { meta: MetaCopy }).meta;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const copy = metaFor(locale);
  const languages = Object.fromEntries(SUPPORTED_LOCALE_CODES.map((code) => [code, `/${code}`]));
  return {
    title: copy.title,
    description: copy.description,
    alternates: { languages },
    openGraph: { title: copy.title, description: copy.description },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const dir = directionFor(locale);

  return (
    <html lang={locale} dir={dir} className={`${archivo.variable} ${plexSans.variable} ${plexMono.variable} ${plexArabic.variable}`}>
      <head>
        <link
          rel="preload"
          as="image"
          href="/images/hero-showcase/showcase-chess-blitz.webp"
          type="image/webp"
          fetchPriority="high"
        />
      </head>
      <body>
        <I18nProvider locale={locale}>
          <AuthProvider>
            <AuthPopupProvider>
              {children}
              <IncomingChallengeWatcher />
              <TournamentReadyWatcher />
              <AuthPopupAutoOpen />
              <AuthPopup />
              <PolicyReacceptanceModal />
            </AuthPopupProvider>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
