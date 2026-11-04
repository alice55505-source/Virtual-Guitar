// POST /api/auth  (X-Edit-Key) → 密碼對不對
// 編輯密碼：只存雜湊值，不存密碼本身
const HASH = 'c8a557906020b7e6636d9efc989ff9c3db52e225be8222620309d69bed2b54d5';

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
