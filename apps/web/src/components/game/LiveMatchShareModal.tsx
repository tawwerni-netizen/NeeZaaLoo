"use client";

import React, { useState, useMemo } from "react";
import { useI18n } from "@/lib/i18n/context";
import styles from "./LiveMatchShareModal.module.css";

export type SupportedShareLang = "ar" | "en" | "es" | "fr" | "hi" | "zh";

interface LiveMatchShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  duelId: string;
  gameId?: string | undefined;
  gameName?: string | undefined;
  player1?: string | undefined;
  player2?: string | undefined;
}

const LANG_CONFIG: Record<
  SupportedShareLang,
  { label: string; dir: "rtl" | "ltr"; template: (g: string, p1: string, p2: string, url: string) => string }
> = {
  ar: {
    label: "العربية",
    dir: "rtl",
    template: (g, p1, p2, url) =>
      `⚔️ شاهد نزال ${g} المباشر الآن على منصة نيزالو!\nالمواجهة المشتعلة بين ${p1} و ${p2} 🔥 ادخل وشاهد البث المباشر فوراً:\n${url}`,
  },
  en: {
    label: "English",
    dir: "ltr",
    template: (g, p1, p2, url) =>
      `⚔️ Watch the live ${g} duel right now on Nizalo!\nEpic clash between ${p1} and ${p2} 🔥 Join to spectate live:\n${url}`,
  },
  es: {
    label: "Español",
    dir: "ltr",
    template: (g, p1, p2, url) =>
      `⚔️ ¡Mira el duelo en vivo de ${g} ahora en Nizalo!\nÉpico enfrentamiento entre ${p1} y ${p2} 🔥 Únete a ver la transmisión en directo:\n${url}`,
  },
  fr: {
    label: "Français",
    dir: "ltr",
    template: (g, p1, p2, url) =>
      `⚔️ Regardez le duel en direct de ${g} sur Nizalo !\nAffrontement épique entre ${p1} et ${p2} 🔥 Rejoignez le stream en direct :\n${url}`,
  },
  hi: {
    label: "हिन्दी",
    dir: "ltr",
    template: (g, p1, p2, url) =>
      `⚔️ निज़ालो पर अभी ${g} का लाइव मुकाबला देखें!\n${p1} और ${p2} के बीच रोमांचक टक्कर 🔥 लाइव देखने के लिए जुड़ें:\n${url}`,
  },
  zh: {
    label: "中文",
    dir: "ltr",
    template: (g, p1, p2, url) =>
      `⚔️ 立即在 Nizalo 观看 ${g} 实时对决！\n${p1} 对决 ${p2} 的巅峰对局 🔥 立即进入实时观战：\n${url}`,
  },
};

const GAME_EMOJIS: Record<string, string> = {
  chess: "♟️",
  dominoes: "🀄",
  ludo: "🎲",
  backgammon: "🎲",
  checkers: "⚪",
  "connect-four": "🔴",
  xo: "⚔️",
  "speed-math": "⚡",
  reversi: "⚫",
  gomoku: "⭕",
  seega: "🏜️",
};

const SHARE_MODAL_I18N: Record<string, Record<string, string>> = {
  title: {
    ar: "مشاركة البث المباشر للنزال",
    en: "Share Live Match Stream",
    es: "Compartir Transmisión en Vivo",
    fr: "Partager le Stream en Direct",
    hi: "लाइव मैच स्ट्रीम साझा करें",
    zh: "分享实时对战直播",
  },
  subtitle: {
    ar: "ادعُ أصدقاءك ومتابعيك لمشاهدة المباراة مباشرة بلحظتها",
    en: "Invite friends to spectate this live clash in real time",
    es: "Invita amigos a presenciar este duelo en tiempo real",
    fr: "Invitez des amis à regarder ce duel en direct et en temps réel",
    hi: "वास्तविक समय में इस लाइव मुकाबले को देखने के लिए दोस्तों को आमंत्रित करें",
    zh: "邀请好友与粉丝进入直播间，实时围观巅峰对决",
  },
  liveNow: {
    ar: "مباشر الآن",
    en: "LIVE NOW",
    es: "EN VIVO",
    fr: "EN DIRECT",
    hi: "लाइव अभी",
    zh: "正在直播",
  },
  langLabel: {
    ar: "اختر لغة رسالة الدعوة:",
    en: "Select invite message language:",
    es: "Idioma del mensaje de invitación:",
    fr: "Langue du message d'invitation :",
    hi: "निमंत्रण संदेश की भाषा चुनें:",
    zh: "选择邀请函文案语言：",
  },
  copied: {
    ar: "✓ تم النسخ!",
    en: "✓ Copied!",
    es: "✓ ¡Copiado!",
    fr: "✓ Copié !",
    hi: "✓ कॉपी किया गया!",
    zh: "✓ 已复制！",
  },
  copyLink: {
    ar: "نسخ الرابط",
    en: "Copy Link",
    es: "Copiar Enlace",
    fr: "Copier le Lien",
    hi: "लिंक कॉपी करें",
    zh: "复制链接",
  },
};

