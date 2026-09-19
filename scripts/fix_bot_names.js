const { Pool } = require('pg');
require('dotenv').config({ path: 'apps/web/.env.local' });
require('dotenv').config({ path: '.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const firsts = ['Alex', 'Sarah', 'John', 'Emma', 'Michael', 'Maria', 'David', 'Laura', 'Chris', 'Anna', 'Youssef', 'Ahmed', 'Omar', 'Ali', 'Fatima', 'Nour', 'Khaled', 'Mona', 'Hassan', 'Ziad'];
const lasts = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Ali', 'Hassan', 'Mahmoud', 'Ibrahim', 'Gaber', 'Fawzy', 'Saad'];

async function fixBots() {
  const res = await pool.query("SELECT id, handle FROM player WHERE is_bot = true");
  let count = 0;
  for (const row of res.rows) {
    // We want to replace ALL bot names that look fake or have numbers
    if (row.handle.match(/[0-9]/) || row.handle.includes('_')) {
      let newName = firsts[Math.floor(Math.random()*firsts.length)] + lasts[Math.floor(Math.random()*lasts.length)];
      // Add a random letter to ensure uniqueness if needed
      newName += String.fromCharCode(97 + Math.floor(Math.random() * 26)); 
      
      try {
        await pool.query("UPDATE player SET handle = $1 WHERE id = $2", [newName, row.id]);
        count++;
      } catch(e) {
        // ignore unique constraint
      }
    }
  }
  console.log('Fixed ' + count + ' bot names');
  process.exit(0);
}
fixBots();
