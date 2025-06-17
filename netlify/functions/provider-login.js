const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

exports.handler = async function(event) {
  const match = event.path.match(/\/providers\/([^\/]+)\/login/);
  const providerId = match ? match[1] : null;

  if (!providerId) {
    return { statusCode: 400, body: 'Missing provider ID' };
  }

  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: true }
  });

  if (event.httpMethod === 'POST') {
    const form = new URLSearchParams(event.body);
    const enteredPassword = form.get('login_password');

    const [[provider]] = await pool.query(
      'SELECT login_password FROM providers WHERE provider_id = ?',
      [providerId]
    );

    if (!provider) {
      return {
        statusCode: 401,
        body: 'Provider not found.'
      };
    }

    const isValid = await bcrypt.compare(enteredPassword, provider.login_password);

    if (!isValid) {
      return {
        statusCode: 401,
        body: 'Invalid password.'
      };
    }

    return {
      statusCode: 302,
      headers: {
        'Set-Cookie': `provider_id=${providerId}; Path=/; HttpOnly; Secure`,
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
    <title>Provider Login</title>
    <style>
      body {
        font-family: 'Segoe UI', sans-serif;
        background: #000;
        color: #fff;
        padding: 1em;
        max-width: 500px;
        margin: auto;
      }
      h1 {
        color: #ffcc00;
      }
      label {
        display: block;
        margin-top: 1em;
      }
      input {
        width: 100%;
        padding: 0.5em;
        margin-top: 0.2em;
        border: none;
        border-radius: 6px;
        background: #222;
        color: #fff;
      }
      button {
        margin-top: 1em;
        padding: 0.6em 1.2em;
        background: #ffcc00;
        border: none;
        color: #000;
        font-weight: bold;
        border-radius: 6px;
        cursor: pointer;
      }
      button:hover {
        background: #ffaa00;
      }
      .forgot-link {
        margin-top: 1em;
        display: block;
        color: #20b2aa;
        text-decoration: none;
      }
      .forgot-link:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <h1>Provider Login</h1>
    <form method="POST">
      <label>Password:
        <input type="password" name="login_password" required>
      </label>
      <button type="submit">Log In</button>
    </form>
    <a class="forgot-link" href="/providers/${providerId}/forgot-password">Forgot your password?</a>
  </body>
  </html>
  `;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: html
  };
};