export function LiveMatchShareModal({
  isOpen,
  onClose,
  duelId,
  gameId = "game",
  gameName,
  player1 = "Player 1",
  player2 = "Player 2",
}: LiveMatchShareModalProps) {
  const { locale, dir } = useI18n();
  const isRtl = dir === "rtl";

  const initialLang: SupportedShareLang =
    locale === "ar" || locale === "es" || locale === "fr" || locale === "hi" || locale === "zh"
      ? (locale as SupportedShareLang)
      : "en";

  const [selectedLang, setSelectedLang] = useState<SupportedShareLang>(initialLang);
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return `https://nizalo.com/${locale}/r/${duelId}`;
    return `${window.location.origin}/${locale}/r/${duelId}`;
  }, [locale, duelId]);

  const displayName = gameName || gameId.toUpperCase();
  const gameEmoji = GAME_EMOJIS[gameId.toLowerCase()] || "🎮";

  const shareText = useMemo(() => {
    const cfg = LANG_CONFIG[selectedLang] || LANG_CONFIG.en;
    return cfg.template(displayName, player1, player2, shareUrl);
  }, [selectedLang, displayName, player1, player2, shareUrl]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const openWhatsApp = () => {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, "_blank");
  };

  const openTelegram = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, "_blank");
  };

  const openTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, "_blank");
  };

  const openFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, "_blank");
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        dir={isRtl ? "rtl" : "ltr"}
      >
        {/* Header */}
        <div className={styles.headerRow}>
          <div className={styles.titleGroup}>
            <div className={styles.shareIconPulse}>📡</div>
            <div>
              <h3 className={styles.modalTitle}>
                {SHARE_MODAL_I18N.title?.[locale] || SHARE_MODAL_I18N.title?.en}
              </h3>
              <p className={styles.modalSubtitle}>
                {SHARE_MODAL_I18N.subtitle?.[locale] || SHARE_MODAL_I18N.subtitle?.en}
              </p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Match Summary Card */}
        <div className={styles.matchSummaryCard}>
          <div className={styles.matchGameBadge}>
            <span className={styles.gameIcon}>{gameEmoji}</span>
            <div>
              <div className={styles.gameTitle}>{displayName}</div>
              <div className={styles.playersVs}>
                <span>{player1}</span>
                <span className={styles.vsBadge}>VS</span>
                <span>{player2}</span>
              </div>
            </div>
          </div>
          <span className={styles.liveTag}>
            <span className={styles.liveDot} />
            {SHARE_MODAL_I18N.liveNow?.[locale] || SHARE_MODAL_I18N.liveNow?.en}
          </span>
        </div>

        {/* Language Tabs */}
        <div className={styles.langSelectorRow}>
          <span className={styles.langLabel}>
            {SHARE_MODAL_I18N.langLabel?.[locale] || SHARE_MODAL_I18N.langLabel?.en}
          </span>
          <div className={styles.langTabs} dir="ltr">
            {(Object.keys(LANG_CONFIG) as SupportedShareLang[]).map((lang) => (
              <button
                key={lang}
                type="button"
                className={`${styles.langTab} ${selectedLang === lang ? styles.langTabActive : ""}`}
                onClick={() => setSelectedLang(lang)}
              >
                {LANG_CONFIG[lang].label}
              </button>
            ))}
          </div>
        </div>

        {/* Live Message Preview */}
        <div
          className={styles.messagePreviewBox}
          dir={LANG_CONFIG[selectedLang]?.dir || "ltr"}
        >
          {shareText}
        </div>

        {/* 1-Click Social Grid */}
        <div className={styles.socialGrid} dir="ltr">
          <button type="button" className={`${styles.socialBtn} ${styles.btnWhatsapp}`} onClick={openWhatsApp}>
            <span>💬</span>
            <span>WhatsApp</span>
          </button>
          <button type="button" className={`${styles.socialBtn} ${styles.btnTelegram}`} onClick={openTelegram}>
            <span>✈️</span>
            <span>Telegram</span>
          </button>
          <button type="button" className={`${styles.socialBtn} ${styles.btnTwitter}`} onClick={openTwitter}>
            <span>𝕏</span>
            <span>X / Twitter</span>
          </button>
          <button type="button" className={`${styles.socialBtn} ${styles.btnFacebook}`} onClick={openFacebook}>
            <span>🌐</span>
            <span>Facebook</span>
          </button>
        </div>

        {/* Copy Link Row */}
        <div className={styles.copyLinkRow} dir="ltr">
          <input type="text" readOnly value={shareUrl} className={styles.urlInput} />
          <button
            type="button"
            className={`${styles.copyBtn} ${copied ? styles.copyBtnCopied : ""}`}
            onClick={handleCopyLink}
          >
            {copied
              ? (SHARE_MODAL_I18N.copied?.[locale] || SHARE_MODAL_I18N.copied?.en)
              : (SHARE_MODAL_I18N.copyLink?.[locale] || SHARE_MODAL_I18N.copyLink?.en)}
          </button>
        </div>
      </div>
    </div>
  );
}
