const mysql = require('mysql2/promise');

exports.handler = async function () {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: true }
  });

  function buildHtmlTable(title, rows) {
    if (rows.length === 0) return `<h2>${title}</h2><p>No data.</p>`;
    const headers = Object.keys(rows[0]);
    const thead = headers.map(h => `<th>${h}</th>`).join('');
    const tbody = rows.map(row =>
      `<tr>${headers.map(h => `<td>${row[h]}</td>`).join('')}</tr>`
    ).join('');
    return `<h2>${title}</h2><table border="1"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
  }

  try {
    const [providers] = await pool.query('SELECT * FROM providers');
    const [services] = await pool.query('SELECT * FROM provider_services');
    const [leads] = await pool.query('SELECT * FROM provider_leads');

    const html = `
      <html><head><title>Gig Dates Network</title></head><body>
      <h1>Gig Dates Provider View</h1>
      ${buildHtmlTable('Providers', providers)}
      ${buildHtmlTable('Provider Services', services)}
      ${buildHtmlTable('Provider Leads', leads)}
      </body></html>
    `;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: html
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: `Error: ${err.message}`
    };
  }
};
