import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is required.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString });

async function run() {
  const html = await fetch("https://nizalo.com/ar/login").then((r) => r.text());
  const matches = [...html.matchAll(/src="([^"]+\.js)"/g)];
  console.log("Script count:", matches.length);
  for (const m of matches) {
    const s = m[1];
    const js = await fetch("https://nizalo.com" + s).then((r) => r.text());
    const urls = js.match(/https?:\/\/[a-zA-Z0-9.\-_]+(?::\d+)?/g);
    if (urls) {
      const unique = [...new Set(urls)].filter(u => !u.includes("w3.org"));
      if (unique.length > 0) {
        console.log(s, "has URLs:", unique);
      }
    }
  }
}

run();
