const mysql = require('mysql2/promise');
const { Resend } = require('resend');
const crypto = require('crypto');

exports.handler = async function (event) {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: true }
  });

  const resend = new Resend(process.env.RESEND_API_KEY);

  if (event.httpMethod === 'POST') {
    const form = new URLSearchParams(event.body);
    const contact_email = form.get('contact_email');

    const [[provider]] = await pool.query(
      'SELECT provider_id, name FROM providers WHERE contact_email = ? LIMIT 1',
      [contact_email]
    );

    if (!provider) {
      return {
        statusCode: 404,
        body: 'No provider found with that email address.'
      };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes from now

    await pool.query(`
      INSERT INTO provider_resets (token, provider_id, expires_at)
      VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at)
    `, [token, provider.provider_id, expiresAt]);

    const resetLink = `${process.env.BASE_URL}/providers/reset-password?token=${token}`;

    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: contact_email,
      subject: 'Reset your password on Gig Dates Network',
      text: `Hi ${provider.name},\n\nClick the link below to reset your password:\n\n${resetLink}\n\nThis link will expire in 30 minutes.\n\n– Gig Dates Team`,
      replyTo: 'support@gigdates.net'
    });

    return {
      statusCode: 200,
      body: 'A password reset link has been sent to your email.'
    };
  }

  // Show form to enter email address
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Password</title>
    <style>
      body {
        font-family: 'Segoe UI', sans-serif;
        background: #000;
        color: #fff;
        padding: 2em;
        max-width: 500px;
        margin: auto;
      }
      h1 {
        color: #ffcc00;
      }
      input {
        width: 100%;
        padding: 0.5em;
        margin-top: 0.5em;
        margin-bottom: 1em;
        background: #222;
        color: #fff;
        border: 1px solid #ffb6c1;
        border-radius: 6px;
      }
      button {
        background: #ffcc00;
        color: #000;
        font-weight: bold;
        padding: 0.6em 1.2em;
        border: none;
        border-radius: 6px;
        cursor: pointer;
      }
      button:hover {
        background: #ffaa00;
      }
    </style>
  </head>
  <body>
    <h1>Reset Your Password</h1>
    <form method="POST">
      <label for="email">Enter your email address:</label>
      <input type="email" name="contact_email" required>
      <button type="submit">Send Reset Link</button>
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
