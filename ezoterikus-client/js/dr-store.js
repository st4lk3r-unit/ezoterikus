import * as ezo from './ezo.js';

const PREFIX = "signal/";

function abFromU8(u8){ return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength); }
function u8FromAb(ab){ return new Uint8Array(ab); }

async function loadJSON(ctx, path){
  const u8 = await ctx.fs.get(PREFIX + path);
  if (!u8) return null;
  try { return JSON.parse(new TextDecoder().decode(u8)); } catch { return null; }
}
async function saveJSON(ctx, path, obj){
  const u8 = new TextEncoder().encode(JSON.stringify(obj));
  await ctx.fs.put(PREFIX + path, u8);
}

export function makeSignalStore(ctx){
  return {
    _map: new Map(),

    async getIdentityKeyPair(){
      const j = await loadJSON(ctx, "idkp.json");
      if (!j) return undefined;
      return { pubKey: ezo.b64d(j.pub), privKey: ezo.b64d(j.priv) };
    },
    async getLocalRegistrationId(){
      const j = await loadJSON(ctx, "reg.json");
      return j?.id|0;
    },
    async saveIdentityKeyPair(keyPair){
      await saveJSON(ctx, "idkp.json", { pub: ezo.b64e(new Uint8Array(keyPair.pubKey)), priv: ezo.b64e(new Uint8Array(keyPair.privKey)) });
    },
    async saveRegistrationId(id){
      await saveJSON(ctx, "reg.json", { id: id|0 });
    },

    async isTrustedIdentity(address, identityKey){
      const key = `ident/${address.toString()}.b64`;
      const prev = await ctx.fs.get(PREFIX + key);
      const curB64 = ezo.b64e(new Uint8Array(identityKey));
      if (!prev) {
        await ctx.fs.put(PREFIX + key, new TextEncoder().encode(curB64));
        return true;
      }
      try {
        const prevB64 = new TextDecoder().decode(prev);
        return prevB64 === curB64;
      } catch { return false; }
    },
    async saveIdentity(address, identityKey){
      const key = `ident/${address.toString()}.b64`;
      await ctx.fs.put(PREFIX + key, new TextEncoder().encode(ezo.b64e(new Uint8Array(identityKey))));
    },

    async storePreKey(id, keyPair){
      await saveJSON(ctx, `prekeys/${id}.json`, { id, pub: ezo.b64e(new Uint8Array(keyPair.pubKey)), priv: ezo.b64e(new Uint8Array(keyPair.privKey)) });
    },
    async loadPreKey(id){
      const j = await loadJSON(ctx, `prekeys/${id}.json`);
      if (!j) return undefined;
      return { pubKey: ezo.b64d(j.pub), privKey: ezo.b64d(j.priv) };
    },
    async removePreKey(id){
      try { await ctx.fs.del(PREFIX + `prekeys/${id}.json`); } catch {}
    },

    async storeSignedPreKey(id, record){
      await saveJSON(ctx, `spk/${id}.json`, { id, pub: ezo.b64e(new Uint8Array(record.pubKey)), priv: ezo.b64e(new Uint8Array(record.privKey)) });
    },
    async loadSignedPreKey(id){
      const j = await loadJSON(ctx, `spk/${id}.json`);
      if (!j) return undefined;
      return { pubKey: ezo.b64d(j.pub), privKey: ezo.b64d(j.priv) };
    },

    async storeSession(address, record){
      const u8 = record instanceof Uint8Array ? record : new Uint8Array(record);
      await ctx.fs.put(PREFIX + `sessions/${address.toString()}.bin`, u8);
    },
    async loadSession(address){
      const u8 = await ctx.fs.get(PREFIX + `sessions/${address.toString()}.bin`);
      return u8 || undefined;
    },
    async removeSession(address){
      try { await ctx.fs.del(PREFIX + `sessions/${address.toString()}.bin`); } catch {}
    },
    async getSubDeviceSessions(name){
      return [];
    }
  };
}
