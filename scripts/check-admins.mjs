import fs from "fs";
import pg from "pg";
import dns from "dns";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="([^"]+)"/);
const client = new pg.Client({ connectionString: match[1], ssl: { rejectUnauthorized: false } });
await client.connect();

const admins = await client.query(`SELECT * FROM admin_user`);
console.log("admin_user:");
console.table(admins.rows);

const roles = await client.query(`SELECT * FROM admin_role_grant`);
console.log("admin_role_grant:");
console.table(roles.rows);

await client.end();
