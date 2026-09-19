import pg from 'pg';
import fs from 'fs';

let env = fs.readFileSync('.env', 'utf8');
let dbUrl = '';
for (let line of env.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) dbUrl = line.split('=')[1].trim().replace(':5432/', ':6543/');
}
const pool = new pg.Pool({ connectionString: dbUrl, max: 20 });

const FIRST_NAMES = ["Oliver", "Jack", "Ethan", "Sebastian", "Noah", "Samuel", "Lucas", "Henry", "Liam", "Benjamin", "David", "William", "Alexander", "Daniel", "James", "Kareem", "Tariq", "Saud", "Ibrahim", "Sultan", "Marwan", "Khaled", "Mehdi", "Ali", "Ziyad", "Amine", "Ahmed", "Yi", "Jin", "Hao", "Wei", "Xia", "Liu", "Chen", "Wang", "Zhang", "Li", "Raj", "Vikram", "Arjun", "Rahul", "Amit", "Ravi", "Sanjay", "Anil", "Sunil", "Rajeev"];
const LAST_NAMES = ["Lewis", "Martin", "Thomas", "Taylor", "Davis", "Brown", "Johnson", "Walker", "Clark", "Moore", "Anderson", "Wilson", "Miller", "Williams", "Smith", "AlFassi", "AlOtaibi", "AlSharif", "AlGhamdi", "AlShehri", "AlMansouri", "AlHusseini", "AlBouzidi", "AlSalem", "AlNajdi", "AlSebaei", "AlSaeedi", "AlKurdi", "Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Huang", "Zhao", "Wu", "Zhou", "Patel", "Sharma", "Reddy", "Singh", "Kumar", "Gupta", "Das", "Shah", "Jain"];

async function run() {
  const res = await pool.query("SELECT id, handle FROM player WHERE id LIKE 'bot_%' AND handle ~ '_\\d+$' ORDER BY id");
  let count = 0;
  for (const row of res.rows) {
    let newHandle = '';
    let success = false;
    for (let attempts = 0; attempts < 50; attempts++) {
      const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
      const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
      newHandle = `${first}_${last}`;
      
      try {
        await pool.query("UPDATE player SET handle = $1 WHERE id = $2", [newHandle, row.id]);
        console.log(`Renamed ${row.handle} -> ${newHandle}`);
        count++;
        success = true;
        await new Promise(r => setTimeout(r, 50));
        break;
      } catch (err) {
        if (err.code !== '23505') { // Not unique violation
          console.error(`Error renaming ${row.handle}: ${err.message}`);
          break;
        }
      }
    }
    if (!success) {
      console.error(`Failed to find unique name for ${row.handle}`);
    }
  }
  console.log(`Renamed ${count} bots.`);
}

run().finally(() => pool.end());
