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

exports.handler = async function (event) {
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
        Location: `/providers/${providerId}/login`,
      },
      body: 'Redirecting to login...',
    };
  }

  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: true },
  });

  if (
    event.httpMethod === 'POST' &&
    event.headers['content-type'].startsWith('multipart/form-data')
  ) {
    return new Promise((resolve, reject) => {
      const bb = busboy({ headers: event.headers });
      const fields = {};
      let logoUploadPromise = Promise.resolve(null);

      bb.on('field', (name, val) => {
        fields[name] = val;
      });

      bb.on('file', (name, file, info) => {
        if (name === 'logo') {
          if (info && info.filename) {
            logoUploadPromise = new Promise((res, rej) => {
              const uploadStream = cloudinary.uploader.upload_stream(
                { folder: 'gigdates/providers' },
                (err, result) => {
                  if (err) return rej(err);
                  res(result.secure_url);
                }
              );
              file.pipe(uploadStream);
            });
          } else {
            logoUploadPromise = Promise.resolve(null);
            file.resume();
          }
        }
      });

      bb.on('finish', async () => {
        try {
          const logoUrl = await logoUploadPromise;
          const finalLogoUrl = logoUrl || fields.logo_url || '';

          const [[currentProvider]] = await pool.query(
            'SELECT login_password FROM providers WHERE provider_id = ?',
            [providerId]
          );
          let hashedPassword = currentProvider.login_password;

          if (fields.login_password && fields.login_password.trim() !== '') {
            const isSame = await bcrypt
              .compare(fields.login_password, currentProvider.login_password)
              .catch(() => false);
            if (!isSame) {
              const salt = await bcrypt.genSalt(10);
              hashedPassword = await bcrypt.hash(fields.login_password, salt);
            }
          }

          await pool.query(
            `UPDATE providers SET name = ?, contadt_email = ?, bio = ?, website = ?, facebook = ?, instagram = ?, youtube = ?, logo_url = ?, login_password = ?, style_css = ? WHERE provider_id = ?`,
            [
              fields.name,
              fields.contact_email || '',
              fields.bio,
              fields.website,
              fields.facebook,
              fields.instagram,
              fields.youtube,
              finalLogoUrl,
              hashedPassword,
              fields.style_css || '',
              providerId,
            ]
          );

          const [services] = await pool.query(
            'SELECT * FROM provider_services WHERE provider_id = ?',
            [providerId]
          );

          for (const service of services) {
            const serviceId = service.id;
            const name = fields[`service_name_${serviceId}`];
            const description = fields[`service_description_${serviceId}`];
            const price = fields[`service_price_${serviceId}`];
            const unit = fields[`service_unit_${serviceId}`];
            const deleteService = fields[`delete_service_${serviceId}`];

            if (deleteService === 'on') {
              await pool.query('DELETE FROM provider_services WHERE id = ? AND provider_id = ?', [
                serviceId,
                providerId,
              ]);
            } else {
              await pool.query(
                'UPDATE provider_services SET name = ?, description = ?, starting_price = ?, unit = ? WHERE id = ? AND provider_id = ?',
                [name || '', description || '', price || 0, unit || '', serviceId, providerId]
              );
            }
          }

          for (let i = 1; i <= 3; i++) {
            const newName = fields[`new_service_name_${i}`];
            const newDesc = fields[`new_service_description_${i}`];
            const newPrice = fields[`new_service_price_${i}`];
            const newUnit = fields[`new_service_unit_${i}`];

            if (newName && newName.trim() !== '') {
              await pool.query(
                'INSERT INTO provider_services (provider_id, name, description, starting_price, unit) VALUES (?, ?, ?, ?, ?)',
                [providerId, newName, newDesc || '', newPrice || 0, newUnit || '']
              );
            }
          }

          resolve({
            statusCode: 302,
            headers: {
              Location: `/providers/${providerId}/admin/profile`,
            },
            body: 'Redirecting...',
          });
        } catch (err) {
          reject({
            statusCode: 500,
            body: JSON.stringify({ error: err.message }),
          });
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

  const sanitizeCSS = (css) =>
    (css || '').replace(/<\/?script[^>]*>/gi, '').replace(/url\(['"]?javascript:[^'"]*['"]?\)/gi, '');

  const safeCSS = sanitizeCSS(provider.style_css);

  const html = `<!DOCTYPE html>
  <html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Edit Provider Profile</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #000; color: #fff; padding: 1em; max-width: 900px; margin: auto; }
    h1, h2, h3 { color: #ffcc00; }
    nav { display: flex; flex-wrap: wrap; gap: 0.5em; justify-content: center; margin-bottom: 1.5em; }
    .nav-btn { padding: 0.6em 1em; border-radius: 6px; font-weight: bold; color: #fff; text-align: center; text-decoration: none; flex: 1 1 auto; }
    .blue { background-color: #007bff; } .purple { background-color: #6f42c1; } .teal { background-color: #20c997; } .red { background-color: #dc3545; }
    .nav-btn:hover { opacity: 0.9; }
    form { background: #111; padding: 1em; border-radius: 8px; }
    label { display: block; margin-bottom: 1em; font-weight: bold; color: #ffcc00; }
    input, textarea { width: 100%; padding: 0.6em; background: #222; color: #fff; border: 1px solid #444; border-radius: 4px; box-sizing: border-box; margin-top: 0.4em; }
    button { background-color: #ffcc00; color: #000; font-weight: bold; padding: 0.7em 1.2em; border: none; border-radius: 4px; cursor: pointer; width: 100%; }
    button:hover { background-color: #ffaa00; }
    img { max-width: 100%; height: auto; margin: 1em 0; border-radius: 8px; }
  </style>
  <style>
    #provider-theme {
      ${safeCSS}
    }
  </style>
  </head><body>
  <div id="provider-theme">
    <h1>Edit Profile for ${provider.name}</h1>
    <nav>
      <a class="nav-btn blue" href="/providers/${providerId}/admin">Dashboard</a>
      <a class="nav-btn purple" href="/providers/${providerId}/admin/stats">Stats</a>
      <a class="nav-btn teal" href="/providers/${providerId}/admin/profile">Profile</a>
      <a class="nav-btn red" href="/providers/${providerId}/logout">Logout</a>
    </nav>
    <form method="POST" enctype="multipart/form-data">
      <label>Name: <input name="name" value="${provider.name}" /></label>
      <label>Contact Email: <input name="contact_email" value="${provider.contact_email || ''}" type="email" /></label>
      <label>Bio: <textarea name="bio">${provider.bio || ''}</textarea></label>
      <label>Website: <input name="website" value="${provider.website || ''}" /></label>
      <label>Facebook: <input name="facebook" value="${provider.facebook || ''}" /></label>
      <label>Instagram: <input name="instagram" value="${provider.instagram || ''}" /></label>
      <label>YouTube: <input name="youtube" value="${provider.youtube || ''}" /></label>
      ${provider.logo_url ? `<img src="${provider.logo_url}" alt="Logo" style="max-width: 200px;" />` : ''}
      <label>Logo URL: <input name="logo_url" value="${provider.logo_url || ''}" /></label>
      <label>Upload Logo: <input type="file" name="logo" accept="image/*" /></label>
      <label>New Password: <input type="password" name="login_password" /></label>

      <label>Custom CSS (for #provider-theme only):
        <textarea name="style_css" rows="10" placeholder="#provider-theme { background: #111; }">${provider.style_css || ''}</textarea>
      </label>

      <h2>Services</h2>
      <div style="display:flex; flex-direction:column; gap:1em; margin-bottom:2em;">
        ${services.map(service => `
          <div style="border:1px solid #444; border-radius:8px; padding:1em; background:#1a1a1a;">
            <label>Service Name:
              <input name="service_name_${service.id}" value="${service.name || ''}" />
            </label>
            <label>Description:
              <textarea name="service_description_${service.id}">${service.description || ''}</textarea>
            </label>
            <label>Starting Price:
              <input name="service_price_${service.id}" value="${service.starting_price || ''}" type="number" step="0.01" />
            </label>
            <label>Unit:
              <input name="service_unit_${service.id}" value="${service.unit || ''}" />
            </label>
            <label style="color:red;">
              <input type="checkbox" name="delete_service_${service.id}" /> Delete this service
            </label>
          </div>`).join('')}
      </div>

      <div style="margin-bottom:1.5em;">
        <button type="button" onclick="document.getElementById('new-services').style.display = 'block'; this.style.display='none';" style="background:#333; color:#ffcc00; border:1px solid #555; padding:0.5em 1em; border-radius:5px;">
          + Add New Service
        </button>
      </div>

      <div id="new-services" style="display:none; margin-bottom:2em;">
        <h3>Add New Services</h3>
        <div style="display:flex; flex-direction:column; gap:1em;">
          ${(() => [1].map(n => `
            <div style="border:1px dashed #555; border-radius:8px; padding:1em; background:#111;">
              <label>New Service ${n} Name:
                <input name="new_service_name_${n}" />
              </label>
              <label>Description:
                <textarea name="new_service_description_${n}"></textarea>
              </label>
              <label>Starting Price:
                <input name="new_service_price_${n}" type="number" step="0.01" />
              </label>
              <label>Unit:
                <input name="new_service_unit_${n}" />
              </label>
            </div>`).join(''))()}
        </div>
      </div>

      <button type="submit">Save Changes</button>
    </form>
  </div>
  </body></html>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: html,
  };
};
