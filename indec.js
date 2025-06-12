require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
const PORT = 3000;

// Create MySQL pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: true }
});

// Helper to build HTML tables
function buildHtmlTable(title, rows) {
  if (rows.length === 0) return `<h2>${title}</h2><p>No data found.</p>`;
  const headers = Object.keys(rows[0]);
  const thead = headers.map(h => `<th>${h}</th>`).join('');
  const tbody = rows.map(row =>
    `<tr>${headers.map(h => `<td>${row[h]}</td>`).join('')}</tr>`
  ).join('');
  return `<h2>${title}</h2><table border="1"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
}

// Main route
app.get('/', async (req, res) => {
  try {
    const [providers] = await pool.query('SELECT * FROM providers');
    const [services] = await pool.query('SELECT * FROM provider_services');
    const [leads] = await pool.query('SELECT * FROM provider_leads');

    const html = `
      <html>
      <head><title>Gig Dates Network - Provider Overview</title></head>
      <body>
        <h1>Gig Dates Network - Provider Data</h1>
        ${buildHtmlTable('Providers', providers)}
        ${buildHtmlTable('Provider Services', services)}
        ${buildHtmlTable('Provider Leads', leads)}
      </body>
      </html>
    `;
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving data.');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
