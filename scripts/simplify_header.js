const fs = require('fs');
let text = fs.readFileSync('apps/web/src/components/Header.tsx', 'utf8');

text = text.replace(/const PRIMARY_NAV: NavItem\[\] = \[[\s\S]*?\];\n/, `const PRIMARY_NAV = [
    { href: "/play", label: locale === "ar" ? "الميدان" : "Arena", icon: "⚔️" },
    { href: "/games", label: locale === "ar" ? "الألعاب" : "Games", icon: "🎲" },
    { href: "/tournaments", label: locale === "ar" ? "البطولات" : "Tournaments", icon: "🏆" },
    { href: "/clans", label: locale === "ar" ? "العشائر" : "Clans", icon: "🛡️" },
    { href: "/rank", label: locale === "ar" ? "التصنيف" : "Rank", icon: "👑" },
    { href: "/wallet", label: locale === "ar" ? "المحفظة" : "Wallet", icon: "💎" },
  ];\n`);

const oldNavRenderPattern = /\{PRIMARY_NAV\.map\(\(group, i\) => \([\s\S]*?\}\)\)\}/;
text = text.replace(oldNavRenderPattern, `{PRIMARY_NAV.map((item) => (
            <LocaleLink
              key={item.href}
              href={item.href}
              className={isActive(item.href) ? styles.navActive : styles.navLink}
            >
              <span style={{marginInlineEnd: '6px'}}>{item.icon}</span>
              {item.label}
            </LocaleLink>
          ))}`);

fs.writeFileSync('apps/web/src/components/Header.tsx', text);
