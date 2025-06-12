const db = require('./db');

async function getProviderServices() {
  const [rows] = await db.query('SELECT * FROM provider_services');
  console.log(rows);
  console.log('Provider Services fetched successfully');
  return rows;
}

getProviderServices();
