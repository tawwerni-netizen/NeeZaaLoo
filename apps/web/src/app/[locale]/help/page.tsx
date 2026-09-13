"use client";

import { useEffect, useState, useMemo } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { useAuth } from "@/lib/auth-context";
import { useAuthPopup } from "@/lib/auth-popup-context";
import { useI18n } from "@/lib/i18n/context";
import { get, post, ApiError } from "@/lib/api";
import styles from "./help.module.css";

type SupportConfig = {
  ok: boolean;
  phone: string;
  email: string;
  updated_at?: string;
};

type LegalPolicy = {
  identifier: string;
  version: string;
  title: string;
  is_mandatory: boolean;
  effective_at: string;
};

type FAQItem = {
  id: string;
  category: string;
  question: string;
  answer: string;
  tags: string[];
};

const FAQ_DATABASE: FAQItem[] = [
  // 1. Account
  {
    id: "acc-1",
    category: "account",
    question: "How do I create and verify my Nizalo account?",
    answer: "You can create an account using a unique nickname and a strong password (at least 10 characters), or connect via Google OAuth. Every account is assigned a permanent player ID. To maintain platform integrity, only one account per person is permitted.",
    tags: ["register", "signup", "verification", "identity", "create account"]
  },
  {
    id: "acc-2",
    category: "account",
    question: "Can I change my nickname or profile details?",
    answer: "You can update your profile avatar and settings from the Profile page. Nicknames are unique platform identifiers and are permanently tied to your competitive match history, ratings, and referral code.",
    tags: ["nickname", "handle", "profile", "settings"]
  },
  {
    id: "acc-3",
    category: "account",
    question: "How do I recover access if I forgot my password?",
    answer: "On the login screen, click 'Forgot password?' or select 'Email me a 6-character code'. If your email is registered, you will receive a secure one-time verification link or code to reset your credentials. If you lose access to both your email and password, contact support.",
    tags: ["forgot password", "password reset", "recovery", "email code"]
  },

  // 2. Login
  {
    id: "login-1",
    category: "login",
    question: "What should I do if my account is locked after failed login attempts?",
    answer: "For your protection, our security engine automatically locks login attempts after consecutive invalid password submissions. Wait 5 to 10 minutes for the lockout window to expire, or use the email recovery link to regain immediate access.",
    tags: ["locked", "lockout", "failed login", "too many attempts"]
  },
  {
    id: "login-2",
    category: "login",
    question: "How do I set up and use Two-Factor Authentication (TOTP 2FA)?",
    answer: "Navigate to Settings > Security and enable Two-Factor Authentication using any standard authenticator app (Google Authenticator, Authy, or 1Password). Once enabled, you must provide your 6-digit TOTP code during login and critical account actions.",
    tags: ["2fa", "totp", "authenticator", "security", "two factor"]
  },
  {
    id: "login-3",
    category: "login",
    question: "Can I sign in using Google or switch auth providers?",
    answer: "Yes, you can sign in directly with Google. If you created an account with a password first, you can link your Google account in Settings > Security. You must always maintain at least one valid authentication method.",
    tags: ["google", "oauth", "sso", "social login"]
  },

  // 3. Games
  {
    id: "games-1",
    category: "games",
    question: "Which 10 games are available on Nizalo?",
    answer: "Nizalo currently features 10 skill-based strategy games: Chess, Checkers, Dominoes, Backgammon, Seega, Connect Four, XO (Tic-Tac-Toe), Speed Math, Reversi (Othello), and Gomoku. All games use standard official rules with server-enforced validation.",
    tags: ["games", "rules", "chess", "checkers", "dominoes", "backgammon", "seega", "connect four", "xo", "speed math", "reversi", "gomoku"]
  },
  {
    id: "games-2",
    category: "games",
    question: "Are Nizalo game outcomes purely based on skill?",
    answer: "Yes. All Nizalo games are strictly skill competitions. The outcome depends entirely on player choices, calculation, tactical strategy, speed, and precision. No randomized house advantages or gambling mechanics exist.",
    tags: ["skill", "fairness", "mechanics", "no gambling"]
  },

  // 4. Matchmaking
  {
    id: "match-1",
    category: "matchmaking",
    question: "How does the matchmaking system pair opponents?",
    answer: "Matchmaking utilizes a skill-based rating system (ELO and Global Skill Score) along with network latency filters. The matchmaker searches within your rating tier to ensure fair and competitive matchups before gradually widening the search range.",
    tags: ["matchmaking", "elo", "rating", "fair pairing", "pairing"]
  },
  {
    id: "match-2",
    category: "matchmaking",
    question: "What is the Global Skill Score (GSS)?",
    answer: "Your Global Skill Score is a real percentile-based aggregate metric calculated from your performance, win rate, accuracy, and duel volume across all 10 games. It updates automatically after each settled match.",
    tags: ["gss", "global skill score", "ranking", "leaderboard"]
  },

  // 5. Friend Challenges
  {
    id: "friend-1",
    category: "friend_challenges",
    question: "How do I challenge a specific friend to a duel?",
    answer: "Go to Play > Friend Challenge, enter your friend's nickname, select the game, time control, and stake amount (or free practice), then send the invite. Your friend will receive a real-time invite with a 60-second response countdown.",
    tags: ["friend challenge", "invite", "direct challenge", "custom match"]
  },
  {
    id: "friend-2",
    category: "friend_challenges",
    question: "What happens if my friend does not accept the invite in time?",
    answer: "If an invite is not accepted within 60 seconds, or if the invited player declines, the challenge automatically expires and any reserved match stake is immediately unlocked in your wallet.",
    tags: ["invite expired", "timeout", "declined challenge"]
  },

  // 6. Tournaments
  {
    id: "tourn-1",
    category: "tournaments",
    question: "How do Nizalo tournaments work and how are prizes distributed?",
    answer: "Tournaments follow structured bracket formats (Single Elimination, Double Elimination, or Swiss). Players advance by winning match rounds. Prize pools are distributed automatically according to immutable platform rules published in the tournament lobby before the first round begins.",
    tags: ["tournaments", "brackets", "prize pool", "elimination", "swiss"]
  },
  {
    id: "tourn-2",
    category: "tournaments",
    question: "What happens if a tournament round ends in a draw?",
    answer: "In elimination brackets where an outright winner is required, tournament tie-breaker sudden-death blitz games or lowest cumulative clock usage rules apply as specified in the Tournament Rules framework.",
    tags: ["tournament draw", "tie breaker", "draw rules"]
  },

  // 7. Wallet
  {
    id: "wallet-1",
    category: "wallet",
    question: "How does the Nizalo financial ledger work?",
    answer: "Nizalo employs a double-entry immutable financial ledger. Every balance change—deposit, match stake hold, win settlement, withdrawal, fee, or referral reward—is recorded as an auditable debit/credit journal entry. Balances are never modified directly or arbitrarily.",
    tags: ["wallet", "ledger", "double entry", "balance", "audit"]
  },
  {
    id: "wallet-2",
    category: "wallet",
    question: "Can support agents adjust or credit my wallet balance?",
    answer: "No. By strict architectural security policy, support representatives and front-line staff have zero technical capability to mutate wallet balances, ledger entries, or fee structures. All funds flow exclusively through validated blockchain deposits and automated ledger transactions.",
    tags: ["support boundary", "balance adjustment", "staff limitations", "security"]
  },

  // 8. Deposits
  {
    id: "dep-1",
    category: "deposits",
    question: "Why is my deposit showing as pending?",
    answer: "Cryptocurrency deposits require a specific number of on-chain block confirmations before they are credited to your account. Depending on network congestion (e.g., TRON or Ethereum), this typically takes 1 to 15 minutes. Once the required block confirmation depth is verified by our blockchain listeners, your balance is automatically credited.",
    tags: ["deposit pending", "block confirmations", "unconfirmed deposit", "mempool"]
  },
  {
    id: "dep-2",
    category: "deposits",
    question: "What is the minimum deposit amount?",
    answer: "The default qualifying minimum deposit is $5.00 USDT. Deposits below the minimum network processing threshold may fail to trigger automated credit.",
    tags: ["minimum deposit", "deposit threshold", "5 dollars"]
  },

  // 9. Withdrawals
  {
    id: "wtd-1",
    category: "withdrawals",
    question: "Why is my withdrawal request pending?",
    answer: "Withdrawals undergo automated fraud and anti-collusion screening, velocity limit validation, and security queue batching from our multi-signature hot wallets. Standard withdrawals process in 5 to 30 minutes. If an automated flag is triggered, human compliance review is completed within 24 hours.",
    tags: ["withdrawal pending", "processing time", "hot wallet", "compliance review"]
  },
  {
    id: "wtd-2",
    category: "withdrawals",
    question: "Why was my withdrawal rejected or cancelled?",
    answer: "Withdrawals may be rejected due to: (1) Insufficient balance to cover the network gas fee; (2) An unconfirmed active match in progress; (3) Entering an invalid or incompatible wallet address; (4) Referral abuse / self-referral detection; or (5) Risk review failure. If your withdrawal fails, funds are automatically unlocked back to your available balance.",
    tags: ["withdrawal rejected", "withdrawal failed", "cancelled withdrawal", "gas fee"]
  },

  // 10. USDT
  {
    id: "usdt-1",
    category: "usdt",
    question: "Why is my USDT deposit not detected?",
    answer: "If your USDT deposit is not appearing: (1) Check your transaction hash on a public blockchain explorer (such as Tronscan or Etherscan) to ensure it was successfully broadcast and confirmed; (2) Verify that you sent USDT on a supported network to your designated Nizalo deposit address; (3) Ensure the amount meets the $5.00 minimum threshold. If confirmed on-chain but still missing after 30 minutes, submit a ticket with your TX hash.",
    tags: ["usdt not detected", "missing usdt", "tx hash", "blockchain explorer"]
  },
  {
    id: "usdt-2",
    category: "usdt",
    question: "Which networks are supported for USDT transfers?",
    answer: "Nizalo supports USDT on designated high-speed networks including TRC-20 (TRON) and ERC-20 / Polygon (as indicated on your Deposit page). Always confirm the network type selected on your deposit screen before initiating the transfer.",
    tags: ["usdt network", "trc20", "erc20", "polygon", "supported networks"]
  },

  // 11. Transaction Confirmation
  {
    id: "tx-1",
    category: "tx_confirmation",
    question: "What happens if I send funds on the wrong network?",
    answer: "Blockchain networks operate as separate, isolated ledgers. If you send USDT on an unsupported network (e.g. sending Solana USDT to a TRC-20 address), the transaction cannot be detected or credited automatically. Nizalo cannot guarantee recovery of funds sent to incorrect networks.",
    tags: ["wrong network", "cross chain", "network mismatch", "unsupported network"]
  },
  {
    id: "tx-2",
    category: "tx_confirmation",
    question: "Can Nizalo reverse a transaction sent to the wrong wallet address?",
    answer: "No. Blockchain transactions are cryptographic, immutable, and irreversible once confirmed on-chain. Nizalo does not control external addresses and has no power to recall or reverse any outbound cryptocurrency transaction. Always double-check recipient addresses.",
    tags: ["wrong address", "irreversible", "reversal", "refund"]
  },

  // 12. Security
  {
    id: "sec-1",
    category: "security",
    question: "How do I protect my account against phishing and scams?",
    answer: "STRICT ANTI-PHISHING RULE: Nizalo staff, moderators, and automated bots will NEVER ask for your password, recovery phrase, private keys, or one-time verification codes (OTP). Always verify that you are visiting the official Nizalo domain and never share your credentials with anyone.",
    tags: ["phishing", "scam", "otp", "password security", "private key"]
  },
  {
    id: "sec-2",
    category: "security",
    question: "What should I do if I suspect unauthorized access to my account?",
    answer: "Immediately go to Settings > Security and click 'Revoke All Sessions' to terminate all active logins. Change your password immediately, enable TOTP 2FA, and open a Critical priority Support Ticket to place a temporary withdrawal lock on your account.",
    tags: ["unauthorized access", "hacked", "revoke sessions", "account compromised"]
  },

  // 13. Fair Play
  {
    id: "fair-1",
    category: "fair_play",
    question: "How does Nizalo detect engines, bots, and cheaters?",
    answer: "Our proprietary Fair Play engine analyzes move timing distributions, move accuracy correlations against neural engines, input latency telemetry, and browser focus events. Confirmed engine assistance results in immediate permanent disqualification and account termination.",
    tags: ["cheat", "anti-cheat", "engine detection", "bots", "fair play"]
  },
  {
    id: "fair-2",
    category: "fair_play",
    question: "Are multiple accounts or collusion permitted?",
    answer: "No. Nizalo strictly prohibits multiple accounts, circular match fixing, intentional rating manipulation (sandbagging), and syndicate collusion. All duels are logged and independently auditable.",
    tags: ["multi account", "collusion", "match fixing", "sandbagging"]
  },

  // 14. Referrals
  {
    id: "ref-1",
    category: "referrals",
    question: "How does the Nizalo Referral Program work?",
    answer: "Every registered player receives a unique permanent referral link (e.g. nizalo.com/r/ABC123). When a referred player registers and completes their first confirmed qualifying deposit of at least $5.00, the referrer receives a $1.00 reward posted directly to their ledger balance. The referred user receives no monetary reward.",
    tags: ["referrals", "referral reward", "1 dollar reward", "referral code"]
  },
  {
    id: "ref-2",
    category: "referrals",
    question: "Why was my referral reward flagged or not credited?",
    answer: "Referral rewards are subject to automated anti-fraud screening. Self-referrals, duplicate device fingerprints, shared IP clusters, circular attributions, and unconfirmed deposits are disqualified. Rewards are only finalized after deposit settlement and risk clearance.",
    tags: ["referral fraud", "self referral", "pending referral", "disqualified"]
  },

  // 15. Chat
  {
    id: "chat-1",
    category: "chat",
    question: "What are the rules and guidelines for global and match chat?",
    answer: "Nizalo maintains a respectful, competitive environment. Harassment, hate speech, spamming, advertising, solicitation, abusive language, and sharing personal contact information are strictly forbidden. Automated filters and human moderators enforce temporary mutes and bans.",
    tags: ["chat rules", "harassment", "moderation", "mute", "ban"]
  },
  {
    id: "chat-2",
    category: "chat",
    question: "How do I report an abusive or toxic player in chat?",
    answer: "Click on the player's handle or message in the chat drawer and select 'Report User', or open a support ticket under the 'ABUSE_REPORT' category with the duel ID or timestamp.",
    tags: ["report user", "toxic", "abuse report", "block player"]
  },

  // 16. Technical Issues
  {
    id: "tech-1",
    category: "technical_issues",
    question: "What happens if I get disconnected during a live match?",
    answer: "The server maintains the authoritative state of every active game. If you lose internet connectivity or close your browser, you have a 60-second grace reconnection window. As soon as you reload or reconnect, your active duel is automatically restored without loss of clock time beyond the elapsed period. If you do not return before the turn clock or grace timer expires, the server records a forfeit by timeout.",
    tags: ["disconnect", "reconnection", "lost connection", "internet drop", "reconnect"]
  },
  {
    id: "tech-2",
    category: "technical_issues",
    question: "How do game clocks and timeouts work?",
    answer: "All clocks are calculated and decremented by the server engine, not your device clock. Each player has a turn timer and/or match time bank. When your time reaches zero, the server immediately triggers an authoritative timeout loss.",
    tags: ["timeout", "clock", "time bank", "server clock", "timer"]
  },
  {
    id: "tech-3",
    category: "technical_issues",
    question: "What are the recommended browser and hardware specifications?",
    answer: "Nizalo runs on all modern browsers (Chrome, Edge, Safari, Firefox) on desktop, tablet, and mobile. WebGL hardware acceleration and WebSockets support must be enabled for optimal 3D board rendering and low-latency move transmission.",
    tags: ["browser", "webgl", "websockets", "performance", "lag"]
  }
];

