const mysql = require('mysql2/promise');
const querystring = require('querystring');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const form = querystring.parse(event.body);

  try {
    const pool = await mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT,
      ssl: { rejectUnauthorized: true }
    });

    await pool.query(
      `INSERT INTO provider_leads (
        provider_id, client_name, client_email, client_phone,
        service_requested, preferred_timeframe, budget, message,
        referral_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        form.provider_id,
        form.client_name,
        form.client_email,
        form.client_phone || '',
        form.service_requested,
        form.preferred_timeframe || '',
        form.budget || '',
        form.message || '',
        form.referral_source || ''
      ]
    );

    return {
      statusCode: 302,
      headers: {
        Location: `/providers/${form.provider_id}`
      },
      body: 'Redirecting...'
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: `Database error: ${err.message}`
    };
  }
};
