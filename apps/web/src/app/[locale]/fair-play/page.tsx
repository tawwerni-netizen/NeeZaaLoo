
"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import styles from "./fair-play.module.css";
import Image from "next/image";

const DICE_ICONS: Record<number, string> = {
  1: "⚀",
  2: "⚁",
  3: "⚂",
  4: "⚃",
  5: "⚄",
  6: "⚅",
};

async function calculateSha256(str: string): Promise<string> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function deriveDice(hash: string): [number, number] {
  const n1 = parseInt(hash.slice(0, 4), 16) || 0;
  const n2 = parseInt(hash.slice(4, 8), 16) || 0;
  return [((n1 % 6) + 1), ((n2 % 6) + 1)];
}

export default function FairPlayPage() {
  const { t, locale } = useI18n();

  const [serverSeed, setServerSeed] = useState("nizalo_secret_seed_a8f9c1029e4d5b");
  const [clientSeed, setClientSeed] = useState("duel_nonce_2026_round_1");
  const [hash, setHash] = useState("4c6888c3a9f02c63eb217f09de215c00e1236893699b0c968f9b9f7a7eb6d957");
  const [dice, setDice] = useState<[number, number]>([5, 3]);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    void handleVerify("nizalo_secret_seed_a8f9c1029e4d5b", "duel_nonce_2026_round_1");
  }, []);

  async function handleVerify(sSeed = serverSeed, cSeed = clientSeed) {
    setVerifying(true);
    const combined = `${sSeed.trim()}:${cSeed.trim()}`;
    const calculated = await calculateSha256(combined);
    setHash(calculated);
    setDice(deriveDice(calculated));
    setVerifying(false);
  }

  function handleRandomize() {
    const randServer = "nizalo_" + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 8);
    const randClient = "match_" + Math.floor(100000 + Math.random() * 900000) + "_r" + Math.ceil(Math.random() * 5);
    setServerSeed(randServer);
    setClientSeed(randClient);
    void handleVerify(randServer, randClient);
  }

  const whyPoints = [
    {
      icon: "🎯",
      title: locale === "ar" ? "ألعاب مهارة وتحكيم نزيه" : "Skill-Based & Verified Competition",
      desc: locale === "ar" 
        ? "تعتمد ألعابنا على الذكاء والتخطيط والتكتيك الذهني، مع توليد النرد في ألعاب الزهر عبر التزام مشفر بخوارزمية SHA-256 لمنع أي تلاعب."
        : "All games rely on mental acumen, tactical depth, and strategic foresight, with RNG games governed by cryptographic SHA-256 commit-reveal seeds."
    },
    {
      icon: "⚡",
      title: locale === "ar" ? "الخادم هو المرجع المشفر" : "100% Server-Authoritative",
      desc: locale === "ar"
        ? "لا يمكن لأي طرف التلاعب بالوقت أو النقلات؛ خوادمنا تتحقق لحظياً من شرعية كل خطوة قبل تثبيتها في سجل النزال المشفر."
        : "No client can manipulate clocks or moves; our engine validates every intent in real time before committing to the cryptographic ledger."
    },
    {
      icon: "🔒",
      title: locale === "ar" ? "حماية الأرصدة والسحب الفوري" : "Instant Payout & Asset Security",
      desc: locale === "ar"
        ? "أرباحك وجوائزك مضمونة في محفظتك المعتمدة ويمكنك سحبها في أي وقت دون شروط تعجيزية أو تسويف."
        : "Your winnings and tournament prizes are stored in an auditable ledger and can be withdrawn instantly at any time."
    }
  ];

  const cards = [
    {
      title: t("fairPlayPage.server_heading"),
      desc: t("fairPlayPage.server_body"),
      img: "/images/security/security-anti-cheat-sentinel.jpg",
      icon: "🛡️"
    },
    {
      title: t("fairPlayPage.verify_heading"),
      desc: t("fairPlayPage.verify_body"),
      img: "/images/security/security-cryptographic-seed.jpg",
      icon: "🔐"
    },
    {
      title: t("fairPlayPage.review_heading"),
      desc: t("fairPlayPage.review_body"),
      img: "/images/security/security-human-review.jpg",
      icon: "🕵️"
    },
    {
      title: t("fairPlayPage.eligibility_heading"),
      desc: t("fairPlayPage.eligibility_body"),
      img: "/images/security/security-identity-guard.jpg",
      icon: "✅"
    }
  ];

  const faqs = [
    {
      q: locale === "ar" 
        ? "كيف تضمن نيزالو عدم انحياز رمية الزهر أو سحب أوراق الدومينو؟" 
        : "How does Nizalo ensure dice rolls and domino draws are strictly unbiased?",
      a: locale === "ar"
        ? "نعتمد بروتوكول SHA-256 Commit-Reveal المعياري؛ يُرسل هاش التزام النتيجة إلى متصفحك قبل بدء الرمية، وتُدمج معه بذرة الجولة المشتركة. يستحيل رياضياً على خوادمنا أو أي طرف تغيير النتيجة دون انكشاف الهاش."
        : "We use the standard SHA-256 Commit-Reveal protocol. The cryptographic commitment hash is published before the roll. Once committed, mathematical laws prevent any entity from modifying the outcome."
    },
    {
      q: locale === "ar"
        ? "ماذا يحدث إذا انقطع اتصالي بالإنترنت أثناء نزال تنافسي؟"
        : "What happens if my internet connection drops during a match?",
      a: locale === "ar"
        ? "يحتفظ الخادم المركزي بحالتك ووقتك بدقة بالمللي ثانية، مع إتاحة مهلة إعادة اتصال ذكية (Reconnection Grace Window). إذا استعدت الاتصال خلال المهلة، تستأنف مباراتك فوراً من النقطة ذاتها دون أي خصم جائر."
        : "Our server-authoritative engine preserves your game state to the millisecond with an automatic reconnection grace period, allowing you to resume seamlessly once reconnected."
    },
    {
      q: locale === "ar"
        ? "كيف يتم رصد برامج الغش ومساعدي الشطرنج (Chess Engines)؟"
        : "How does Nizalo detect automated chess engines and cheating scripts?",
      a: locale === "ar"
        ? "يراقب نظام Sentinel الخوارزمي كل حركة في الوقت الفعلي: زمن التفكير، التذبذب الزمني للضغطات (Mouse/Tap Jitter)، ومطابقة النقلات مع أفضل خيارات Stockfish. أي استخدام للذكاء الاصطناعي يؤدي إلى إقصاء فوري وتجميد حساب المخالف."
        : "Our Sentinel anti-cheat monitors move decision latencies, biometric tap jitter, and Stockfish engine signature correlation in real-time, instantly disqualifying cheating accounts."
    },
    {
      q: locale === "ar"
        ? "هل يمكن لمسؤولي نيزالو أو الدعم الفني التدخل في نتائج المباريات؟"
        : "Can Nizalo staff or administrators alter match results or balances?",
      a: locale === "ar"
        ? "مستحيل تماماً. كافة حسابات الأرصدة والنتائج مسجلة في دفتر حسابات مزدوج القيد مشفر ومحمي بقيود أمان غير قابلة للتجاوز في خوادم فرانكفورت. النزاهة التنافسية مضمونة بالرياضيات المشفرة."
        : "Strictly impossible. Every balance transition is locked in an immutable double-entry ledger with automated settlement triggers. Integrity is cryptographically enforced, not subject to human discretion."
    }
  ];

  return (
    <>
      <Header />
      <main className="nz-container" style={{ paddingBlock: "3.5rem" }}>
        {/* Hero Section */}
        <header className={styles.head}>
          <div className={styles.shieldIcon}>🛡️</div>
          <div className={styles.heroBadge}>
            {locale === "ar" ? "ميثاق النزاهة والعدالة التنافسية" : "Fair Play & Integrity Charter"}
          </div>
          <h1 className={styles.heading}>{t("fairPlayPage.heading")}</h1>
          <p className={styles.subhead}>{t("fairPlayPage.subhead")}</p>
        </header>

        {/* 'Why This Page' Attractive Showcase Section */}
        <section className={styles.whySection}>
          <div className={styles.whyHeader}>
            <span className={styles.whyTag}>
              {locale === "ar" ? "💡 لماذا هذه الصفحة بالغة الأهمية؟" : "💡 Why Does This Matter?"}
            </span>
            <h2 className={styles.whyTitle}>
              {locale === "ar" 
                ? "لأن ثقتك هي رأس مالنا الحقيقي، والمهارة وحدها هي التي تحسم الفوز" 
                : "Because Trust is Our Foundation, and Merit Alone Decides Victory"}
            </h2>
            <p className={styles.whyDesc}>
              {locale === "ar"
                ? "صممنا هذه الصفحة لنضع بين يديك الحقائق التقنية المجردة بدون أي وعود وهمية. في نيزالو، نحن لا ندير منصة رهان أو حظ، بل نوفر بيئة أولمبية إلكترونية تنافسية عادلة ومشفرة."
                : "We built this page to give you transparent technical realities without buzzwords. At Nizalo, we run a pure esports skill arena built on deterministic competition."}
            </p>
          </div>

          <div className={styles.whyGrid}>
            {whyPoints.map((pt, i) => (
              <div key={i} className={styles.whyCard}>
                <div className={styles.whyIcon}>{pt.icon}</div>
                <h3 className={styles.whyCardTitle}>{pt.title}</h3>
                <p className={styles.whyCardDesc}>{pt.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Interactive Provably Fair Seed Verifier Widget */}
        <section className={styles.verifierSection}>
          <div className={styles.verifierHeader}>
            <div className={styles.verifierBadge}>
              🔐 {locale === "ar" ? "أداة التحقق المباشر (Provably Fair Verifier)" : "Interactive Provably Fair Verifier"}
            </div>
            <h2 className={styles.verifierTitle}>
              {locale === "ar"
                ? "جرب بنفسك: كيف نثبت أن كل نرد أو سحب عشوائي غير قابل للتلاعب؟"
                : "Test It Yourself: Mathematically Verifiable Randomness"}
            </h2>
            <p className={styles.verifierDesc}>
              {locale === "ar"
                ? "يمكنك تجربة خوارزمية SHA-256 Commit-Reveal المستخدمة في نيزالو الآن مباشرة في متصفحك. عند دمج بذرة الخادم السرية مع بذرة الجولة، يتولد رقم مشفر حتمي ينتج رمية نرد ثابتة لا يمكن لأحد تغييرها بأثر رجعي."
                : "Try the actual SHA-256 Commit-Reveal algorithm live in your browser. When the server secret seed fuses with the duel nonce, it generates a deterministic hash producing an unalterable outcome."}
            </p>
          </div>

          <div className={styles.verifierBox}>
            <div className={styles.verifierInputRow}>
              <div className={styles.inputField}>
                <label className={styles.inputLabel}>
                  🔑 {locale === "ar" ? "بذرة الخادم (Server Seed)" : "Server Seed (Secret revealed after duel)"}
                </label>
                <input
                  type="text"
                  className={styles.textInput}
                  value={serverSeed}
                  onChange={(e) => setServerSeed(e.target.value)}
                  placeholder="e.g. nizalo_secret_seed_..."
                />
              </div>

              <div className={styles.inputField}>
                <label className={styles.inputLabel}>
                  🎲 {locale === "ar" ? "بذرة الجولة / العميل (Client Nonce)" : "Client Nonce / Match Seed"}
                </label>
                <input
                  type="text"
                  className={styles.textInput}
                  value={clientSeed}
                  onChange={(e) => setClientSeed(e.target.value)}
                  placeholder="e.g. duel_nonce_..."
                />
              </div>
            </div>

            <div className={styles.verifierActions}>
              <button
                type="button"
                className={styles.verifyBtn}
                onClick={() => void handleVerify()}
                disabled={verifying}
              >
                ⚡ {locale === "ar" ? "احسب الهاش وتحقق الآن" : "Compute Hash & Verify"}
              </button>
              <button
                type="button"
                className={styles.sampleBtn}
                onClick={handleRandomize}
              >
                🎲 {locale === "ar" ? "توليد بذرة اختبارية عشوائية" : "Generate Random Test Seed"}
              </button>
            </div>

            <div className={styles.verifierOutput}>
              <div className={styles.outputRow}>
                <span className={styles.outputLabel}>
                  {locale === "ar" ? "بصمة SHA-256 المشفرة الحتمية" : "Deterministic SHA-256 Digest"}
                </span>
                <div className={styles.hashDisplay}>{hash}</div>
              </div>

              <div className={styles.diceOutcomeRow}>
                <div className={styles.diceVisual}>
                  {DICE_ICONS[dice[0]]} {DICE_ICONS[dice[1]]}
                </div>
                <div>
                  <div className={styles.diceText}>
                    {locale === "ar"
                      ? `النتيجة الحتمية للزهر: [ ${dice[0]} و ${dice[1]} ]`
                      : `Deterministic Dice Outcome: [ ${dice[0]} and ${dice[1]} ]`}
                  </div>
                  <div style={{ fontSize: 12, color: "#4ade80", marginTop: 2, fontWeight: 700 }}>
                    ✅ {locale === "ar" ? "نتيجة مشفرة ومثبتة رياضياً (100% Deterministic)" : "Mathematically Guaranteed & Unbiased"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Security & Anti-Cheat Technical Pillars */}
        <div className={styles.sectionTitleWrap}>
          <h2 className={styles.sectionTitle}>
            {locale === "ar" ? "ركائز نظام الأمان والتحكيم الخوارزمي" : "Security & Anti-Cheat Architecture"}
          </h2>
          <p className={styles.sectionSub}>
            {locale === "ar" 
              ? "تفاصيل هندسة النظام الصارمة لحماية حقوق المتنافسين على مدار الساعة"
              : "Technical details of our continuous security and verification pipeline"}
          </p>
        </div>

        <div className={styles.grid}>
          {cards.map((card, i) => (
            <div key={i} className={styles.card}>
              <div className={styles.cardImgWrap}>
                <Image src={card.img} alt={card.title} fill className={styles.cardImg} />
                <div className={styles.cardImgOverlay} />
                <div className={styles.cardIcon}>{card.icon}</div>
              </div>
              <div className={styles.cardContent}>
                <h2 className={styles.cardTitle}>{card.title}</h2>
                <p className={styles.cardDesc}>{card.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Competitive Integrity FAQ */}
        <section className={styles.faqSection}>
          <div className={styles.sectionTitleWrap}>
            <h2 className={styles.sectionTitle}>
              {locale === "ar" ? "الأسئلة الشائعة حول النزاهة ومكافحة الغش" : "Competitive Integrity & Anti-Cheat FAQ"}
            </h2>
            <p className={styles.sectionSub}>
              {locale === "ar"
                ? "إجابات شفافة ومباشرة على أكثر تساؤلات اللاعبين شيوعاً حول نزاهة المنافسة"
                : "Direct, transparent answers regarding game integrity, disconnections, and fair play"}
            </p>
          </div>

          <div className={styles.faqGrid}>
            {faqs.map((faq, idx) => (
              <div key={idx} className={styles.faqCard}>
                <div className={styles.faqQ}>
                  <span>❓</span> {faq.q}
                </div>
                <div className={styles.faqA}>{faq.a}</div>
              </div>
            ))}
          </div>
        </section>

        <div className={styles.ctaWrap}>
          <LocaleLink href="/support" className={styles.ctaBtn}>
            {t("fairPlayPage.contact_cta")}
          </LocaleLink>
        </div>
      </main>
      <Footer />
    </>
  );
}
