export const EZO_VERSION = "ezo-v3.0.5 dev";

//////////////////////
// Encoding helpers //
//////////////////////
export const te = (s)=> new TextEncoder().encode(String(s));
export const td = (u8)=> new TextDecoder().decode(u8);

export function b64e(u8){
  const bin = Array.from(u8).map(b=>String.fromCharCode(b)).join("");
  return btoa(bin);
}
export function b64d(b64){
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

function normPass(pass){ return String(pass||"").normalize("NFKC"); }

//////////////////////////////
// WebCrypto AES-GCM / HKDF //

//////////////////////////
// UUID helpers (v4)    //
//////////////////////////
export function genUuidV4(){
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x=>x.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function isUuidV4(s){
  return typeof s==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

//////////////////////////////
const subtle = crypto.subtle;

// HKDF -> AES-GCM 256 key
export async function hkdf(ikmU8, infoU8){
  const salt = new Uint8Array(32); // all-zero salt for domain separation
  const base = await subtle.importKey("raw", ikmU8, "HKDF", false, ["deriveKey"]);
  const key = await subtle.deriveKey(
    { name:"HKDF", hash:"SHA-256", salt, info: infoU8||te("") },
    base,
    { name:"AES-GCM", length:256 },
    false,
    ["encrypt","decrypt"]
  );
  return key;
}

export async function aesGcmEnc(key, ptU8, aadU8){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name:"AES-GCM", iv, additionalData: aadU8||new Uint8Array(0) }, key, ptU8));
  return { iv, ct };
}
export async function aesGcmDec(key, iv, ct, aadU8){
  const pt = new Uint8Array(await subtle.decrypt({ name:"AES-GCM", iv, additionalData: aadU8||new Uint8Array(0) }, key, ct));
  return pt;
}

/////////////////////////
// Wire message format //
/////////////////////////
export function packMsg(t, d){ return te(JSON.stringify({ t, d })); }
export function unpackMsg(u8){
  try {
    const o = JSON.parse(td(u8));
    if (!o || typeof o.t!=="string") return null;
    return o;
  } catch(e) { return null; }
}

/////////////////////
// Friend card I/O //
/////////////////////
export function makeFriendCard({ id, name, bio, inbox, pubB64, avatar }){
  return {
    kind: "ezocard/v1",
    id: String(id||name||""),
    name: String(name||id||""),
    bio: String(bio||""),
    inbox: String(inbox||id||""),
    pubB64: String(pubB64||""),
    avatar: avatar ? String(avatar) : undefined
  };
}
export function isFriendCard(obj){
  return !!(obj && obj.kind==="ezocard/v1" && obj.id && obj.pubB64);
}
export async function readFriendCardFromFile(file){
  const txt = await file.text();
  const obj = JSON.parse(txt);
  if (!isFriendCard(obj)) throw new Error("bad card");
  return obj;
}
export function downloadFriendCard(card, filename){
  const blob = new Blob([JSON.stringify(card,null,2)], { type:"application/json" });
  const a = document.createElement("a");
  a.download = filename||"friend.ezocard.json";
  a.href = URL.createObjectURL(blob);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

/////////////////////
// Groups (PoC)    //
/////////////////////
async function importGroupKey(rawKeyU8){
  return await subtle.importKey("raw", rawKeyU8, { name:"AES-GCM" }, false, ["encrypt","decrypt"]);
}
export async function createGroup(ctx, name){
  const id = genUuidV4();
  const key = crypto.getRandomValues(new Uint8Array(32));
  const g = { id, name: String(name||id), members: [], keyB64: b64e(key), createdAt: Date.now() };
  await saveGroup(ctx, g);
  return g;
}
export async function groupEncrypt(g, ptU8){
  const key = await importGroupKey(b64d(g.keyB64));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name:"AES-GCM", iv }, key, ptU8));
  return { iv, ct };
}
export async function groupDecrypt(g, iv, ct){
  const key = await importGroupKey(b64d(g.keyB64));
  const pt = new Uint8Array(await subtle.decrypt({ name:"AES-GCM", iv }, key, ct));
  return pt;
}

/////////////////////////////////////////////
// Encrypted archive stored in localStorage //
/////////////////////////////////////////////
/*
Storage layout:
  localStorage["ezo:index"] = JSON.stringify({ profiles: [name,...] })
  localStorage[`ezo:profile:${name}`] = JSON of encrypted bundle:
    { v:1, name, saltB64, ivB64, ctB64 }
Decrypted "bundle" is JSON: { files: { <path>: <base64 bytes>, ... }, meta? }
ctx.fs is a simple KV wrapper over this in-memory map. Every write persists immediately.
*/

