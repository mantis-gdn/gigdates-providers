// netlify/functions/provider-login.js
const mysql = require('mysql2/promise');

exports.handler = async function (event) {
  const match = event.path.match(/\/providers\/([^\/]+)\/login/);
  const providerId = match ? match[1] : null;

  if (!providerId) {
    return { statusCode: 400, body: 'Missing provider ID' };
  }

  const isPost = event.httpMethod === 'POST';

  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: true }
  });

  if (isPost) {
    const form = new URLSearchParams(event.body);
    const password = form.get('password');

    const [[provider]] = await pool.query(
      'SELECT * FROM providers WHERE provider_id = ? AND login_password = ?',
      [providerId, password]
    );

    if (!provider) {
      return {
        statusCode: 401,
        body: `<h1 style="color:red">Invalid password</h1><a href="/providers/${providerId}/login">Try Again</a>`
      };
    }

    return {
      statusCode: 302,
      headers: {
        'Set-Cookie': `provider_id=${provider.provider_id}; Path=/; HttpOnly`,
        Location: `/providers/${providerId}/admin`
      },
      body: 'Redirecting...'
    };
  }

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${providerId} Login</title>
    <style>
      body { font-family: sans-serif; background: #000; color: #fff; padding: 2em; }
      form { background: #111; padding: 1em; border-radius: 8px; max-width: 400px; margin: 0 auto; }
      label { display: block; margin-bottom: 0.5em; }
      input, button {
        width: 100%;
        padding: 0.5em;
        margin-bottom: 1em;
        border: none;
        border-radius: 4px;
        font-size: 1em;
      }
      input { background: #222; color: #fff; }
      button { background: #ffcc00; color: #000; font-weight: bold; }
    </style>
  </head>
  <body>
    <h1>Provider Login</h1>
    <form method="POST">
      <label>Password:
        <input type="password" name="password" required />
      </label>
      <button type="submit">Log In</button>
    </form>
  </body>
  </html>
  `;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: html
  };
};
