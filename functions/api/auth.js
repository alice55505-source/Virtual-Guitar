// POST /api/auth  (X-Edit-Key) → 密碼對不對
// 編輯密碼：只存雜湊值，不存密碼本身
const HASH = '6fb09b25d1fe31da77349bba54a4cd722b2c967aa1fe95a3f4fbafec41ca43c2';

async function checkKey(pw) {
  if (!pw) return false;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('vg-salt:' + pw));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === HASH;
}

export async function onRequestPost({ request }) {
  const ok = await checkKey(request.headers.get('X-Edit-Key'));
  return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 401, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
