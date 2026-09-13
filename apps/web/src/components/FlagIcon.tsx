import type { SupportedLocale } from "@/lib/i18n/locale";

type Props = {
  locale: SupportedLocale | string;
  className?: string | undefined;
};

export function FlagIcon({ locale, className }: Props) {
  switch (locale) {
    case "ar":
      return (
        <svg
          viewBox="0 0 640 480"
          className={className}
          width="20"
          height="15"
          aria-hidden="true"
        >
          <rect width="640" height="480" fill="#006c35" />
          {/* Stylized Arabic Script */}
          <path
            d="M170 215c20-22 45-28 70-12 24 16 50-8 75-4 24 4 44-18 68-8 24 10 48-6 72 8m-275 32c18-14 42-4 66 6 24 10 48-8 72-4 24 4 44-14 68-4 24 10 48-8 68 6"
            stroke="#ffffff"
            strokeWidth="14"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M210 188v-22m50 22v-18m55 22v-26m55 26v-22m50 22v-18"
            stroke="#ffffff"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* Saudi Arabian Sword */}
          <path d="M185 330h270v13H185z" fill="#ffffff" />
          <path d="M455 321l28 15.5-28 15.5z" fill="#ffffff" />
          <path d="M212 316v41" stroke="#ffffff" strokeWidth="12" strokeLinecap="round" />
          <circle cx="175" cy="336.5" r="11" fill="#ffffff" />
        </svg>
      );

    case "en":
      return (
        <svg
          viewBox="0 0 640 480"
          className={className}
          width="20"
          height="15"
          aria-hidden="true"
        >
          <rect width="640" height="480" fill="#012169" />
          <path d="M0 0l640 480M640 0L0 480" stroke="#ffffff" strokeWidth="85" />
          <path d="M0 0l640 480M640 0L0 480" stroke="#C8102E" strokeWidth="34" />
          <path d="M320 0v480M0 240h640" stroke="#ffffff" strokeWidth="125" />
          <path d="M320 0v480M0 240h640" stroke="#C8102E" strokeWidth="75" />
        </svg>
      );

    case "zh":
      return (
        <svg
          viewBox="0 0 640 480"
          className={className}
          width="20"
          height="15"
          aria-hidden="true"
        >
          <rect width="640" height="480" fill="#de2910" />
          {/* Large star */}
          <polygon
            points="120,65 136,112 186,112 146,141 161,188 120,158 79,188 94,141 54,112 104,112"
            fill="#ffde00"
          />
          {/* 4 small arc stars */}
          <polygon points="215,65 220,77 232,77 222,85 226,97 215,90 204,97 208,85 198,77 210,77" fill="#ffde00" />
          <polygon points="255,105 260,117 272,117 262,125 266,137 255,130 244,137 248,125 238,117 250,117" fill="#ffde00" />
          <polygon points="255,165 260,177 272,177 262,185 266,197 255,190 244,197 248,185 238,177 250,177" fill="#ffde00" />
          <polygon points="215,205 220,217 232,217 222,225 226,237 215,230 204,237 208,225 198,217 210,217" fill="#ffde00" />
        </svg>
      );

    case "hi":
      return (
        <svg
          viewBox="0 0 640 480"
          className={className}
          width="20"
          height="15"
          aria-hidden="true"
        >
          <rect width="640" height="160" fill="#ff9933" />
          <rect y="160" width="640" height="160" fill="#ffffff" />
          <rect y="320" width="640" height="160" fill="#138808" />
          {/* Ashoka Chakra */}
          <circle cx="320" cy="240" r="54" fill="none" stroke="#000080" strokeWidth="8" />
          <circle cx="320" cy="240" r="16" fill="#000080" />
          <path
            d="M320 186v108M266 240h108M282 202l76 76M358 202l-76 76M298 190l44 100M342 190l-44 100M270 218l100 44M270 262l100-44"
            stroke="#000080"
            strokeWidth="4"
          />
        </svg>
      );

    case "es":
      return (
        <svg
          viewBox="0 0 640 480"
          className={className}
          width="20"
          height="15"
          aria-hidden="true"
        >
          <rect width="640" height="120" fill="#c60b1e" />
          <rect y="120" width="640" height="240" fill="#ffc400" />
          <rect y="360" width="640" height="120" fill="#c60b1e" />
          {/* Spanish Emblem */}
          <rect x="160" y="198" width="46" height="62" rx="10" fill="#c60b1e" />
          <rect x="166" y="204" width="34" height="50" rx="6" fill="#ffc400" />
          <circle cx="183" cy="188" r="10" fill="#c60b1e" />
          <path d="M148 198v62M218 198v62" stroke="#c60b1e" strokeWidth="6" strokeLinecap="round" />
        </svg>
      );

    case "fr":
      return (
        <svg
          viewBox="0 0 640 480"
          className={className}
          width="20"
          height="15"
          aria-hidden="true"
        >
          <rect width="213.3" height="480" fill="#002654" />
          <rect x="213.3" width="213.3" height="480" fill="#ffffff" />
          <rect x="426.6" width="213.4" height="480" fill="#ed2939" />
        </svg>
      );

    default:
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
  }
}
