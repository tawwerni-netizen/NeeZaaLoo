import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });

const firstNames = [
  'Ahmed', 'Mohamed', 'Mahmoud', 'Omar', 'Ali', 'Hassan', 'Hussein', 'Ibrahim', 'Mostafa', 'Kareem',
  'Youssef', 'Tariq', 'Ziyad', 'Amr', 'Khaled', 'Sherif', 'Sultan', 'Fahmy', 'Nour', 'Laila',
  'Salma', 'Farah', 'Dina', 'Mona', 'Reem', 'Heba', 'Aya', 'Rania', 'Asmaa', 'Sara', 'Mariam',
  'Yassine', 'Faisal', 'Fahad', 'Saud', 'Mehdi', 'Amine', 'Bilal', 'Othman', 'Sami', 'Marwan',
  'Jad', 'Bader', 'Majed', 'Rami', 'Nader', 'Waleed', 'Tamer', 'Hisham', 'Wael',
  'Adam', 'John', 'Michael', 'David', 'Chris', 'Alex', 'Sarah', 'Jessica', 'Emily', 'Emma',
  'Olivia', 'Sophia', 'Isabella', 'Mia', 'Charlotte', 'Amelia', 'Harper', 'Evelyn', 'Abigail'
];

const lastNames = [
  'ElSayed', 'Mansour', 'AlHassan', 'Kabbani', 'Fahmy', 'AlSharif', 'Mahmoud', 'AlBanna', 'Rizk', 'Ghanem',
  'AlKhatib', 'Nasser', 'Mounir', 'AlOtaibi', 'AlGhamdi', 'Kamal', 'Soliman', 'Tawfik', 'Youssef', 'Reda',
  'Galal', 'Fathy', 'AlMasry', 'AlKhaled', 'Salem', 'Hassan', 'Ali', 'Ibrahim', 'Saad', 'Farouk',
  'Saeed', 'Zaki', 'Adel', 'Rashed', 'AbdelRahman', 'Sami', 'Tariq', 'Hamed', 'Mahdi', 'Gaber',
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'
];

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

async function run() {
  await client.connect();
  const res = await client.query(`SELECT id, handle FROM player WHERE handle ILIKE '%bot%' OR handle ILIKE '%trimmed%'`);
  console.log(`Found ${res.rowCount} rows to update.`);
  
  const existingHandlesRes = await client.query(`SELECT handle FROM player`);
  const existingHandles = new Set(existingHandlesRes.rows.map(r => r.handle.toLowerCase()));
  
  // Pre-generate all unique combinations
  const allNames = [];
  for (const first of firstNames) {
      for (const last of lastNames) {
          allNames.push(`${first}_${last}`);
      }
  }
  shuffleArray(allNames);
  
  let nameIndex = 0;
  
  for (const row of res.rows) {
    let newHandle;
    
    // Explicit overrides for the specific AI bots to look completely human without numbers
    if (row.id === 'ai-easy') {
      newHandle = 'Kareem_Salem';
    } else if (row.id === 'ai-medium') {
      newHandle = 'Tariq_Fahmy';
    } else if (row.id === 'ai-hard') {
      newHandle = 'Sultan_Reda';
    } else if (row.id === 'ai-expert') {
      newHandle = 'Farouk_Saeed';
    } else {
      do {
        newHandle = allNames[nameIndex++];
      } while (existingHandles.has(newHandle.toLowerCase()));
    }
    
    // just in case Kareem_Salem etc is taken, let's make sure they aren't taken.
    // In standard cases they aren't, but let's be careful.
    if (existingHandles.has(newHandle.toLowerCase()) && row.id.startsWith('ai-')) {
       newHandle = newHandle + '_Pro'; // At least it's natural
    }

    existingHandles.add(newHandle.toLowerCase());
    
    await client.query(`UPDATE player SET handle = $1 WHERE id = $2`, [newHandle, row.id]);
  }
  
  const finalCheck = await client.query(`SELECT COUNT(*) FROM player WHERE handle ILIKE '%bot%' OR handle ILIKE '%trimmed%'`);
  console.log(`Remaining bots with bad handles: ${finalCheck.rows[0].count}`);
  
  await client.end();
}
run();
