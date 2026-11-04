// 雲端歌詞和弦（Cloudflare Pages Functions + KV）
// GET    /api/chords?song=db15            → 這首的和弦 {map, sheet}，沒有就 404
// PUT    /api/chords?song=db15  (X-Edit-Key) → 存
// DELETE /api/chords?song=db15  (X-Edit-Key) → 刪除（回到自動對位）
// 需要在 Pages 專案設定 KV 綁定，變數名稱 CHORDS
// 編輯密碼：只存雜湊值，不存密碼本身
const HASH = 'c8a557906020b7e6636d9efc989ff9c3db52e225be8222620309d69bed2b54d5';

async function checkKey(pw) {
  if (!pw) return false;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('vg-salt:' + pw));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === HASH;
}

const SONG = /^(db|bb|xg|xb|er|tw)\d{1,4}$/;
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export async function onRequest({ request, env }) {
  if (!env.CHORDS) return json({ error: 'KV 未綁定（CHORDS）' }, 500);
  const song = new URL(request.url).searchParams.get('song') || '';
  if (!SONG.test(song)) return json({ error: 'song 格式錯誤' }, 400);
  const key = 'song:' + song;

  if (request.method === 'GET') {
    const v = await env.CHORDS.get(key);
    return v ? new Response(v, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }) : json({ error: 'not found' }, 404);
  }
  if (!(await checkKey(request.headers.get('X-Edit-Key')))) return json({ error: '密碼錯誤' }, 401);

  if (request.method === 'DELETE') {
    await env.CHORDS.delete(key);
    return json({ ok: true });
  }
  if (request.method === 'PUT') {
    const text = await request.text();
    if (text.length > 60000) return json({ error: '資料太大' }, 413);
    let data;
    try { data = JSON.parse(text); } catch (_) { return json({ error: 'JSON 錯誤' }, 400); }
    if (!data || typeof data.map !== 'object' || typeof data.sheet !== 'number') return json({ error: '格式錯誤' }, 400);
    data.updated = new Date().toISOString();
    await env.CHORDS.put(key, JSON.stringify(data));
    return json({ ok: true });
  }
  return json({ error: 'method' }, 405);
}
