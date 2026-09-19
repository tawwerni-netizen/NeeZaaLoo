import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT id, status, is_vs_computer, seat_0, seat_1, started_at FROM duel WHERE status IN (\'LIVE\', \'READY\') LIMIT 5').then(res => { console.log(res.rows); pool.end(); }).catch(console.error);
