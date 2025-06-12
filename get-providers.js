const db = require('./db');

async function getProviders() {
  const [rows] = await db.query('SELECT * FROM providers');
  console.log(rows);
  console.log('Providers fetched successfully');
  return rows;
}

getProviders();
