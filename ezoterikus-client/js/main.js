import * as ezo from './ezo.js';
window.ezo = ezo;
import * as ui from './ui.js';
import { enhanceUI } from './ui/index.js';
import * as relay from './relay.js';
import { State, setProfile, setSettings, loadChatsOnOpen } from './state.js';
import { x25519 } from "https://esm.sh/@noble/curves@1.6.0/ed25519";
import { initSanitizer } from './ui/sanitize/sanitize.js';
await initSanitizer();


const $=(id)=>document.getElementById(id);

window.applyAutoPoll = ui.applyAutoPoll;

$("sendBtn")?.addEventListener("click", ui.sendNow);
$("composerInput")?.addEventListener("keydown",(e)=>{ if (e.key==="Enter" && (e.ctrlKey||e.metaKey)) ui.sendNow(); });

function showProfileManager(){
  $("paywallProfile")?.classList.add("show");
  populateProfiles();
  $("pmOpen")?.addEventListener("click", openSelectedProfile);
  $("pmCreate")?.addEventListener("click", createProfile);
  $("pmDownload")?.addEventListener("click", downloadSelected);
  $("pmDelete")?.addEventListener("click", deleteSelected);
  const imp = $("pmImport");
  if (imp) imp.onchange = importArchiveFile;
}
function hideProfileManager(){ $("paywallProfile")?.classList.remove("show"); }

async function populateProfiles(){
  const sel = $("pmSelect"); if (!sel) return;
  sel.innerHTML="";
  const list = await ezo.listProfiles();
  if (!list || list.length === 0) {
    const opt = document.createElement("option");
    opt.value = ""; opt.textContent = "(no profiles yet)";
    sel.appendChild(opt);
    return;
  }
  list.forEach(p=>{ const o=document.createElement("option"); o.value=p.name; o.textContent=p.name; sel.appendChild(o); });
}

function normPass(s){ return (s||"").normalize("NFKC"); }

async function openSelectedProfile(){
  const name = $("pmSelect")?.value;
  const pass = normPass($("pmPass")?.value);
  const list = await ezo.listProfiles();
  const p = list?.find(x=>x.name===name);
  if (!p || !name) { ui.showWarn("No profile selected", "Pick a profile from the list."); return; }
  if (!pass) { ui.showWarn("Password required", "Enter your profile password."); return; }

  try {
    const ctx = await ezo.openArchive(p.handle, pass);

    // keys (generate if missing)
    let priv, pub;
    try {
      priv = new Uint8Array(await ezo.readFileFromArchive(ctx, "profile/privkey"));
      pub  = new Uint8Array(await ezo.readFileFromArchive(ctx, "profile/pubkey"));
    } catch {
      priv = x25519.utils.randomPrivateKey();
      pub  = x25519.getPublicKey(priv);
      await ezo.writeFileToArchive(ctx, "profile/privkey", priv);
      await ezo.writeFileToArchive(ctx, "profile/pubkey", pub);
    }

    const meta = await ezo.loadProfile(ctx);
    const settings = meta.settings || { autoPoll:false, pollMs:5000, relays: [] };
    setSettings(settings);

    setProfile({ fh:p.handle, ctx, name: meta.name || name, bio: meta.bio || "", avatar: meta.avatar || null, priv, pub, settings, inboxId: meta.inboxId });

    // friends
    const deletedIds = new Set(await ezo.listDeletedFriendIds(ctx)); // <-- FIX: await
    State.friends.clear();
    const fEntries = await ezo.listFriendEntries(ctx);               // <-- FIX: await
    for (const path of fEntries) {
      const fr = await ezo.loadFriend(ctx, path);
      if (!deletedIds.has(fr.id)) State.friends.set(fr.id, fr);
    }

    // groups
    State.groups.clear();
    const gEntries = await ezo.listGroupEntries(ctx);                // <-- FIX: await
    for (const path of gEntries) {
      const g = await ezo.loadGroup(ctx, path);
      State.groups.set(g.id, g);
      State.chats.set("g:"+g.id, State.chats.get("g:"+g.id)||[]);

    }

    hideProfileManager();
    ui.renderAll();

    await loadChatsOnOpen();

    ui.renderAll();

    if (Array.isArray(State.SETTINGS.relays)) {
      for (const url of State.SETTINGS.relays) {
        try { await relay.connectRelay(url); } catch(e){ console.warn("relay connect failed", url, e); }
      }
    }

    ui.applyAutoPoll();

    ui.showInfo("Profile opened", `Loaded profile <b>${State.PROFILE.name}</b>.`);
  } catch (e) {
    console.error("openSelectedProfile error:", e);
    const msg = String(e?.message||"");
    if (msg === "bad-password") {
      ui.showError("Open failed", "Wrong password.");
    } else if (msg === "archive-not-found") {
      ui.showError("Open failed", "Archive not found.");
    } else if (msg === "archive-corrupt") {
      ui.showError("Open failed", "Archive is corrupted or incompatible.");
    } else {
      ui.showError("Open failed", "Unexpected error while opening the profile.");
    }
  }
}

