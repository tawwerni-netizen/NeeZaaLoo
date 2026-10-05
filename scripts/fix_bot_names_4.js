const { Pool } = require('pg');

let dbUrl = process.env.DATABASE_URL;
dbUrl = dbUrl.replace(':5432', ':6543');

const pool = new Pool({ connectionString: dbUrl });

const firsts = ['Alex', 'Sarah', 'John', 'Emma', 'Michael', 'Maria', 'David', 'Laura', 'Chris', 'Anna', 'Youssef', 'Ahmed', 'Omar', 'Ali', 'Fatima', 'Nour', 'Khaled', 'Mona', 'Hassan', 'Ziad', 'Samir', 'Tarek', 'Karim'];
const lasts = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Ali', 'Hassan', 'Mahmoud', 'Ibrahim', 'Gaber', 'Fawzy', 'Saad'];

async function fixBots() {
  const res = await pool.query("SELECT id, handle FROM player WHERE is_ai = true");
  let count = 0;
  for (const row of res.rows) {
    if (row.handle.match(/[0-9]/) || row.handle.includes('_')) {
      let newName = firsts[Math.floor(Math.random()*firsts.length)] + lasts[Math.floor(Math.random()*lasts.length)];
      newName += String.fromCharCode(97 + Math.floor(Math.random() * 26)); 
      
      try {
        await pool.query("UPDATE player SET handle = $1 WHERE id = $2", [newName, row.id]);
        count++;
      } catch(e) {
        console.log('Skipped ' + newName + ' (unique violation)');
      }
    }
  }
  console.log('Fixed ' + count + ' bot names');
  process.exit(0);
}
fixBots();
