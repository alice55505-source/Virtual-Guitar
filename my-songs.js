'use strict';
/* ========== 我的詩歌：匯入的樂譜圖片，存在這支手機（IndexedDB） ========== */
const MY_DB = 'vg-my', MY_STORE = 'songs';
let myList = []; // [{id, name}]，依匯入時間排序

function myDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(MY_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(MY_STORE, { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function myReq(mode, fn) {
  const db = await myDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MY_STORE, mode);
    const req = fn(tx.objectStore(MY_STORE));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  });
}
async function myRefresh() {
  try {
    const all = (await myReq('readonly', (s) => s.getAll())) || [];
    myList = all.map((r) => ({ id: r.id, name: r.name })).sort((a, b) => a.id - b.id);
  } catch (_) { myList = []; }
  return myList;
}
const myGet = (id) => myReq('readonly', (s) => s.get(id));
const myDelete = (id) => myReq('readwrite', (s) => s.delete(id));
const myName = (id) => (myList.find((m) => m.id === id) || {}).name;

// 圖片縮到寬 1200 以內再存，省空間
function shrinkImage(file, maxW = 1200) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => resolve(b || file), 'image/jpeg', 0.92);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// 一次選的幾張圖 = 同一首歌的幾頁（依檔名排序）
async function myImport(files) {
  files = [...files].filter((f) => f.type.startsWith('image/')).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!files.length) return null;
  const def = files[0].name.replace(/\.[^.]+$/, '');
  const name = (prompt('詩歌名稱', def) || def).trim() || def;
  const images = [];
  for (const f of files) images.push(await shrinkImage(f));
  const id = Date.now();
  // 請瀏覽器把資料標成「保留」，空間不足時才不會被自動清掉
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) {}
  await myReq('readwrite', (s) => s.put({ id, name, images }));
  await myRefresh();
  return id;
}