const LS_INDEX = "ezo:index";
function readIndex(){
  try { return JSON.parse(localStorage.getItem(LS_INDEX) || '{"profiles":[]}'); }
  catch(e) { return { profiles: [] }; }
}
function writeIndex(idx){ localStorage.setItem(LS_INDEX, JSON.stringify(idx)); }
function profKey(name){ return `ezo:profile:${name}`; }


/* ---------- Hardened Argon2id key derivation with autotune ---------- */
const A2_DEFAULTS = {
  targetMsDesktop: 450, 
  targetMsMobile: 700,

  minMemKiB: 64 * 1024,
  maxMemKiB: 512 * 1024,

  minT: 3,
  maxT: 6,

  p: 1,

  version: 0x13,
};

function isLikelyMobile() {
  const dm = (navigator.deviceMemory || 4);
  const ua = navigator.userAgent || "";
  return dm <= 4 || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

let _argon2Tuned = null;

async function tuneArgon2(passU8, saltU8) {
  const a = (typeof window !== 'undefined') ? window.argon2 : globalThis.argon2;
  if (!a?.hash || !a?.ArgonType) throw new Error("argon2-missing");

  const mobile = isLikelyMobile();
  const targetMs = mobile ? A2_DEFAULTS.targetMsMobile : A2_DEFAULTS.targetMsDesktop;

  let m = mobile ? 128 * 1024 : 256 * 1024;
  let t = 4;
  const p = A2_DEFAULTS.p;

  m = Math.max(A2_DEFAULTS.minMemKiB, Math.min(m, A2_DEFAULTS.maxMemKiB));
  t = Math.max(A2_DEFAULTS.minT, Math.min(t, A2_DEFAULTS.maxT));

  const probe = async (mKiB, tVal) => {
    const start = performance.now();
    await a.hash({
      pass: passU8, salt: saltU8,
      time: tVal, mem: mKiB, parallelism: p, hashLen: 16,
      type: a.ArgonType.Argon2id, version: A2_DEFAULTS.version,
    });
    return performance.now() - start;
  };

  let ms;
  while (true) {
    try {
      ms = await probe(m, t);
      break;
    } catch (e) {
      if (m > A2_DEFAULTS.minMemKiB) {
        m = Math.max(A2_DEFAULTS.minMemKiB, Math.floor(m / 2));
        continue;
      }
      if (t > A2_DEFAULTS.minT) { t--; continue; }
      ms = null;
      break;
    }
  }

  if (ms != null) {
    for (let i = 0; i < 4; i++) {
      if (ms > targetMs * 1.25) {
        if (m > A2_DEFAULTS.minMemKiB) m = Math.max(A2_DEFAULTS.minMemKiB, Math.floor(m / 2));
        else if (t > A2_DEFAULTS.minT) t--;
        else break;
      } else if (ms < targetMs * 0.7) {
        if (m < A2_DEFAULTS.maxMemKiB) m = Math.min(A2_DEFAULTS.maxMemKiB, m * 2);
        else if (t < A2_DEFAULTS.maxT) t++;
        else break;
      } else {
        break;
      }
      try { ms = await probe(m, t); } catch { /* if OOM, we’ll reduce next loop */ }
    }
  }

  return { t, m, p, version: A2_DEFAULTS.version };
}

export async function argon2idKey(passU8, saltU8, opts = {}) {
  const a = (typeof window !== 'undefined') ? window.argon2 : globalThis.argon2;
  if (!a?.hash || !a?.ArgonType) throw new Error("argon2-missing");
  if (!(saltU8 instanceof Uint8Array) || saltU8.length < 16) {
    throw new Error("argon2: salt must be Uint8Array ≥16 bytes");
  }

  let params;
  if (opts && (opts.t || opts.m || opts.p)) {
    params = {
      t: Math.max(A2_DEFAULTS.minT, Math.min(opts.t ?? 4, A2_DEFAULTS.maxT)),
      m: Math.max(A2_DEFAULTS.minMemKiB, Math.min(opts.m ?? (isLikelyMobile()?128*1024:256*1024), A2_DEFAULTS.maxMemKiB)),
      p: A2_DEFAULTS.p,
      version: A2_DEFAULTS.version,
    };
  } else {
    if (!_argon2Tuned) _argon2Tuned = tuneArgon2(passU8, saltU8).catch(() => null);
    params = await _argon2Tuned || {
      t: 4,
      m: isLikelyMobile() ? 128*1024 : 256*1024,
      p: A2_DEFAULTS.p,
      version: A2_DEFAULTS.version,
    };
  }

  const res = await a.hash({
    pass: passU8,
    salt: saltU8,
    time: params.t,
    mem: params.m,          // KiB
    parallelism: params.p,
    hashLen: 32,
    type: a.ArgonType.Argon2id,
    version: params.version,
  });

  const raw = new Uint8Array(res.hash); // 32 bytes
  return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt","decrypt"]);
}

export const ARGON2_CANON = { t: 4, m: 256*1024, p: 1, version: 0x13 };


/* ---------- Encrypt / Decrypt bundle ---------- */

async function encryptBundle(pass, bundleObj){
  const passN = normPass(pass);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await argon2idKey(te(passN), salt, ARGON2_CANON);
  const pt   = te(JSON.stringify(bundleObj));
  const ct   = new Uint8Array(await subtle.encrypt({ name:"AES-GCM", iv }, key, pt));
  return { v:2, kdf:{ name:"argon2id", ...ARGON2_CANON, saltB64: b64e(salt) }, ivB64: b64e(iv), ctB64: b64e(ct) };
}

function pullB64(obj, a, b){
  if (obj[a]) return obj[a];
  if (obj[b]) return obj[b];
  return null;
}


async function tryDecrypt(pass, pack){
  const passN = normPass(pass);
  const ivB64   = pullB64(pack, "ivB64",   "iv");
  const ctB64   = pullB64(pack, "ctB64",   "ct");
  if (!ivB64 || !ctB64) throw new Error("archive-corrupt");
  const iv   = b64d(String(ivB64).trim());
  const ct   = b64d(String(ctB64).trim());
  if (iv.length !== 12) throw new Error("archive-corrupt");

  // Preferred: Argon2id (v2)
  if (pack && pack.kdf && (pack.kdf.name === "argon2id" || pack.kdf.name === "ARGON2ID")) {
    const saltB64 = pack.kdf.saltB64 || pullB64(pack.kdf, "saltB64", "salt");
    if (!saltB64) throw new Error("archive-corrupt");
    const salt = b64d(String(saltB64).trim());
    const params = { t: Number(pack.kdf.t)||3, m: Number(pack.kdf.m)||65536, p: Number(pack.kdf.p)||1 };
    const key  = await argon2idKey(te(passN), salt, params);
    const pt   = new Uint8Array(await subtle.decrypt({ name:"AES-GCM", iv }, key, ct));
    return JSON.parse(td(pt));
  }

  throw new Error("archive-corrupt");
}

async function decryptBundle(pass, pack){
  try { return await tryDecrypt(pass, pack); }
  catch (e1) {
    if (String(e1?.message||"").includes("archive-corrupt")) throw new Error("archive-corrupt");
    throw new Error("bad-password");
  }
}

/* ---------- Profiles API ---------- */
export async function listProfiles(){
  const idx = readIndex();
  return idx.profiles.map(name=>({ name, handle: name }));
}

export async function createProfileArchive(name, pass){
  name = String(name||"user");
  const idx = readIndex();
  if (!idx.profiles.includes(name)) { idx.profiles.push(name); writeIndex(idx); }
  const bundle = {
    files: {
      "profile/name": b64e(te(name)),
      "friends/_deleted.json": b64e(te("[]")),
      "profile/settings.json": b64e(te(JSON.stringify({ autoPoll:false, pollMs:5000, relays: [] }))),
      "profile/inbox.txt": b64e(te(crypto.randomUUID()))
    },
    meta: { createdAt: Date.now(), v:2, kdf:"argon2id" }
  };
  const enc = await encryptBundle(pass, bundle);
  localStorage.setItem(profKey(name), JSON.stringify({ v:2, name, ...enc }));
  return { fh: name };
}

export async function removeProfileArchive(name){
  const idx = readIndex();
  const i = idx.profiles.indexOf(name);
  if (i>=0) { idx.profiles.splice(i,1); writeIndex(idx); }
  localStorage.removeItem(profKey(name));
}

export async function importArchive(file){
  const txt = await file.text();
  const obj = JSON.parse(txt);
  if (!obj || !obj.name) throw new Error("bad archive");
  const hasEnc = !!(pullB64(obj,"ctB64","ct") && pullB64(obj,"ivB64","iv") && (obj.kdf && (obj.kdf.saltB64 || obj.kdf.salt) || pullB64(obj,"saltB64","salt")));
  if (!hasEnc) throw new Error("bad archive");
  const idx = readIndex();
  if (!idx.profiles.includes(obj.name)) { idx.profiles.push(obj.name); writeIndex(idx); }
  localStorage.setItem(profKey(obj.name), JSON.stringify(obj));
}

export async function downloadArchive(handle, filename){
  const raw = localStorage.getItem(profKey(handle));
  if (!raw) throw new Error("missing");
  const blob = new Blob([raw], { type:"application/json" });
  const a = document.createElement("a");
  a.download = (filename && filename.endsWith(".ezo")) ? filename : `${handle}.ezo`;
  a.href = URL.createObjectURL(blob);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Archive open: ctx with fs.get/put that persist immediately ---------- */
export async function openArchive(handle, pass){
  
  let passRef = { value: pass }; // current archive password for persist
const raw = localStorage.getItem(profKey(handle));
  if (!raw) throw new Error("archive-not-found");
  let pack;
  try { pack = JSON.parse(raw); } catch(e) { throw new Error("archive-corrupt"); }

  let bundle;
  try { bundle = await decryptBundle(pass, pack); }
  catch (e) {
    const m = String(e?.message||"");
    if (m==="archive-not-found" || m==="archive-corrupt") throw e;
    if (m==="bad-password") throw new Error("bad-password");
    throw new Error("bad-password");
  }

  // Build in-memory FS map
  const map = new Map();
  const files = bundle.files || {};
  for (const p of Object.keys(files)) {
    map.set(p, b64d(files[p]));
  }

  async function persist(){
    const filesOut = {};
    for (const [p, u8] of map.entries()) filesOut[p] = b64e(u8);
    const nextBundle = { files: filesOut, meta: bundle.meta||{ v:1 } };
    const enc = await encryptBundle(passRef.value, nextBundle);
    localStorage.setItem(profKey(handle), JSON.stringify({ v:2, name: handle, ...enc }));
  }

  const fs = {
    async get(path){ return map.get(path) || null; },
    async put(path, bytes){ map.set(path, bytes); await persist(); },
    async del(path){ map.delete(path); await persist(); },
    async list(prefix){
      const out = [];
      for (const k of map.keys()) if (!prefix || k.startsWith(prefix)) out.push(k);
      return out;
    },
  };
  return { handle, fs, setPass:(p)=>{ passRef.value = String(p||""); } };
}

/////////////////////////////
// Profile high-level I/O  //
/////////////////////////////
export async function readFileFromArchive(ctx, path){
  if (!ctx || !ctx.fs) throw new Error("bad ctx");
  const entry = await ctx.fs.get(path);
  if (!entry) throw new Error("missing "+path);
  return entry;
}
export async function writeFileToArchive(ctx, path, bytes){
  if (!ctx || !ctx.fs) throw new Error("bad ctx");
  await ctx.fs.put(path, bytes);
}

export async function loadProfile(ctx){
  const res = { name:"", bio:"", avatar:null, settings:null, inboxId:null };
  try {
    const name = await ctx.fs.get("profile/name");
    const bio  = await ctx.fs.get("profile/bio");
    const avatar = await ctx.fs.get("profile/avatar.jpg");
    const settings = await ctx.fs.get("profile/settings.json");
    const inbox = await ctx.fs.get("profile/inbox.txt");
    if (name)  res.name = td(name);
    if (bio)   res.bio  = td(bio);
    if (avatar) res.avatar = new Uint8Array(avatar);
    if (inbox) {
      const val = td(inbox);
      res.inboxId = isUuidV4(val) ? val : null;
    }
    if (!res.inboxId) {
      const id = genUuidV4();
      await writeFileToArchive(ctx, "profile/inbox.txt", te(id));
      res.inboxId = id;
    }
    if (settings) {
      try { res.settings = JSON.parse(td(settings)); } catch(e) { res.settings = null; }
    }
  } catch (e) {}
  return res;
}

export async function saveProfileFields(ctx, { name, bio, avatarBytes, settings, inboxId } = {}){
  if (name != null) await writeFileToArchive(ctx, "profile/name", te(String(name)));
  if (bio  != null) await writeFileToArchive(ctx, "profile/bio",  te(String(bio)));
  if (avatarBytes)  await writeFileToArchive(ctx, "profile/avatar.jpg", avatarBytes);
  if (inboxId) await writeFileToArchive(ctx, "profile/inbox.txt", te(String(inboxId)));
  if (settings){
    const buf = te(JSON.stringify(settings));
    await writeFileToArchive(ctx, "profile/settings.json", buf);
  }
}

//////////////////////
// Friends (archive) //
//////////////////////
function friendPath(id){ return `friends/${id}.json`; }
const FRIENDS_DELETED = "friends/_deleted.json";

export async function saveFriend(ctx, fr){
  const obj = {
    id: fr.id, name: fr.name||fr.id, inbox: fr.inbox||fr.id, pubB64: fr.pubB64,
    bio: fr.bio||"", createdAt: fr.createdAt||Date.now(), mutual: !!fr.mutual, ack: !!fr.ack,
    avatar: fr.avatar || undefined
  };
  await writeFileToArchive(ctx, friendPath(fr.id), te(JSON.stringify(obj)));
}
export async function loadFriend(ctx, path){
  const u8 = await readFileFromArchive(ctx, path);
  const o = JSON.parse(td(u8));
  // Fill missing id from filename
  if (!o.id) {
    const m = /friends\/([^\/]+)\.json$/.exec(path) || /([^\/]+)\.json$/.exec(path);
    if (m) o.id = m[1];
  }
  // Sane defaults
  o.name = o.name || o.id || "";
  o.inbox = o.inbox || o.id || "";
  o.bio = o.bio || "";
  o.mutual = !!o.mutual;
  o.ack = !!o.ack;
  return o;
}
export function listFriendEntries(ctx){
  if (!(ctx && ctx.fs && typeof ctx.fs.list === 'function')) return [];
  return ctx.fs.list("friends/").then(list => {
    list = Array.isArray(list) ? list : [];
    const out = [];
    for (const ent of list) {
      if (typeof ent === "string") {
        const p = ent.startsWith("friends/") ? ent : ("friends/" + ent.replace(/^\//, ""));
        if (p.endsWith(".json") && p !== "friends/_deleted.json") out.push(p);
      } else if (ent && typeof ent === "object") {
        // Support objects like { path, name } or { name }
        const name = (ent.path || ent.name || "").toString();
        const p = name.startsWith("friends/") ? name : ("friends/" + name.replace(/^\//, ""));
        if (p.endsWith(".json") && p !== "friends/_deleted.json") out.push(p);
      }
    }
    return out;
  });
}
export async function markFriendDeleted(ctx, id){
  let arr = [];
  try {
    const u8 = await ctx.fs.get(FRIENDS_DELETED);
    if (u8) arr = JSON.parse(td(u8));
  } catch (e) {}
  if (!arr.includes(id)) arr.push(id);
  await writeFileToArchive(ctx, FRIENDS_DELETED, te(JSON.stringify(arr)));
  try { await ctx.fs.del(friendPath(id)); } catch(e) {}
}
export function listDeletedFriendIds(ctx){
  return (async ()=>{
    try {
      const u8 = await ctx.fs.get(FRIENDS_DELETED);
      if (!u8) return [];
      const arr = JSON.parse(td(u8));
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  })();
}

export async function saveGroup(ctx, g){
  const obj = {
    id: g.id, name: g.name, members: g.members||[], keyB64: g.keyB64, createdAt: g.createdAt||Date.now()
  };
  await writeFileToArchive(ctx, groupPath(g.id), te(JSON.stringify(obj)));
}
export async function loadGroup(ctx, path){
  const u8 = await readFileFromArchive(ctx, path);
  const o = JSON.parse(td(u8));
  return o;
}
export function listGroupEntries(ctx){
  return (ctx && ctx.fs && ctx.fs.list) ? ctx.fs.list("groups/").then(list => list.filter(p=>p.endsWith(".json"))) : [];
}

/////////////////////////////
// Misc small conveniences //
/////////////////////////////
export function downloadBytes(bytes, filename, mime){
  const blob = new Blob([bytes], { type: mime||"application/octet-stream" });
  const a = document.createElement("a");
  a.download = filename||"file.bin";
  a.href = URL.createObjectURL(blob);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

export async function changeArchivePassword(ctx, oldPass, newPass){
  if (!ctx || !ctx.handle || !ctx.fs) throw new Error("bad ctx");
  oldPass = normPass(oldPass); newPass = normPass(newPass);
  if (!newPass) throw new Error("empty-new-pass");
  const filesOut = {};
  const all = await ctx.fs.list("");
  for (const p of all) {
    const u8 = await ctx.fs.get(p);
    filesOut[p] = b64e(u8);
  }
  const bundle = { files: filesOut, meta: { v:2, changedAt: Date.now() } };
  const enc = await encryptBundle(newPass, bundle);
  localStorage.setItem(profKey(ctx.handle), JSON.stringify({ v:2, name: ctx.handle, ...enc }));
  ctx.setPass(newPass);
  return true;
}
