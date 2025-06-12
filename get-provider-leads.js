const db = require('./db');

async function getProviderLeads() {
  const [rows] = await db.query('SELECT * FROM provider_leads');
  console.log(rows);
  console.log('Provider Leads fetched successfully');
  return rows;
}

getProviderLeads();
