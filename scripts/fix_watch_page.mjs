import fs from 'fs';
let code = fs.readFileSync('apps/web/src/app/[locale]/watch/page.tsx', 'utf8');

code = code.replace(
  /<LocaleLink href=\{\`\/players\/\$\{encodeURIComponent\(player\.handle\)\}\`\} className=\{styles\.playerChip\}>/g,
  `
    {player.handle === 'Computer AI' || player.handle === 'Player 2' || player.handle.startsWith('Guest_') ? (
      <div className={styles.playerChip}>
    ) : (
      <LocaleLink href={\`/players/\${encodeURIComponent(player.handle)}\`} className={styles.playerChip}>
    )}
  `
);

code = code.replace(
  /<\/LocaleLink>\s*\);\s*\}/,
  `    {player.handle === 'Computer AI' || player.handle === 'Player 2' || player.handle.startsWith('Guest_') ? (
      </div>
    ) : (
      </LocaleLink>
    )}
  );
}
`
);

// Also remove `isBot = player.handle.startsWith("bot_") || player.handle.startsWith("ai_");` 
// and replace it with checking if it's "Computer AI" since actual bots now have natural names.
code = code.replace(
  /const isBot = player\.handle\.startsWith\("bot_"\) \|\| player\.handle\.startsWith\("ai_"\);/,
  `const isBot = player.handle === 'Computer AI';`
);

code = code.replace(
  /\{isBot \? player\.handle\.replace\("bot_", "BOT_"\) : player\.handle\}/,
  `{player.handle}`
);

fs.writeFileSync('apps/web/src/app/[locale]/watch/page.tsx', code);
console.log('Fixed PlayerChip');
