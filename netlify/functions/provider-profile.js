// netlify/functions/provider-profile.js
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const cloudinary = require('cloudinary').v2;
const busboy = require('busboy');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

exports.handler = async function(event) {
  const match = event.path.match(/\/providers\/([^\/]+)\/admin\/profile/);
  const providerId = match ? match[1] : null;

  if (!providerId) {
    return { statusCode: 400, body: 'Missing provider ID' };
  }

  const cookies = event.headers.cookie || '';
  const sessionMatch = cookies.match(/provider_id=([^;]+)/);
  const sessionProviderId = sessionMatch ? sessionMatch[1] : null;

  if (sessionProviderId !== providerId) {
    return {
      statusCode: 302,
      headers: {
        Location: `/providers/${providerId}/login`
      },
      body: 'Redirecting to login...'
    };
  }

  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: true }
  });

  if (event.httpMethod === 'POST' && event.headers['content-type'].startsWith('multipart/form-data')) {
    return new Promise((resolve, reject) => {
      const bb = busboy({ headers: event.headers });
      const fields = {};
      const services = [];
      let logoUploadPromise = Promise.resolve(null);

      bb.on('field', (name, val) => {
        if (name.startsWith('service_')) {
          const [_, index, key] = name.split('_');
          services[index] = services[index] || {};
          services[index][key] = val;
        } else {
          fields[name] = val;
        }
      });

      bb.on('file', (name, file, info) => {
        if (name === 'logo') {
          logoUploadPromise = new Promise((res, rej) => {
            const uploadStream = cloudinary.uploader.upload_stream({ folder: 'gigdates/providers' }, (err, result) => {
              if (err) return rej(err);
              res(result.secure_url);
            });
            file.pipe(uploadStream);
          });
        }
      });

      bb.on('finish', async () => {
        try {
          const logoUrl = await logoUploadPromise;

          const [[currentProvider]] = await pool.query('SELECT login_password FROM providers WHERE provider_id = ?', [providerId]);
          let hashedPassword = currentProvider.login_password;

          if (fields.login_password && fields.login_password.trim() !== '') {
            const isSame = await bcrypt.compare(fields.login_password, currentProvider.login_password).catch(() => false);
            if (!isSame) {
              const salt = await bcrypt.genSalt(10);
              hashedPassword = await bcrypt.hash(fields.login_password, salt);
            }
          }

          await pool.query(
            `UPDATE providers SET name = ?, bio = ?, website = ?, facebook = ?, instagram = ?, youtube = ?, logo_url = ?, login_password = ? WHERE provider_id = ?`,
            [
              fields.name, fields.bio, fields.website, fields.facebook, fields.instagram, fields.youtube,
              logoUrl || fields.logo_url, hashedPassword, providerId
            ]
          );

          for (const svc of services) {
            const { id, name, description, starting_price, unit } = svc;
            if (id && id.trim() !== '') {
              await pool.query(
                `UPDATE provider_services SET name = ?, description = ?, starting_price = ?, unit = ? WHERE id = ? AND provider_id = ?`,
                [name, description, starting_price || null, unit, id, providerId]
              );
            } else if (name && name.trim() !== '') {
              await pool.query(
                `INSERT INTO provider_services (provider_id, name, description, starting_price, unit) VALUES (?, ?, ?, ?, ?)`,
                [providerId, name, description, starting_price || null, unit]
              );
            }
          }

          resolve({
            statusCode: 302,
            headers: { Location: `/providers/${providerId}/admin/profile` },
            body: 'Redirecting...'
          });
        } catch (err) {
          reject({ statusCode: 500, body: JSON.stringify({ error: err.message }) });
        }
      });

      bb.end(Buffer.from(event.body, 'base64'));
    });
  }

  const [[provider]] = await pool.query(
    'SELECT * FROM providers WHERE provider_id = ?',
    [providerId]
  );

  const [services] = await pool.query(
    'SELECT * FROM provider_services WHERE provider_id = ?',
    [providerId]
  );

  const html = `<!DOCTYPE html>
  <html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Edit Provider Profile</title>
  <style>
    body {
      font-family: sans-serif;
      background: #000;
      color: #fff;
      padding: 1em;
    }
    h1 {
      color: #ffcc00;
    }
    label {
      display: block;
      margin-top: 1em;
    }
    input, textarea {
      width: 100%;
      padding: 0.5em;
      background: #333;
      color: #ffcc00;
      border: 1px solid #555;
      border-radius: 4px;
    }
    button {
      margin-top: 1em;
      padding: 0.5em 1em;
      background: #ffcc00;
      color: #000;
      border: none;
      font-weight: bold;
      cursor: pointer;
    }
    fieldset {
      border: 1px solid #444;
      padding: 1em;
      margin-top: 1em;
      border-radius: 6px;
    }
  </style></head><body>
  <h1>Edit Profile for ${provider.name}</h1>
  <form method="POST" enctype="multipart/form-data">
    <label>Name: <input name="name" value="${provider.name}" /></label>
    <label>Bio: <textarea name="bio">${provider.bio || ''}</textarea></label>
    <label>Website: <input name="website" value="${provider.website || ''}" /></label>
    <label>Facebook: <input name="facebook" value="${provider.facebook || ''}" /></label>
    <label>Instagram: <input name="instagram" value="${provider.instagram || ''}" /></label>
    <label>YouTube: <input name="youtube" value="${provider.youtube || ''}" /></label>
    <label>Logo URL: <input name="logo_url" value="${provider.logo_url || ''}" /></label>
    <label>Upload Logo: <input type="file" name="logo" accept="image/*" /></label>
    <label>New Password: <input type="password" name="login_password" /></label>
    <h2>Services</h2>
    ${services.map((s, i) => `
      <fieldset>
        <input type="hidden" name="service_${i}_id" value="${s.id}" />
        <label>Name: <input name="service_${i}_name" value="${s.name}" /></label>
        <label>Description: <input name="service_${i}_description" value="${s.description}" /></label>
        <label>Price: <input name="service_${i}_starting_price" value="${s.starting_price}" /></label>
        <label>Unit: <input name="service_${i}_unit" value="${s.unit}" /></label>
      </fieldset>
    `).join('')}
    <button type="submit">Save Changes</button>
  </form></body></html>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: html
  };
};
