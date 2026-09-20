import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import { Archivo, IBM_Plex_Sans, IBM_Plex_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { IncomingChallengeWatcher } from "@/components/play/IncomingChallengeWatcher";
import { ActiveMatchBanner } from "@/components/game/ActiveMatchBanner";
import { TournamentReadyWatcher } from "@/components/tournaments/TournamentReadyWatcher";
import { AuthPopupProvider } from "@/lib/auth-popup-context";
import { AuthPopup, AuthPopupAutoOpen } from "@/components/auth/AuthPopup";
import { GoogleOneTap } from "@/components/auth/GoogleOneTap";
import { PolicyReacceptanceModal } from "@/components/legal/PolicyReacceptanceModal";
import { JsonLd } from "@/components/seo/JsonLd";
import { I18nProvider } from "@/lib/i18n/context";
import { SUPPORTED_LOCALE_CODES, DEFAULT_LOCALE, directionFor, isSupportedLocale } from "@/lib/i18n/locale";
import { RESOURCES } from "@/lib/i18n/resources";
import "../../styles/globals.css";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });
const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600", "700"], variable: "--font-plex-arabic", display: "swap" });

export function generateStaticParams() {
  return SUPPORTED_LOCALE_CODES.map((locale) => ({ locale }));
}

type MetaCopy = { title: string; description: string };

function metaFor(locale: string): MetaCopy {
  const resource = RESOURCES[locale as keyof typeof RESOURCES] as { meta?: MetaCopy } | undefined;
  return resource?.meta ?? (RESOURCES[DEFAULT_LOCALE] as { meta: MetaCopy }).meta;
}

const KEYWORDS_BY_LOCALE: Record<string, string[]> = {
  ar: [
    "العاب ذكاء اون لاين",
    "شطرنج اون لاين",
    "دومينو اون لاين",
    "طاولة زهر اون لاين",
    "بطولات ألعاب ذكاء",
    "مسابقات مهارية حقيقية",
    "تحديات 1 ضد 1",
    "جوائز نقدية حقيقية",
    "لعبة السيجة",
    "لعبة كونكت فور",
    "لعبة إكس أو التنافسية",
    "الحساب السريع",
    "نيزالو",
    "منصة نيزالو للألعاب المهارية",
  ],
  en: [
    "online skill games",
    "play chess online",
    "online dominoes tournaments",
    "backgammon competitive online",
    "esports board games",
    "cash tournaments skill",
    "real money skill games",
    "1v1 skill games",
    "speed math game",
    "connect four competitive",
    "Nizalo",
    "Nizalo esports",
  ],
  fr: [
    "jeux de compétence en ligne",
    "jouer aux échecs en ligne",
    "dominos en ligne",
    "tournois de jeux de plateau",
    "compétition e-sport en ligne",
    "Nizalo",
  ],
  es: [
    "juegos de habilidad en línea",
    "jugar ajedrez online",
    "dominó en línea",
    "backgammon competitivo",
    "torneos con premios en efectivo",
    "Nizalo",
  ],
  zh: [
    "在线技能游戏",
    "在线下棋",
    "国际象棋在线对战",
    "在线五子棋",
    "棋盘电竞锦标赛",
    "Nizalo",
  ],
  hi: [
    "ऑनलाइन कौशल खेल",
    "ऑनलाइन शतरंज खेलें",
    "ऑनलाइन डोमिनोज़",
    "कौशल प्रतियोगिताएं",
    "Nizalo",
  ],
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://nizalo.com";
const GOOGLE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || "google6712398471209384";
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const copy = metaFor(locale);
  const keywords = KEYWORDS_BY_LOCALE[locale] ?? KEYWORDS_BY_LOCALE.en;

  const languages: Record<string, string> = {
    ...Object.fromEntries(SUPPORTED_LOCALE_CODES.map((code) => [code, `${SITE_URL}/${code}`])),
    "x-default": `${SITE_URL}/en`,
  };

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: copy.title,
      template: `%s | Nizalo`,
    },
    description: copy.description,
    keywords,
    alternates: {
      canonical: `${SITE_URL}/${locale}`,
      languages,
    },
    openGraph: {
      type: "website",
      url: `${SITE_URL}/${locale}`,
      title: copy.title,
      description: copy.description,
      siteName: "Nizalo",
      locale: locale === "ar" ? "ar_SA" : locale === "en" ? "en_US" : locale,
      images: [
        {
          url: `${SITE_URL}/images/hero-showcase/showcase-chess-blitz.jpg`,
          width: 1200,
          height: 630,
          alt: copy.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
      images: [`${SITE_URL}/images/hero-showcase/showcase-chess-blitz.jpg`],
      creator: "@nizalo_app",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    verification: {
      google: GOOGLE_VERIFICATION,
    },
    category: "games",
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
  const copy = metaFor(locale);

  // Global Structured Data (JSON-LD) for Google Search Rich Results
  const websiteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Nizalo",
    alternateName: ["نزالو", "Nizalo Arena", "Nizalo Esports"],
    url: `${SITE_URL}/${locale}`,
    description: copy.description,
    inLanguage: locale,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/${locale}/games?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  const organizationLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Nizalo",
    alternateName: "منصة نيزالو للألعاب التنافسية",
    url: SITE_URL,
    logo: `${SITE_URL}/favicon.ico`,
    description: copy.description,
    sameAs: [
      "https://twitter.com/nizalo_app",
      "https://t.me/nizalo",
    ],
  };

  return (
    <html lang={locale} dir={dir} data-theme="dark" className={`${archivo.variable} ${plexSans.variable} ${plexMono.variable} ${plexArabic.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                localStorage.removeItem("nizalo-theme");
                document.documentElement.setAttribute("data-theme", "dark");
              } catch (e) {}
            `,
          }}
        />
        <link
          rel="preload"
          as="image"
          href="/images/hero-showcase/showcase-chess-blitz.webp"
          type="image/webp"
          fetchPriority="high"
        />
        <meta name="google-site-verification" content={GOOGLE_VERIFICATION} />
        <JsonLd data={websiteLd} />
        <JsonLd data={organizationLd} />
      </head>
      <body>
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}', { page_path: window.location.pathname });
              `}
            </Script>
          </>
        )}
        <I18nProvider locale={locale}>
          <AuthProvider>
            <AuthPopupProvider>
              {children}
              <ActiveMatchBanner />
              <IncomingChallengeWatcher />
              <TournamentReadyWatcher />
              <GoogleOneTap />
              <AuthPopup />
              <PolicyReacceptanceModal />
            </AuthPopupProvider>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

