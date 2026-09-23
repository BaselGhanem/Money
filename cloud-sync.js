(() => {
  `use strict`;

  const CONFIG = {
    apiKey: `AIzaSyDUSHbMd1A98_OpE3JSNXPD-XT0do8FutM`,
    authDomain: `moneywithbasel.firebaseapp.com`,
    projectId: `moneywithbasel`,
    storageBucket: `moneywithbasel.firebasestorage.app`,
    messagingSenderId: `1000601907861`,
    appId: `1:1000601907861:web:6995a21e42d36c1981a19c`,
    measurementId: `G-JBPFJ7ZXX1`
  };

  const pathname = location.pathname.toLowerCase();
  const appId = pathname.includes(`/loan/`) ? `loan` : pathname.includes(`/salary/`) ? `salary` : null;
  const storageKey = appId === `loan` ? `basel.loan.cinematic.v1` : appId === `salary` ? `salary_manager_v2` : null;
  if (!appId || !storageKey || !window.firebase) return;

  const metaKey = `money.cloud.meta.${appId}`;
  const clientIdKey = `money.cloud.client`;
  const clientId = sessionStorage.getItem(clientIdKey) || (crypto.randomUUID?.() || `client_${Date.now()}`);
  sessionStorage.setItem(clientIdKey, clientId);

  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(CONFIG);
  const auth = firebase.auth(app);
  const db = firebase.firestore(app);
  const provider = new firebase.auth.GoogleAuthProvider();

  let user = null;
  let unsubscribe = null;
  let suppressStorageSync = false;
  let syncTimer = null;
  let lastOwnWriteAt = 0;

  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  function meta() {
    try { return JSON.parse(localStorage.getItem(metaKey) || `{}`); }
    catch { return {}; }
  }

  function setMeta(value) {
    suppressStorageSync = true;
    try { originalSetItem.call(localStorage, metaKey, JSON.stringify(value)); }
    finally { suppressStorageSync = false; }
  }

  function docRef() {
    return db.collection(`users`).doc(user.uid).collection(`apps`).doc(appId);
  }

  function setStatus(mode, text) {
    const pill = document.getElementById(`moneyCloudPill`);
    if (!pill) return;
    pill.dataset.mode = mode;
    const label = pill.querySelector(`[data-cloud-label]`);
    if (label) label.textContent = text;
  }

  function ensureUi() {
    if (document.getElementById(`moneyCloudPill`)) return;
    const style = document.createElement(`style`);
    style.textContent = `
      #moneyCloudPill{position:fixed;left:max(12px,env(safe-area-inset-left));top:max(12px,env(safe-area-inset-top));z-index:99999;display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(7,18,20,.78);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#dcebec;font:700 11px/1.2 Almarai,system-ui,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.22)}
      #moneyCloudPill button{all:unset;cursor:pointer;display:flex;align-items:center;gap:7px}
      #moneyCloudPill i{width:7px;height:7px;border-radius:50%;background:#7f9294;box-shadow:0 0 0 3px rgba(127,146,148,.10)}
      #moneyCloudPill[data-mode="online"] i{background:#34c9a3;box-shadow:0 0 0 3px rgba(52,201,163,.12)}
      #moneyCloudPill[data-mode="syncing"] i{background:#e6b85c;box-shadow:0 0 0 3px rgba(230,184,92,.12)}
      #moneyCloudPill[data-mode="error"] i{background:#e26f6f;box-shadow:0 0 0 3px rgba(226,111,111,.12)}
      @media(max-width:700px){#moneyCloudPill{top:auto;bottom:max(84px,calc(env(safe-area-inset-bottom) + 74px));font-size:10px;padding:7px 9px}}
    `;
    document.head.appendChild(style);

    const pill = document.createElement(`div`);
    pill.id = `moneyCloudPill`;
    pill.dataset.mode = `offline`;
    pill.innerHTML = `<button type="button" aria-label="حالة المزامنة السحابية"><i></i><span data-cloud-label>ربط السحابة</span></button>`;
    pill.querySelector(`button`).addEventListener(`click`, async () => {
      if (auth.currentUser) {
        const email = auth.currentUser.email || `الحساب الحالي`;
        if (confirm(`المزامنة تعمل مع ${email}. هل تريد تسجيل الخروج من السحابة؟`)) await auth.signOut();
        return;
      }
      try {
        setStatus(`syncing`, `جار تسجيل الدخول`);
        await auth.signInWithPopup(provider);
      } catch (error) {
        console.error(`Money Cloud sign-in failed`, error);
        setStatus(`error`, `تعذر تسجيل الدخول`);
      }
    });
    document.body.appendChild(pill);
  }

  async function uploadNow() {
    if (!user) return;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return; }

    setStatus(`syncing`, `جار الحفظ`);
    const now = Date.now();
    lastOwnWriteAt = now;

    await docRef().set({
      app: appId,
      payload: parsed,
      clientId,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAtMs: now
    }, { merge: false });

    setMeta({ lastSyncMs: now, uid: user.uid });
    setStatus(`online`, `محفوظ بالسحابة`);
  }

  function scheduleUpload() {
    if (!user) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => uploadNow().catch(error => {
      console.error(`Money Cloud upload failed`, error);
      setStatus(`error`, `تعذر الحفظ السحابي`);
    }), 350);
  }

  Storage.prototype.setItem = function(key, value) {
    originalSetItem.call(this, key, value);
    if (this === localStorage && key === storageKey && !suppressStorageSync) scheduleUpload();
  };

  Storage.prototype.removeItem = function(key) {
    originalRemoveItem.call(this, key);
    if (this === localStorage && key === storageKey && !suppressStorageSync) scheduleUpload();
  };

  async function initialSync() {
    const ref = docRef();
    const snap = await ref.get();
    const localRaw = localStorage.getItem(storageKey);
    const m = meta();

    if (!snap.exists) {
      if (localRaw) {
        await uploadNow();
      } else {
        setStatus(`online`, `السحابة متصلة`);
      }
      return;
    }

    const cloud = snap.data() || {};
    const cloudMs = Number(cloud.updatedAtMs || 0);
    const localMs = Number(m.lastSyncMs || 0);
    const sameUser = m.uid === user.uid;

    if (!localRaw || !sameUser || cloudMs > localMs) {
      suppressStorageSync = true;
      try {
        originalSetItem.call(localStorage, storageKey, JSON.stringify(cloud.payload ?? {}));
        setMeta({ lastSyncMs: cloudMs || Date.now(), uid: user.uid });
      } finally {
        suppressStorageSync = false;
      }
      setStatus(`online`, `تم تحميل بياناتك`);
      location.reload();
      return;
    }

    if (localMs > cloudMs) {
      await uploadNow();
      return;
    }

    setStatus(`online`, `محفوظ بالسحابة`);
  }

  function listenRealtime() {
    if (unsubscribe) unsubscribe();
    unsubscribe = docRef().onSnapshot(snap => {
      if (!snap.exists) return;
      const data = snap.data() || {};
      const remoteMs = Number(data.updatedAtMs || 0);

      if (data.clientId === clientId || remoteMs <= lastOwnWriteAt) {
        setStatus(`online`, `محفوظ بالسحابة`);
        return;
      }

      const m = meta();
      if (remoteMs && remoteMs <= Number(m.lastSyncMs || 0)) return;

      suppressStorageSync = true;
      try {
        originalSetItem.call(localStorage, storageKey, JSON.stringify(data.payload ?? {}));
        setMeta({ lastSyncMs: remoteMs || Date.now(), uid: user.uid });
      } finally {
        suppressStorageSync = false;
      }

      setStatus(`online`, `تم تحديث البيانات`);
      setTimeout(() => location.reload(), 250);
    }, error => {
      console.error(`Money Cloud realtime failed`, error);
      setStatus(`error`, `السحابة غير متاحة`);
    });
  }

  auth.onAuthStateChanged(async currentUser => {
    ensureUi();
    user = currentUser;

    if (!user) {
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      setStatus(`offline`, `ربط السحابة`);
      return;
    }

    try {
      setStatus(`syncing`, `جار المزامنة`);
      await initialSync();
      listenRealtime();
    } catch (error) {
      console.error(`Money Cloud initial sync failed`, error);
      setStatus(`error`, `تحقق من Firebase`);
    }
  });

  window.addEventListener(`DOMContentLoaded`, ensureUi);
})();