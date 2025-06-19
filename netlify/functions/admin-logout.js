exports.handler = async function () {
  return {
    statusCode: 302,
    headers: {
      'Set-Cookie': 'admin_auth=; HttpOnly; Path=/; Max-Age=0',
      Location: '/admin/login'
    },
    body: 'Redirecting to login...'
  };
};