async function createProfile(){
  const name = $("pmNewName")?.value.trim() || "user";
  const pass = normPass($("pmNewPass")?.value);
  const pass2 = normPass($("pmNewPass2")?.value);
  const bio  = $("pmNewBio")?.value;

  if (!pass || pass !== pass2) { ui.showWarn("Password mismatch", "Please enter the same password in both fields."); return; }

  try {
    const { fh } = await ezo.createProfileArchive(name, pass);
    const ctx = await ezo.openArchive(fh, pass);

    const priv = x25519.utils.randomPrivateKey();
    const pub  = x25519.getPublicKey(priv);
    await ezo.writeFileToArchive(ctx, "profile/privkey", priv);
    await ezo.writeFileToArchive(ctx, "profile/pubkey", pub);

    if (bio) await ezo.writeFileToArchive(ctx, "profile/bio", ezo.te(bio));
    await ezo.writeFileToArchive(ctx, "profile/name", ezo.te(name));

    const settings = { autoPoll:false, pollMs:5000, relays: [] };
    await ezo.saveProfileFields(ctx, { settings });
    setSettings(settings);

    const meta = await ezo.loadProfile(ctx);
    setProfile({ fh, ctx, name, bio, avatar:null, priv, pub, settings, inboxId: meta.inboxId });
    hideProfileManager();
    ui.renderAll();
    ui.applyAutoPoll();
    ui.showInfo("Profile created", `Your profile <b>${name}</b> is ready.`);
  } catch (e) {
    console.error("createProfile error:", e);
    ui.showError("Create failed", "Could not create or open the profile archive.");
  }
}

async function downloadSelected(){
  const name = $("pmSelect")?.value;
  const list = await ezo.listProfiles();
  const p = list?.find(x=>x.name===name);
  if (!p) { ui.showWarn("No profile selected", "Pick a profile from the list."); return; }
  const ok = await ui.confirmRisk("Exporting your profile archive (.ezo) makes it easy to copy your encrypted profile to other devices. Keep it secure.");
  if (!ok) return;
  try {
    await ezo.downloadArchive(p.handle, name);
    ui.showInfo("Exported", "The profile archive download has started.");
  } catch {
    ui.showError("Export failed", "Unable to export the profile archive.");
  }
}

async function deleteSelected(){
  const name = $("pmSelect")?.value;
  if (!name) { ui.showWarn("No profile selected", "Pick a profile to delete."); return; }
  const ok = await ui.confirmRisk(`This will permanently remove <b>${name}</b> from this browser storage. Continue?`);
  if (!ok) return;
  try {
    await ezo.removeProfileArchive(name);
    await populateProfiles();
    ui.showInfo("Deleted", `Profile <b>${name}</b> removed from this browser.`);
  } catch {
    ui.showError("Delete failed", "Could not remove the profile.");
  }
}

async function importArchiveFile(ev){
  const f = ev.target.files?.[0]; if (!f) return;
  const ok = await ui.confirmRisk("Importing a profile (.ezo) will add an encrypted profile archive to this browser. Make sure you trust the source.");
  if (!ok) { ev.target.value=""; return; }
  try {
    await ezo.importArchive(f);
    await populateProfiles();
    ui.showInfo("Imported", "Profile archive imported successfully.");
  } catch {
    ui.showError("Import failed", "Unable to import the selected archive.");
  }
}

window.addEventListener("load", ()=>{ showProfileManager(); ui.renderAll(); enhanceUI(); });
window._EZO_STATE = State;

window._dbgReloadFriends = async function(){
  try {
    const ctx = State?.PROFILE?.ctx;
    if (!ctx) { console.warn("No profile context"); return; }
    const deleted = new Set(await ezo.listDeletedFriendIds(ctx));
    const entries = await ezo.listFriendEntries(ctx);
    State.friends.clear();
    for (const path of entries) {
      try {
        const fr = await ezo.loadFriend(ctx, path);
        if (deleted.has(fr.id)) { console.warn('skipping deleted friend', fr.id); } else { State.friends.set(fr.id, fr); console.log('loaded friend', fr.id); }
      } catch (e) { console.warn("loadFriend failed for", path, e); }
    }
    // Ensure chats map has buckets
    for (const [id] of State.friends) {
      State.chats.set(id, State.chats.get(id) || []);
    }
    ui.renderLeft();
    console.log("Reloaded friends:", State.friends.size, "entries:", entries, "deleted:", [...deleted]);
  } catch (e) {
    console.error("dbgReloadFriends error:", e);
  }
};

