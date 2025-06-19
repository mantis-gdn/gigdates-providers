const mysql = require('mysql2/promise');

exports.handler = async function (event) {
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
    const formData = new URLSearchParams(event.body);
    const purgeId = formData.get('purge');
    const statusChangeId = formData.get('status_change');
    const newStatus = formData.get('new_status');

    try {
      if (purgeId) {
        await pool.query('DELETE FROM provider_services WHERE provider_id = ?', [purgeId]);
        await pool.query('DELETE FROM providers WHERE provider_id = ?', [purgeId]);
        return {
          statusCode: 302,
          headers: { Location: '/admin' },
          body: 'Redirecting after purge...'
        };
      } else if (statusChangeId && newStatus) {
        await pool.query('UPDATE providers SET status = ? WHERE provider_id = ?', [newStatus, statusChangeId]);
        return {
          statusCode: 302,
          headers: { Location: '/admin' },
          body: 'Redirecting after status update...'
        };
      }
    } catch (err) {
      return { statusCode: 500, body: 'Error updating provider: ' + err.message };
    }
  }

  const [providers] = await pool.query(
    'SELECT * FROM providers ORDER BY date_added DESC'
  );
  const [services] = await pool.query('SELECT * FROM provider_services');

  const servicesByProvider = {};
  services.forEach(service => {
    if (!servicesByProvider[service.provider_id]) {
      servicesByProvider[service.provider_id] = [];
    }
    servicesByProvider[service.provider_id].push(service);
  });

  const providerCards = providers.map(provider => {
    const serviceList = servicesByProvider[provider.provider_id] || [];
    const serviceHTML = serviceList.map(
      s => `<li>${s.name} - ${s.starting_price || 'N/A'} ${s.unit || ''}</li>`
    ).join('');

    return `
      <div style="border:1px solid #444; padding:16px; margin:20px 0; background:#111; color:#eee; border-radius:8px;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <h2 style="margin:0;">${provider.name}</h2>
          <span style="padding:4px 8px; border-radius:4px; background:${
            provider.status === 'active' ? '#2e7d32' : '#c62828'
          }; color:white;">${provider.status}</span>
        </div>
        ${provider.logo_url ? `<img src="${provider.logo_url}" alt="Logo" style="max-height:50px; margin:10px 0;">` : ''}
        <p><strong>Email:</strong> ${provider.contact_email || '—'}</p>
        <p><strong>Location:</strong> ${provider.location || '—'}</p>
        <p><strong>Date Added:</strong> ${new Date(provider.date_added).toLocaleString()}</p>
        <p><strong>Services:</strong></p>
        <ul>${serviceHTML || '<li>No services listed.</li>'}</ul>

        <form method="POST" style="margin-top:10px;">
          <input type="hidden" name="status_change" value="${provider.provider_id}">
          <label for="new_status_${provider.provider_id}">Change Status:</label>
          <select name="new_status" id="new_status_${provider.provider_id}">
            <option value="active"${provider.status === 'active' ? ' selected' : ''}>Active</option>
            <option value="inactive"${provider.status === 'inactive' ? ' selected' : ''}>Inactive</option>
          </select>
          <button type="submit" style="margin-left:8px; padding:4px 10px;">Update</button>
        </form>

        <form method="POST" onsubmit="return confirm('Are you sure you want to PURGE this provider and all its data?');" style="margin-top:10px;">
          <input type="hidden" name="purge" value="${provider.provider_id}">
          <button type="submit" style="background:red; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;">Purge Provider</button>
        </form>
      </div>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Provider Admin</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
    </head>
    <body style="background:#000; color:#fff; font-family:sans-serif; padding:20px; max-width:900px; margin:auto;">
      <h1>All Providers</h1>
      ${providerCards || '<p>No providers found.</p>'}
    </body>
    </html>
  `;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: html
  };
};
