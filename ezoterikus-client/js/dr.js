const lib = () => window.libsignal;

import * as ezo from './ezo.js';

const te = (s) => new TextEncoder().encode(s);
const td = (u8) => new TextDecoder().decode(u8);

function makeStores(ctx) {
  const ROOT = 'signal/';
  const get = (p) => ctx.fs.get(ROOT + p);
  const put = (p, u8) => ctx.fs.put(ROOT + p, u8);
  const del = (p) => ctx.fs.del(ROOT + p).catch(()=>{});
  const jget = async (p) => { const u=await get(p); return u?JSON.parse(td(u)):null; };
  const jput = (p, o) => put(p, te(JSON.stringify(o)));

  const idPath   = 'idkp.json';
  const regPath  = 'reg.json';

  return {
    async getIdentityKeyPair() {
      const j = await jget(idPath);
      if (!j) return null;
      return {
        pubKey: ezo.b64d(j.pub),
        privKey: ezo.b64d(j.priv),
      };
    },
    async getLocalRegistrationId() {
      const j = await jget(regPath);
      return j?.id ?? null;
    },
    async saveIdentity(keypair, regId) {
      await jput(idPath, {
        pub: ezo.b64e(new Uint8Array(keypair.pubKey)),
        priv: ezo.b64e(new Uint8Array(keypair.privKey)),
      });
      await jput(regPath, { id: regId|0 });
    },
    async isTrustedIdentity(/*addr, idKey*/) { return true; },
    async saveIdentityFor(/*addr, idKey*/) { /*optional*/ },

    async storePreKey(id, record) { await put(`prekeys/${id}.bin`, new Uint8Array(record)); },
    async loadPreKey(id) { return await get(`prekeys/${id}.bin`); },
    async removePreKey(id) { await del(`prekeys/${id}.bin`); },

    async storeSignedPreKey(id, record) { await put(`spk/${id}.bin`, new Uint8Array(record)); },
    async loadSignedPreKey(id) { return await get(`spk/${id}.bin`); },

    async storeSession(addr, record) { await put(`sessions/${addr}.bin`, new Uint8Array(record)); },
    async loadSession(addr) { return await get(`sessions/${addr}.bin`); },
    async containsSession(addr) { return !!(await get(`sessions/${addr}.bin`)); },
    async deleteSession(addr) { await del(`sessions/${addr}.bin`); },
    async getSubDeviceSessions(/*base*/) { return []; },
  };
}

/** One-time local device setup **/
export async function ensureLocalIdentity(ctx) {
  const L = lib();
  const store = makeStores(ctx);

  let kp = await store.getIdentityKeyPair();
  let reg = await store.getLocalRegistrationId();

  if (!kp || !reg) {
    const registrationId = L.KeyHelper.generateRegistrationId();
    const identityKeyPair = await L.KeyHelper.generateIdentityKeyPair(); // {pubKey, privKey} ArrayBuffers
    await store.saveIdentity(identityKeyPair, registrationId);
  }
  return store;
}

export async function buildPrekeyBundle(ctx, { spkId, opkId } = {}) {
  const L = lib();
  const store = await ensureLocalIdentity(ctx);
  const idkp = await store.getIdentityKeyPair();
  const regId = await store.getLocalRegistrationId();

  const _spkId = (spkId ?? (Date.now() % 0x7fff)) | 0;
  const _opkId = (opkId ?? ((_spkId + 1) % 0x7fff)) | 0;

  const spk = await L.KeyHelper.generateSignedPreKey(idkp, _spkId);
  await store.storeSignedPreKey(spk.keyId, spk.keyPair);

  const opk = await L.KeyHelper.generatePreKey(_opkId);
  await store.storePreKey(opk.keyId, opk.keyPair);

  return {
    registrationId: regId,
    identityKey_b64: ezo.b64e(new Uint8Array(idkp.pubKey)),
    signedPreKey: {
      id: spk.keyId,
      key_b64: ezo.b64e(new Uint8Array(spk.keyPair.publicKey || spk.keyPair.pubKey || spk.keyPair)), // compat
      sig_b64: ezo.b64e(new Uint8Array(spk.signature)),
    },
    oneTimePreKey: {
      id: opk.keyId,
      key_b64: ezo.b64e(new Uint8Array(opk.keyPair.publicKey || opk.keyPair.pubKey || opk.keyPair)),
    }
  };
}

export async function makeFriendCardV3(profile, ctx, _opts={}) {
  const b = await buildPrekeyBundle(ctx, _opts);
  return {
    kind: 'ezocard/v3',
    proto: 'x3dh+dr/signal-2025',
    user: {
      id: profile.inboxId || profile.name,
      inbox: profile.inboxId || profile.name,
      name: profile.name || '',
      bio: profile.bio || '',
      avatar: profile.avatar || undefined
    },
    signal: {
      registrationId: b.registrationId,
      deviceId: 1,
      identityKey: b.identityKey_b64,
      signedPreKey: { id: b.signedPreKey.id, key: b.signedPreKey.key_b64, sig: b.signedPreKey.sig_b64 },
      oneTimePreKeys: [{ id: b.oneTimePreKey.id, key: b.oneTimePreKey.key_b64 }],
    },
    alg: { kdf:'HKDF-SHA256', aead:'AES-256-GCM', curve:'X25519' },
    capabilities: { dr:true, groups:false, files:false }
  };
}

function cardToPreKeyBundle(cardV3) {
  const idKey = ezo.b64d(cardV3.signal.identityKey);
  const spk   = cardV3.signal.signedPreKey;
  const opk   = (cardV3.signal.oneTimePreKeys && cardV3.signal.oneTimePreKeys[0]) || null;

  const bundle = {
    registrationId: cardV3.signal.registrationId | 0,
    identityKey: idKey.buffer.slice(idKey.byteOffset, idKey.byteOffset + idKey.byteLength),
    signedPreKey: {
      keyId: spk.id | 0,
      publicKey: ezo.b64d(spk.key).buffer,
      signature: ezo.b64d(spk.sig).buffer
    }
  };
  if (opk) {
    bundle.preKey = {
      keyId: opk.id | 0,
      publicKey: ezo.b64d(opk.key).buffer
    };
  }
  return bundle;
}

export async function ensureSessionFromCard(ctx, friendId, cardV3) {
  const L = lib();
  const store = await ensureLocalIdentity(ctx);
  const addr = new L.SignalProtocolAddress(String(friendId), 1);

  const sb = new L.SessionBuilder(store, addr);

  const preKeyBundle = cardToPreKeyBundle(cardV3);
  await sb.processPreKey(preKeyBundle);

  return addr;
}

/** Encrypt via DR; returns { type: 'prekey'|'signal'|3, body: Uint8Array } */
export async function drEncrypt(ctx, addr, plaintextU8) {
  const L = lib();
  const store = await ensureLocalIdentity(ctx);
  const sc = new L.SessionCipher(store, addr);
  const out = await sc.encrypt(plaintextU8);
  // out: { type: 3 | 1, body: ArrayBuffer }
  return { type: out.type, body: new Uint8Array(out.body) };
}
