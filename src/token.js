const KEY_SECRET = 'furuCRM';

function b64urlToBytes(str) {
  let b64 = str.trim().replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function decryptToken(token) {
  if (!token || !token.trim()) throw new Error('Token is blank');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(KEY_SECRET));
  const key = await crypto.subtle.importKey('raw', digest, { name: 'AES-CBC' }, false, ['decrypt']);
  const data = b64urlToBytes(token);
  let payload;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: data.slice(0, 16) }, key, data.slice(16));
    payload = JSON.parse(new TextDecoder().decode(plain));
  } catch (e) {
    throw new Error('Invalid token');
  }
  if (Date.now() / 1000 > Number(payload.exp)) throw new Error('Token expired');
  return payload.email;
}

const ALLOWED_DOMAIN = '@furucrm.com';
const NOT_FOUND_URL = 'notfound.html';

function allowed(email) {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(ALLOWED_DOMAIN);
}
export async function ensureAccess() {
  const token = new URLSearchParams(location.search).get('token');
  let email = null;
  try {
    email = await decryptToken(token);
  } catch (e) {
    console.warn('[token]', e.message);
  }
  if (allowed(email)) return true;
  location.replace(NOT_FOUND_URL);
  return false;
}