const CATEGORY_KEYS = [
  "all",
  "account",
  "login",
  "games",
  "matchmaking",
  "friend_challenges",
  "tournaments",
  "wallet",
  "deposits",
  "withdrawals",
  "usdt",
  "tx_confirmation",
  "security",
  "fair_play",
  "referrals",
  "chat",
  "technical_issues"
] as const;

export default function HelpCenterPage() {
  const { t, locale } = useI18n();
  const { player } = useAuth();
  const { openPopup } = useAuthPopup();

  // State
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>("dep-1");
  const [supportConfig, setSupportConfig] = useState<SupportConfig>({
    ok: true,
    phone: "+2 01069999557",
    email: "Tawwerni@gmail.com"
  });
  const [policies, setPolicies] = useState<LegalPolicy[]>([]);

  // Ticket Modal State
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketCategory, setTicketCategory] = useState("TECHNICAL");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketRefId, setTicketRefId] = useState("");
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketSuccessId, setTicketSuccessId] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);

  // Fetch support config & policies
  useEffect(() => {
    let cancelled = false;
    void get<SupportConfig>("/v1/support/config")
      .then((cfg) => { if (!cancelled && cfg?.ok) setSupportConfig(cfg); })
      .catch(() => {});

    void get<{ ok: boolean; policies: LegalPolicy[] }>("/v1/legal/policies")
      .then((res) => { if (!cancelled && res?.ok && Array.isArray(res.policies)) setPolicies(res.policies); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  // Filtered FAQ Items
  const filteredFaqs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return FAQ_DATABASE.filter((item) => {
      const matchCategory = activeCategory === "all" || item.category === activeCategory;
      if (!matchCategory) return false;
      if (!q) return true;
      const matchQuestion = item.question.toLowerCase().includes(q);
      const matchAnswer = item.answer.toLowerCase().includes(q);
      const matchTags = item.tags.some((tag) => tag.toLowerCase().includes(q));
      return matchQuestion || matchAnswer || matchTags;
    });
  }, [activeCategory, searchQuery]);

  // Handle Ticket Submission
  async function handleTicketSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!player) {
      openPopup();
      return;
    }
    setTicketSubmitting(true);
    setTicketError(null);
    try {
      const res = await post<{ ticketId: string }>("/v1/me/tickets", {
        category: ticketCategory,
        subject: ticketSubject.trim(),
        description: ticketDescription.trim(),
        reference_type: ticketRefId.trim() ? "MANUAL" : null,
        reference_id: ticketRefId.trim() || null
      });
      setTicketSuccessId(res.ticketId);
      setTicketSubject("");
      setTicketDescription("");
      setTicketRefId("");
    } catch (err) {
      if (err instanceof ApiError) {
        setTicketError(err.message);
      } else {
        setTicketError("Failed to submit ticket. Please try again.");
      }
    } finally {
      setTicketSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <Header />

      <main className={`nz-container ${styles.main}`}>
        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.heroBadge}>
            <span className={styles.heroBadgeIcon} aria-hidden="true">💡</span>
            <span>Knowledge Base & Support</span>
          </div>
          <h1 className={styles.title}>{t("help.title")}</h1>
          <p className={styles.subtitle}>{t("help.subtitle")}</p>

          {/* Search Box */}
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon} aria-hidden="true">🔍</span>
            <input
              type="search"
              className={styles.searchInput}
              placeholder={t("help.search_placeholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search help topics"
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </section>

        {/* Strict Anti-Phishing Security Notice */}
        <section className={styles.securityBanner} role="alert">
          <div className={styles.securityIcon} aria-hidden="true">🛡️</div>
          <div className={styles.securityContent}>
            <h2 className={styles.securityTitle}>{t("help.security_notice_title")}</h2>
            <p className={styles.securityBody}>{t("help.security_notice_body")}</p>
            <p className={styles.securitySubtext}>
              Support representatives cannot modify wallet balances, alter match outcomes, or bypass blockchain verification.
            </p>
          </div>
        </section>

        {/* Quick Contacts & Actions Bar */}
        <section className={styles.contactBar}>
          <div className={styles.contactCard}>
            <div className={styles.contactIcon} aria-hidden="true">📞</div>
            <div className={styles.contactInfo}>
              <span className={styles.contactLabel}>{t("help.contact_phone_label")}</span>
              <a href={`tel:${supportConfig.phone}`} className={styles.contactLink}>
                {supportConfig.phone}
              </a>
            </div>
          </div>

          <div className={styles.contactCard}>
            <div className={styles.contactIcon} aria-hidden="true">✉️</div>
            <div className={styles.contactInfo}>
              <span className={styles.contactLabel}>{t("help.contact_email_label")}</span>
              <a href={`mailto:${supportConfig.email}`} className={styles.contactLink}>
                {supportConfig.email}
              </a>
            </div>
          </div>

          <div className={styles.contactActions}>
            <Button
              variant="primary"
              className={styles.ticketCtaBtn}
              onClick={() => {
                if (!player) {
                  openPopup();
                } else {
                  setShowTicketModal(true);
                  setTicketSuccessId(null);
                  setTicketError(null);
                }
              }}
            >
              {t("help.open_ticket")}
            </Button>

            <LocaleLink href="/support">
              <Button variant="ghost" className={styles.myTicketsBtn}>
                {t("help.my_tickets")} →
              </Button>
            </LocaleLink>
          </div>
        </section>

        {/* Categories Bar */}
        <section className={styles.categoryNav} aria-label="Help categories">
          <div className={styles.categoryScroll}>
            {CATEGORY_KEYS.map((catKey) => {
              const label = catKey === "all"
                ? t("help.all_categories")
                : t(`help.categories.${catKey}`);
              const isSelected = activeCategory === catKey;

              return (
                <button
                  key={catKey}
                  type="button"
                  className={`${styles.categoryPill} ${isSelected ? styles.categoryPillActive : ""}`}
                  onClick={() => setActiveCategory(catKey)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        {/* FAQ List */}
        <section className={styles.faqSection}>
          <div className={styles.faqHeader}>
            <h2 className={styles.faqHeading}>
              {activeCategory === "all"
                ? "Frequently Asked Questions"
                : t(`help.categories.${activeCategory}`)}
            </h2>
            <span className={styles.faqCount}>
              {filteredFaqs.length} {filteredFaqs.length === 1 ? "article" : "articles"}
            </span>
          </div>

          {filteredFaqs.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyText}>
                No help articles found matching &ldquo;{searchQuery}&rdquo;.
              </p>
              <Button variant="ghost" onClick={() => { setSearchQuery(""); setActiveCategory("all"); }}>
                Reset Filters
              </Button>
            </div>
          ) : (
            <div className={styles.faqList}>
              {filteredFaqs.map((faq) => {
                const isExpanded = expandedFaqId === faq.id;
                return (
                  <article
                    key={faq.id}
                    className={`${styles.faqCard} ${isExpanded ? styles.faqCardExpanded : ""}`}
                  >
                    <button
                      type="button"
                      className={styles.faqQuestionBtn}
                      onClick={() => setExpandedFaqId(isExpanded ? null : faq.id)}
                      aria-expanded={isExpanded}
                    >
                      <span className={styles.faqCategoryBadge}>
                        {t(`help.categories.${faq.category}`) || faq.category}
                      </span>
                      <span className={styles.faqQuestionText}>{faq.question}</span>
                      <span className={styles.faqChevron} aria-hidden="true">
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className={styles.faqAnswerBody}>
                        <p className={styles.faqAnswerText}>{faq.answer}</p>
                        <div className={styles.faqTags}>
                          {faq.tags.map((tag) => (
                            <span key={tag} className={styles.faqTag}>#{tag}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Legal Policies & Documents Section */}
        <section id="terms" className={styles.legalSection}>
          <div className={styles.legalHeader}>
            <span className={styles.legalIcon} aria-hidden="true">📜</span>
            <h2 className={styles.legalHeading}>Official Platform Policies & Terms</h2>
          </div>
          <p className={styles.legalDescription}>
            Nizalo operates under counsel-ready compliance terms, fair play frameworks, and clear withdrawal policies.
          </p>

          <div className={styles.policiesGrid}>
            {(policies.length > 0 ? policies : [
              { identifier: "terms_of_service", version: "1.0.0", title: "Terms & Conditions", is_mandatory: true, effective_at: "" },
              { identifier: "privacy_policy", version: "1.0.0", title: "Privacy Policy", is_mandatory: true, effective_at: "" },
              { identifier: "fair_play", version: "1.0.0", title: "Fair Play / Anti-Cheat Policy", is_mandatory: true, effective_at: "" },
              { identifier: "payments_policy", version: "1.0.0", title: "Payments & Withdrawals Policy", is_mandatory: true, effective_at: "" },
              { identifier: "referral_terms", version: "1.0.0", title: "Referral Program Terms", is_mandatory: false, effective_at: "" },
              { identifier: "responsible_play", version: "1.0.0", title: "Responsible Play Policy", is_mandatory: false, effective_at: "" },
              { identifier: "community_rules", version: "1.0.0", title: "Community / Chat Rules", is_mandatory: false, effective_at: "" },
              { identifier: "cookie_policy", version: "1.0.0", title: "Cookie Policy", is_mandatory: false, effective_at: "" },
              { identifier: "tournament_rules", version: "1.0.0", title: "Tournament Rules Framework", is_mandatory: false, effective_at: "" }
            ]).map((pol) => (
              <div key={pol.identifier} className={styles.policyCard}>
                <div className={styles.policyCardHeader}>
                  <h3 className={styles.policyCardTitle}>{pol.title}</h3>
                  <span className={styles.policyVersionBadge}>v{pol.version}</span>
                </div>
                <p className={styles.policyCardType}>
                  {pol.is_mandatory ? "Mandatory Legal Policy" : "Operational Guideline"}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Ticket Modal */}
      {showTicketModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="ticket-modal-title">
          <div className={styles.modalContainer}>
            <div className={styles.modalHeader}>
              <h2 id="ticket-modal-title" className={styles.modalTitle}>
                {t("help.ticket_modal_title")}
              </h2>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setShowTicketModal(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {ticketSuccessId ? (
              <div className={styles.modalSuccess}>
                <div className={styles.successIcon} aria-hidden="true">✓</div>
                <p className={styles.successText}>{t("help.ticket_success")}</p>
                <div className={styles.successActions}>
                  <LocaleLink href={`/support/${ticketSuccessId}`}>
                    <Button variant="primary">View Ticket #{ticketSuccessId.slice(0, 8)} →</Button>
                  </LocaleLink>
                  <Button variant="ghost" onClick={() => setShowTicketModal(false)}>
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleTicketSubmit} className={styles.ticketForm}>
                <div className={styles.formAlert}>
                  <span>⚠️ Strict Rule: Never enter your password, private key, or OTP code.</span>
                </div>

                {ticketError && (
                  <div className={styles.formError} role="alert">
                    {ticketError}
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="ticket-category">
                    {t("help.ticket_category_label")}
                  </label>
                  <select
                    id="ticket-category"
                    className={styles.formSelect}
                    value={ticketCategory}
                    onChange={(e) => setTicketCategory(e.target.value)}
                    required
                  >
                    <option value="TECHNICAL">Technical Issues / Connection</option>
                    <option value="DEPOSIT_PENDING">Deposit Pending / Missing USDT</option>
                    <option value="WITHDRAWAL_PENDING">Withdrawal Pending</option>
                    <option value="WITHDRAWAL_FAILED">Withdrawal Rejected / Failed</option>
                    <option value="ACCOUNT">Account Access / Settings</option>
                    <option value="MATCH_PROBLEM">Match Problem / Game Dispute</option>
                    <option value="TOURNAMENT_PROBLEM">Tournament Issue</option>
                    <option value="ANTI_CHEAT">Fair Play / Cheat Report</option>
                    <option value="ABUSE_REPORT">Chat Abuse / Harassment</option>
                    <option value="OTHER">Other Inquiry</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="ticket-subject">
                    {t("help.ticket_subject_label")}
                  </label>
                  <input
                    id="ticket-subject"
                    type="text"
                    className={styles.formInput}
                    placeholder="Brief summary of your inquiry"
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value)}
                    required
                    maxLength={120}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="ticket-ref">
                    {t("help.ticket_ref_label")}
                  </label>
                  <input
                    id="ticket-ref"
                    type="text"
                    className={styles.formInput}
                    placeholder="e.g. Transaction Hash, Duel ID, or Referral Code"
                    value={ticketRefId}
                    onChange={(e) => setTicketRefId(e.target.value)}
                    maxLength={100}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="ticket-description">
                    {t("help.ticket_description_label")}
                  </label>
                  <textarea
                    id="ticket-description"
                    className={styles.formTextarea}
                    placeholder="Please explain the details of the issue..."
                    value={ticketDescription}
                    onChange={(e) => setTicketDescription(e.target.value)}
                    required
                    rows={4}
                    maxLength={2000}
                  />
                </div>

                <div className={styles.modalActions}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowTicketModal(false)}
                    disabled={ticketSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={ticketSubmitting || !ticketSubject.trim() || !ticketDescription.trim()}
                  >
                    {ticketSubmitting ? t("help.ticket_submitting") : t("help.ticket_submit")}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
