// ============================================================
// MY-KHATA Offline-first storage + durable outbox sync
// IMPORTANT: browser storage is device-local, not a replacement
// for backups. Sync still depends on the existing Supabase schema/RLS.
// ============================================================
const OFFLINE_DB_NAME = "moneymate_offline_v1";
const OFFLINE_DB_VERSION = 2;
const STORE_CUSTOMERS = "customers";
const STORE_TRANSACTIONS = "transactions";
const STORE_OUTBOX = "outbox";
const STORE_META = "meta";
let offlineDb = null;
let isSyncing = false;
let lastSyncAt = null;

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    if (offlineDb) return resolve(offlineDb);
    if (!window.indexedDB) return reject(new Error("এই ব্রাউজারে IndexedDB সমর্থিত নয়।"));
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onerror = () => reject(req.error || new Error("IndexedDB খুলতে সমস্যা হয়েছে"));
    req.onblocked = () => console.warn("Offline DB upgrade blocked by another open tab");
    req.onsuccess = () => {
      offlineDb = req.result;
      offlineDb.onversionchange = () => { offlineDb.close(); offlineDb = null; };
      resolve(offlineDb);
    };
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_CUSTOMERS)) db.createObjectStore(STORE_CUSTOMERS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_TRANSACTIONS)) db.createObjectStore(STORE_TRANSACTIONS, { keyPath: "id" });
      // v2 separates the IndexedDB key (queueId) from the operation target ID (id).
      if (db.objectStoreNames.contains(STORE_OUTBOX)) {
        const oldStore = e.target.transaction.objectStore(STORE_OUTBOX);
        const oldRows = [];
        const cursorReq = oldStore.openCursor();
        cursorReq.onsuccess = (ev) => {
          const cursor = ev.target.result;
          if (cursor) { oldRows.push(cursor.value); cursor.continue(); return; }
          db.deleteObjectStore(STORE_OUTBOX);
          const replacement = db.createObjectStore(STORE_OUTBOX, { keyPath: "queueId", autoIncrement: true });
          replacement.createIndex("created_at", "created_at", { unique: false });
          oldRows.forEach(row => {
            if (String(row.type || "").startsWith("insert_") && typeof row.id === "number") delete row.id;
            delete row.queueId;
            replacement.put(row);
          });
        };
      } else {
        const os = db.createObjectStore(STORE_OUTBOX, { keyPath: "queueId", autoIncrement: true });
        os.createIndex("created_at", "created_at", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: "key" });
    };
  });
}
function idbRequest(storeName, mode, callback) {
  return openOfflineDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let result;
    try { result = callback(tx.objectStore(storeName)); } catch (e) { reject(e); return; }
    tx.oncomplete = () => resolve(result && result.result !== undefined ? result.result : undefined);
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    if (result && typeof result === "object" && "onsuccess" in result) {
      result.onsuccess = () => { /* transaction completion resolves */ };
      result.onerror = () => reject(result.error || tx.error);
    }
  }));
}
function idbPut(storeName, value) {
  return openOfflineDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB write aborted"));
  }));
}
function idbGet(storeName, key) {
  return openOfflineDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  }));
}
function idbGetAll(storeName) {
  return openOfflineDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  }));
}
function idbDelete(storeName, key) {
  return openOfflineDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB delete aborted"));
  }));
}
function setMeta(key, value) { return idbPut(STORE_META, { key, value }); }
async function getMeta(key) { const row = await idbGet(STORE_META, key); return row ? row.value : null; }
function isOnline() { return typeof navigator !== "undefined" && navigator.onLine === true; }
function localId(prefix) {
  const random = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}
function isLocalId(id, prefix) { return String(id || "").startsWith(`${prefix}_`); }

async function getPendingOps() {
  const ownerId = await currentOwnerId();
  if (!ownerId) return [];
  return (await idbGetAll(STORE_OUTBOX)).filter(op => String(op.owner_id || op.payload?.user_id || "") === String(ownerId))
    .sort((a,b) => (a.created_at||"").localeCompare(b.created_at||"") || (a.queueId||0)-(b.queueId||0));
}
async function enqueueOp(op) {
  const ownerId = await currentOwnerId();
  if (!ownerId) throw new Error("অফলাইনে পরিবর্তন সংরক্ষণের আগে এই ডিভাইসে লগইন সেশন থাকতে হবে।");
  const entry = { ...op, owner_id: ownerId, created_at: new Date().toISOString(), retries: 0 };
  if (entry.type === "insert_customer" || entry.type === "insert_transaction") {
    entry.operation_id = entry.operation_id || makeOperationId(entry.type);
    entry.payload = { ...(entry.payload || {}), user_id: ownerId, client_operation_id: entry.operation_id };
  }
  await idbPut(STORE_OUTBOX, entry);
  updateOfflineUI();
}
async function removeOutboxItem(queueId) { return idbDelete(STORE_OUTBOX, queueId); }
async function updateOutboxItem(item) { return idbPut(STORE_OUTBOX, item); }

// Merge remote snapshots without deleting unsynced local changes. Remote snapshots
// are authoritative only for records that have no local pending operation.
async function mergeRemoteSnapshot(storeName, remoteItems, entity) {
  const ownerId = await currentOwnerId();
  if (!ownerId) return [];
  const [allExisting, ops] = await Promise.all([idbGetAll(storeName), getPendingOps()]);
  const existing = allExisting.filter(row => ownedBy(row, ownerId));
  const remoteMap = new Map((remoteItems || []).map(item => [String(item.id), item]));
  const pendingIds = new Set();
  const hiddenIds = new Set();
  for (const op of ops) {
    const type = String(op.type || "");
    const isEntity = entity === "customer" ? type.includes("customer") : type.includes("transaction");
    if (!isEntity) continue;
    const id = op.id || op.localId;
    if (id != null) {
      pendingIds.add(String(id));
      if (type === `delete_${entity}`) hiddenIds.add(String(id));
    }
    if (op.localId != null) pendingIds.add(String(op.localId));
    const foreignId = entity === "transaction" ? op.payload?.customer_id : null;
    if (foreignId != null && isLocalId(foreignId, "cust")) { /* transaction depends on local customer */ }
  }
  const merged = new Map([...remoteMap].map(([id, row]) => [id, { ...row, owner_id: ownerId }]));
  for (const old of existing) {
    const id = String(old.id);
    if (hiddenIds.has(id)) { merged.delete(id); continue; }
    if ((old._local || old._pending || pendingIds.has(id)) && !merged.has(id)) merged.set(id, old);
    else if ((old._local || old._pending || pendingIds.has(id)) && merged.has(id)) {
      // Preserve local dirty fields over a stale remote snapshot.
      merged.set(id, { ...merged.get(id), ...old });
    }
  }
  for (const id of hiddenIds) merged.delete(id);
  const values = [...merged.values()].map(row => ({ ...row, owner_id: ownerId }));
  // Do not clear the store: replace the snapshot atomically and preserve pending records.
  await openOfflineDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    // Replace only this signed-in user's rows; preserve other accounts' cached rows.
    existing.forEach(item => store.delete(item.id));
    values.forEach(item => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Cache merge aborted"));
  }));
  return values;
}
async function cacheCustomersLocally(list) {
  try {
    const ownerId = await currentOwnerId(); if (!ownerId) return [];
    // Local writes use the exact passed list; mark as cache-only without erasing the outbox.
    const ops = await getPendingOps();
    const pendingIds = new Set(ops.flatMap(o => [o.id, o.localId]).filter(v => v != null).map(String));
    const current = (await idbGetAll(STORE_CUSTOMERS)).filter(x => ownedBy(x, ownerId));
    const map = new Map((list || []).filter(x => !x.user_id || String(x.user_id) === String(ownerId)).map(x => [String(x.id), { ...x, owner_id: ownerId, user_id: x.user_id || ownerId }]));
    for (const old of current) if ((old._local || old._pending || pendingIds.has(String(old.id))) && !map.has(String(old.id))) map.set(String(old.id), old);
    const hidden = new Set(ops.filter(o => o.type === "delete_customer").map(o => String(o.id)));
    for (const id of hidden) map.delete(id);
    const values = [...map.values()];
    await openOfflineDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CUSTOMERS, "readwrite"); const store = tx.objectStore(STORE_CUSTOMERS);
      current.forEach(x => store.delete(x.id)); values.forEach(x => store.put(x));
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    }));
    return values;
  } catch (e) { console.warn("cacheCustomersLocally failed", e); }
}
async function cacheTransactionsLocally(list) {
  try {
    const ownerId = await currentOwnerId(); if (!ownerId) return [];
    const ops = await getPendingOps();
    const pendingIds = new Set(ops.flatMap(o => [o.id, o.localId]).filter(v => v != null).map(String));
    const current = (await idbGetAll(STORE_TRANSACTIONS)).filter(x => ownedBy(x, ownerId));
    const map = new Map((list || []).filter(x => !x.user_id || String(x.user_id) === String(ownerId)).map(x => [String(x.id), { ...x, owner_id: ownerId, user_id: x.user_id || ownerId }]));
    for (const old of current) if ((old._local || old._pending || pendingIds.has(String(old.id))) && !map.has(String(old.id))) map.set(String(old.id), old);
    const hidden = new Set(ops.filter(o => o.type === "delete_transaction").map(o => String(o.id)));
    for (const id of hidden) map.delete(id);
    const values = [...map.values()];
    await openOfflineDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_TRANSACTIONS, "readwrite"); const store = tx.objectStore(STORE_TRANSACTIONS);
      current.forEach(x => store.delete(x.id)); values.forEach(x => store.put(x));
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    }));
    return values;
  } catch (e) { console.warn("cacheTransactionsLocally failed", e); }
}
async function loadCustomersFromCache() { try { const ownerId = await currentOwnerId(); return ownerId ? (await idbGetAll(STORE_CUSTOMERS)).filter(x => ownedBy(x, ownerId)) : []; } catch(e) { console.warn(e); return []; } }
async function loadTransactionsFromCache() { try { const ownerId = await currentOwnerId(); return ownerId ? (await idbGetAll(STORE_TRANSACTIONS)).filter(x => ownedBy(x, ownerId)) : []; } catch(e) { console.warn(e); return []; } }
async function getCurrentLocalUser() {
  try {
    const result = await supabaseClient.auth.getSession();
    return result?.data?.session?.user || null;
  } catch (_) { return null; }
}
async function currentOwnerId() {
  const user = await getCurrentLocalUser();
  return user?.id || null;
}
function makeOperationId(prefix) { return `${prefix}_${localId("op").replace(/[^a-zA-Z0-9_-]/g, "")}`; }
function ownedBy(row, ownerId) { return !!ownerId && String(row?.owner_id || row?.user_id || "") === String(ownerId); }
async function addOwnerToRow(row) {
  const ownerId = await currentOwnerId();
  return ownerId ? { ...row, owner_id: ownerId, user_id: row.user_id || ownerId } : row;
}
async function loadCustomersOfflineAware() {
  if (isOnline()) {
    try {
      let query = supabaseClient.from("customers").select("*").order("name", { ascending: true });
      const user = await getCurrentLocalUser();
      if (user?.id) query = query.eq("user_id", user.id);
      const { data, error } = await query;
      if (!error && data) {
        customers = await mergeRemoteSnapshot(STORE_CUSTOMERS, data, "customer");
        return customers;
      }
      if (error) console.warn("Remote customers unavailable; using local cache", error.message);
    } catch(e) { console.warn("Online loadCustomers failed; using cache", e); }
  }
  customers = await loadCustomersFromCache();
  return customers;
}
async function loadTransactionsOfflineAware() {
  if (isOnline()) {
    try {
      let query = supabaseClient.from("transactions").select("*").order("transaction_date", { ascending: false });
      const user = await getCurrentLocalUser();
      if (user?.id) query = query.eq("user_id", user.id);
      const { data, error } = await query;
      if (!error && data) {
        transactions = await mergeRemoteSnapshot(STORE_TRANSACTIONS, data, "transaction");
        return transactions;
      }
      if (error) console.warn("Remote transactions unavailable; using local cache", error.message);
    } catch(e) { console.warn("Online loadTransactions failed; using cache", e); }
  }
  transactions = await loadTransactionsFromCache();
  return transactions;
}

async function offlineAwareInsertCustomer(payload) {
  const ownerId = await currentOwnerId();
  if (!ownerId) throw new Error("কাস্টমার যোগ করার আগে লগইন করুন।");
  const operationId = makeOperationId("customer");
  payload = { ...payload, user_id: ownerId, client_operation_id: operationId };
  if (isOnline()) {
    try {
      const { data, error } = await supabaseClient.from("customers").upsert(payload, { onConflict: "client_operation_id" }).select().single();
      if (!error && data) {
        customers = [data, ...customers.filter(c => String(c.id) !== String(data.id))];
        await cacheCustomersLocally(customers);
        return data;
      }
      if (error) console.warn("Online insert customer failed; queueing locally", error.message);
    } catch(e) { console.warn("Online insert customer failed; queueing locally", e); }
  }
  const local = { id: localId("cust"), ...payload, owner_id: ownerId, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), _local: true, _pending: true };
  customers = [...customers.filter(c => String(c.id) !== String(local.id)), local];
  await idbPut(STORE_CUSTOMERS, local);
  await enqueueOp({ type: "insert_customer", payload, localId: local.id, operation_id: operationId });
  return local;
}
async function offlineAwareUpdateCustomer(id, updates) {
  const ownerId = await currentOwnerId();
  const updatedAt = new Date().toISOString();
  customers = customers.map(c => String(c.id) === String(id) ? { ...c, ...updates, updated_at: updatedAt, _pending: true } : c);
  await cacheCustomersLocally(customers);
  if (updates.name) {
    transactions = transactions.map(t => String(t.customer_id) === String(id) ? { ...t, customer_name: updates.name, _pending: true } : t);
    await cacheTransactionsLocally(transactions);
  }
  if (isOnline() && !isLocalId(id, "cust")) {
    try {
      const { error } = await supabaseClient.from("customers").update({ ...updates, updated_at: updatedAt }).eq("id", id).eq("user_id", ownerId);
      if (error) throw error;
      if (updates.name) {
        const r = await supabaseClient.from("transactions").update({ customer_name: updates.name }).eq("customer_id", id).eq("user_id", ownerId);
        if (r.error) throw r.error;
      }
      customers = customers.map(c => String(c.id) === String(id) ? { ...c, _pending: false, _local: false } : c);
      await cacheCustomersLocally(customers);
      return true;
    } catch(e) { console.warn("Online update customer failed; queued", e); }
  }
  await enqueueOp({ type: "update_customer", id, updates });
  return true;
}
async function offlineAwareDeleteCustomer(id) {
  const customer = customers.find(c => String(c.id) === String(id));
  // If it was created locally and not yet synced, cancel its insert/update queue.
  const ops = await getPendingOps();
  if (isLocalId(id, "cust") && ops.some(o => o.type === "insert_customer" && String(o.localId) === String(id))) {
    for (const op of ops) {
      if ((op.type.endsWith("_customer") && String(op.localId || op.id) === String(id)) ||
          (op.type === "insert_transaction" && String(op.payload?.customer_id) === String(id))) {
        await removeOutboxItem(op.queueId);
      }
    }
    transactions = transactions.filter(t => String(t.customer_id) !== String(id));
    customers = customers.filter(c => String(c.id) !== String(id));
    await cacheCustomersLocally(customers); await cacheTransactionsLocally(transactions);
    return true;
  }
  customers = customers.filter(c => String(c.id) !== String(id));
  transactions = transactions.filter(t => String(t.customer_id) !== String(id));
  await cacheCustomersLocally(customers); await cacheTransactionsLocally(transactions);
  if (isOnline() && !isLocalId(id, "cust")) {
    try {
      const { error } = await supabaseClient.from("customers").delete().eq("id", id).eq("user_id", await currentOwnerId());
      if (error) throw error;
      return true;
    } catch(e) { console.warn("Online delete customer failed; queued", e); }
  }
  await enqueueOp({ type: "delete_customer", id, _tombstone: true });
  return true;
}
async function offlineAwareInsertTransaction(payload) {
  const ownerId = await currentOwnerId();
  if (!ownerId) throw new Error("লেনদেন যোগ করার আগে লগইন করুন।");
  const operationId = makeOperationId("transaction");
  payload = { ...payload, user_id: ownerId, client_operation_id: operationId };
  if (isOnline() && !isLocalId(payload.customer_id, "cust")) {
    try {
      const { data, error } = await supabaseClient.from("transactions").upsert(payload, { onConflict: "client_operation_id" }).select().single();
      if (!error && data) {
        transactions = [data, ...transactions.filter(t => String(t.id) !== String(data.id))];
        await cacheTransactionsLocally(transactions);
        return data;
      }
      if (error) console.warn("Online insert transaction failed; queueing locally", error.message);
    } catch(e) { console.warn("Online insert transaction failed; queueing locally", e); }
  }
  const local = { id: localId("txn"), ...payload, owner_id: ownerId, created_at: new Date().toISOString(), _local: true, _pending: true };
  transactions = [local, ...transactions.filter(t => String(t.id) !== String(local.id))];
  await idbPut(STORE_TRANSACTIONS, local);
  await enqueueOp({ type: "insert_transaction", payload, localId: local.id, operation_id: operationId });
  return local;
}
async function offlineAwareUpdateTransaction(id, updates) {
  transactions = transactions.map(t => String(t.id) === String(id) ? { ...t, ...updates, _pending: true } : t);
  await cacheTransactionsLocally(transactions);
  if (isOnline() && !isLocalId(id, "txn")) {
    try {
      const { error } = await supabaseClient.from("transactions").update(updates).eq("id", id).eq("user_id", await currentOwnerId());
      if (error) throw error;
      transactions = transactions.map(t => String(t.id) === String(id) ? { ...t, _pending: false, _local: false } : t);
      await cacheTransactionsLocally(transactions);
      return true;
    } catch(e) { console.warn("Online update transaction failed; queued", e); }
  }
  await enqueueOp({ type: "update_transaction", id, updates });
  return true;
}
async function offlineAwareDeleteTransaction(id) {
  const ops = await getPendingOps();
  if (isLocalId(id, "txn") && ops.some(o => o.type === "insert_transaction" && String(o.localId) === String(id))) {
    // A never-synced transaction can be removed locally by cancelling its insert and edits.
    for (const op of ops) if ((op.type.endsWith("_transaction") && String(op.localId || op.id) === String(id))) await removeOutboxItem(op.queueId);
    transactions = transactions.filter(t => String(t.id) !== String(id));
    await cacheTransactionsLocally(transactions);
    return true;
  }
  transactions = transactions.filter(t => String(t.id) !== String(id));
  await cacheTransactionsLocally(transactions);
  if (isOnline() && !isLocalId(id, "txn")) {
    try {
      const { error } = await supabaseClient.from("transactions").delete().eq("id", id).eq("user_id", await currentOwnerId());
      if (error) throw error;
      return true;
    } catch(e) { console.warn("Online delete transaction failed; queued", e); }
  }
  await enqueueOp({ type: "delete_transaction", id, _tombstone: true });
  return true;
}

async function rewritePendingReferences(oldId, newId, entity) {
  const ops = await getPendingOps();
  for (const op of ops) {
    let changed = false;
    if (entity === "customer") {
      if (String(op.id) === String(oldId) && ["update_customer", "delete_customer"].includes(op.type)) { op.id = newId; changed = true; }
      if (op.payload && String(op.payload.customer_id) === String(oldId)) { op.payload.customer_id = newId; changed = true; }
    } else if (entity === "transaction") {
      if (String(op.id) === String(oldId) && ["update_transaction", "delete_transaction"].includes(op.type)) { op.id = newId; changed = true; }
    }
    if (changed) await updateOutboxItem(op);
  }
}
async function replaceLocalRecord(storeName, localIdValue, serverRecord) {
  const ownerId = await currentOwnerId();
  const saved = { ...serverRecord, owner_id: ownerId || serverRecord.user_id, _local: false, _pending: false };
  await openOfflineDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite"); const store = tx.objectStore(storeName);
    // Never clear the whole store: another signed-in account may have cached rows here.
    store.delete(localIdValue); store.put(saved);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }));
  if (storeName === STORE_CUSTOMERS) customers = customers.filter(row => String(row.id) !== String(localIdValue)).concat(saved);
  else transactions = transactions.filter(row => String(row.id) !== String(localIdValue)).concat(saved);
}
async function processOutbox() {
  if (!isOnline() || isSyncing) return;
  isSyncing = true; updateOfflineUI();
  try {
    const user = await getCurrentLocalUser();
    if (!user?.id) { console.warn("Sync paused: no locally available signed-in user"); return; }
    const customerMap = (await getMeta(`customerIdMap:${user.id}`)) || {};
    const transactionMap = (await getMeta(`transactionIdMap:${user.id}`)) || {};
    const queue = await getPendingOps();
    for (const item of queue) {
      if (String(item.owner_id || item.payload?.user_id || "") !== String(user.id)) continue;
      try {
        if (item.payload?.user_id && item.payload.user_id !== user.id) { console.warn("Skipping outbox item belonging to another user"); continue; }
        if (item.type === "insert_customer") {
          if (customerMap[item.localId]) { await removeOutboxItem(item.queueId); continue; }
          const { data, error } = await supabaseClient.from("customers").upsert({ ...item.payload, user_id: item.payload.user_id || user.id, client_operation_id: item.operation_id || item.payload.client_operation_id }, { onConflict: "client_operation_id" }).select().single();
          if (error) throw error;
          customerMap[item.localId] = data.id; await setMeta(`customerIdMap:${user.id}`, customerMap);
          await replaceLocalRecord(STORE_CUSTOMERS, item.localId, data);
          // Only touch rows that reference this local customer; never clear the store (other accounts may be cached).
          const txRows = (await idbGetAll(STORE_TRANSACTIONS)).filter(t => String(t.customer_id) === String(item.localId) && ownedBy(t, user.id));
          const fixedRows = txRows.map(t => ({ ...t, customer_id: data.id, customer_name: data.name }));
          if (fixedRows.length) {
            await openOfflineDb().then(db => new Promise((resolve, reject) => { const tx=db.transaction(STORE_TRANSACTIONS,"readwrite"), s=tx.objectStore(STORE_TRANSACTIONS); fixedRows.forEach(r=>s.put(r)); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error); }));
          }
          transactions = transactions.map(t => String(t.customer_id) === String(item.localId) ? { ...t, customer_id: data.id, customer_name: data.name } : t);
          await rewritePendingReferences(item.localId, data.id, "customer");
          await removeOutboxItem(item.queueId);
        } else if (item.type === "update_customer") {
          const realId = customerMap[item.id] || item.id;
          if (isLocalId(realId, "cust")) continue;
          const { error } = await supabaseClient.from("customers").update({ ...item.updates, updated_at: new Date().toISOString() }).eq("id", realId).eq("user_id", user.id);
          if (error) throw error;
          if (item.updates?.name) {
            const r = await supabaseClient.from("transactions").update({ customer_name: item.updates.name }).eq("customer_id", realId).eq("user_id", user.id);
            if (r.error) throw r.error;
          }
          await removeOutboxItem(item.queueId);
        } else if (item.type === "delete_customer") {
          const realId = customerMap[item.id] || item.id;
          if (isLocalId(realId, "cust")) { await removeOutboxItem(item.queueId); continue; }
          const { error } = await supabaseClient.from("customers").delete().eq("id", realId).eq("user_id", user.id);
          if (error) throw error;
          await removeOutboxItem(item.queueId);
        } else if (item.type === "insert_transaction") {
          if (transactionMap[item.localId]) { await removeOutboxItem(item.queueId); continue; }
          const payload = { ...item.payload };
          if (isLocalId(payload.customer_id, "cust")) payload.customer_id = customerMap[payload.customer_id] || payload.customer_id;
          if (isLocalId(payload.customer_id, "cust")) continue;
          // Fold pending edits into the insert so the server receives the latest local values.
          const allOps = await getPendingOps();
          const related = allOps.filter(o => o.type === "update_transaction" && String(o.id) === String(item.localId));
          for (const op of related) Object.assign(payload, op.updates || {});
          const { data, error } = await supabaseClient.from("transactions").upsert({ ...payload, user_id: payload.user_id || user.id, client_operation_id: item.operation_id || payload.client_operation_id }, { onConflict: "client_operation_id" }).select().single();
          if (error) throw error;
          transactionMap[item.localId] = data.id; await setMeta(`transactionIdMap:${user.id}`, transactionMap);
          await replaceLocalRecord(STORE_TRANSACTIONS, item.localId, data);
          await rewritePendingReferences(item.localId, data.id, "transaction");
          await removeOutboxItem(item.queueId);
          for (const op of related) await removeOutboxItem(op.queueId);
        } else if (item.type === "update_transaction") {
          const realId = transactionMap[item.id] || item.id;
          if (isLocalId(realId, "txn")) continue;
          const { error } = await supabaseClient.from("transactions").update(item.updates || {}).eq("id", realId).eq("user_id", user.id);
          if (error) throw error;
          await removeOutboxItem(item.queueId);
        } else if (item.type === "delete_transaction") {
          const realId = transactionMap[item.id] || item.id;
          if (isLocalId(realId, "txn")) { await removeOutboxItem(item.queueId); continue; }
          const { error } = await supabaseClient.from("transactions").delete().eq("id", realId).eq("user_id", user.id);
          if (error) throw error;
          await removeOutboxItem(item.queueId);
        }
      } catch (err) {
        item.retries = (item.retries || 0) + 1;
        item.last_error = String(err?.message || err).slice(0, 300);
        item.last_attempt_at = new Date().toISOString();
        await updateOutboxItem(item).catch(() => {});
        console.warn("Outbox item failed; retained for retry", item.type, err);
        // Keep going: unrelated operations may be syncable. Dependencies remain queued.
      }
    }
    customers = await loadCustomersOfflineAware();
    transactions = await loadTransactionsOfflineAware();
    const remaining = await getPendingOps();
    if (!remaining.length) {
      lastSyncAt = new Date(); await setMeta("lastSyncAt", lastSyncAt.toISOString());
    }
    if (typeof renderCustomers === "function") await renderCustomers();
    if (typeof renderHomeDashboard === "function") await renderHomeDashboard();
  } finally { isSyncing = false; updateOfflineUI(); }
}
function ensureOfflineBanner() {
  let banner = document.getElementById("offlineBanner");
  if (banner) return banner;
  banner = document.createElement("div"); banner.id = "offlineBanner"; banner.setAttribute("role", "status");
  banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;padding:8px 12px;text-align:center;font-size:13px;font-weight:600;display:none;transition:background .2s";
  document.body.prepend(banner); return banner;
}
async function getFailedOps() {
  const queue = await getPendingOps();
  return queue.filter(op => Number(op.retries || 0) > 0 && op.last_error);
}
async function retryFailed() {
  const failed = await getFailedOps();
  for (const op of failed) {
    op.retries = 0;
    delete op.last_error;
    delete op.last_attempt_at;
    await updateOutboxItem(op);
  }
  await updateOfflineUI();
  if (failed.length && isOnline()) await processOutbox();
  return failed.length;
}
async function exportFailed() {
  const failed = await getFailedOps();
  return JSON.stringify(failed.map(op => ({
    type: op.type, operation_id: op.operation_id || op.payload?.client_operation_id || null,
    created_at: op.created_at, retries: op.retries, last_error: op.last_error,
    last_attempt_at: op.last_attempt_at, payload: op.payload || null,
    updates: op.updates || null, id: op.id || null, localId: op.localId || null
  })), null, 2);
}
async function hasPendingChanges() {
  try { return (await getPendingOps()).length > 0; } catch (_) { return false; }
}
// Remove ONLY the current user's cached rows, outbox items and id-maps (call before signOut, while session exists).
async function clearLocalDataForCurrentUser(knownOwnerId) {
  const ownerId = knownOwnerId || await currentOwnerId();
  if (!ownerId) return;
  try {
    const db = await openOfflineDb();
    const [cust, txs, ops] = await Promise.all([idbGetAll(STORE_CUSTOMERS), idbGetAll(STORE_TRANSACTIONS), idbGetAll(STORE_OUTBOX)]);
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CUSTOMERS, STORE_TRANSACTIONS, STORE_OUTBOX, STORE_META], "readwrite");
      cust.filter(r => ownedBy(r, ownerId)).forEach(r => tx.objectStore(STORE_CUSTOMERS).delete(r.id));
      txs.filter(r => ownedBy(r, ownerId)).forEach(r => tx.objectStore(STORE_TRANSACTIONS).delete(r.id));
      ops.filter(o => String(o.owner_id || o.payload?.user_id || "") === String(ownerId)).forEach(o => tx.objectStore(STORE_OUTBOX).delete(o.queueId));
      tx.objectStore(STORE_META).delete(`customerIdMap:${ownerId}`);
      tx.objectStore(STORE_META).delete(`transactionIdMap:${ownerId}`);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  } catch (e) { console.warn("clearLocalDataForCurrentUser failed", e); }
  customers = []; transactions = [];
}
// Shows "update available" bar when a new service worker is waiting.
function showUpdateBanner(reg) {
  if (document.getElementById("updateBanner")) return;
  const bar = document.createElement("div");
  bar.id = "updateBanner"; bar.setAttribute("role", "status");
  bar.style.cssText = "position:fixed;left:12px;right:12px;bottom:calc(90px + env(safe-area-inset-bottom,0px));z-index:99998;padding:10px 14px;border-radius:12px;background:#067a4b;color:#fff;font-size:14px;font-weight:600;text-align:center;box-shadow:0 4px 14px rgba(0,0,0,.28);cursor:pointer";
  bar.textContent = "নতুন আপডেট পাওয়া গেছে — ট্যাপ করে রিলোড করুন";
  bar.onclick = async () => {
    if (await hasPendingChanges() && !confirm("কিছু পরিবর্তন এখনো সিঙ্ক হয়নি। তবুও রিলোড করবেন? (ডেটা ফোনে সংরক্ষিত থাকবে)")) return;
    if (reg && reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
    else location.reload();
  };
  document.body.appendChild(bar);
}
function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("./sw.js").then(reg => {
    const watch = w => w && w.addEventListener("statechange", () => {
      if (w.state === "installed" && navigator.serviceWorker.controller) showUpdateBanner(reg);
    });
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg);
    reg.addEventListener("updatefound", () => watch(reg.installing));
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(err => console.warn("SW register failed:", err));
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloading) return; reloading = true; location.reload(); });
}
async function updateOfflineUI() {
  if (!document.body) return;
  const banner = ensureOfflineBanner(); const online = isOnline(); let queue = [], failed = [];
  try { queue = await getPendingOps(); failed = queue.filter(op => Number(op.retries || 0) > 0 && op.last_error); } catch (_) {}
  const pending = queue.length;
  if (failed.length) {
    banner.style.display="block"; banner.style.background="#b91c1c"; banner.style.color="#fff";
    banner.textContent = `${failed.length}টি পরিবর্তন সিঙ্ক হয়নি · আবার চেষ্টা করতে ট্যাপ করুন`;
    banner.onclick = async () => { if (confirm('ব্যর্থ পরিবর্তনগুলো আবার সিঙ্ক করার চেষ্টা করবেন?')) await retryFailed(); };
  } else {
    banner.onclick = null;
    if (!online) { banner.style.display="block"; banner.style.background="#b45309"; banner.style.color="#fff"; banner.textContent = pending ? `📡 অফলাইন মোড · ${pending}টি পরিবর্তন নেট এলে সিঙ্ক হবে` : "📡 অফলাইন মোড · লোকাল ডেটা দেখাচ্ছে"; }
    else if (isSyncing) { banner.style.display="block"; banner.style.background="#1d4ed8"; banner.style.color="#fff"; banner.textContent="🔄 সিঙ্ক হচ্ছে..."; }
    else if (pending) { banner.style.display="block"; banner.style.background="#0369a1"; banner.style.color="#fff"; banner.textContent=`⬆️ ${pending}টি পরিবর্তন সিঙ্কের অপেক্ষায়`; }
    else banner.style.display="none";
  }
}
function initOfflineSupport() {
  openOfflineDb().catch(e => console.warn("IndexedDB open failed", e));
  window.addEventListener("online", () => { updateOfflineUI(); processOutbox(); });
  window.addEventListener("offline", updateOfflineUI);
  window.addEventListener("focus", () => { if (isOnline()) processOutbox(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && isOnline()) processOutbox(); });
  setInterval(() => { if (isOnline()) processOutbox(); else updateOfflineUI(); }, 30000);
  updateOfflineUI();
}
window.offlineSupport = {
  isOnline, loadCustomersOfflineAware, loadTransactionsOfflineAware,
  offlineAwareInsertCustomer, offlineAwareUpdateCustomer, offlineAwareDeleteCustomer,
  offlineAwareInsertTransaction, offlineAwareUpdateTransaction, offlineAwareDeleteTransaction,
  processOutbox, updateOfflineUI, initOfflineSupport, cacheCustomersLocally, cacheTransactionsLocally,
  retryFailed, getFailedOps, exportFailed,
  hasPendingChanges, clearLocalDataForCurrentUser, currentOwnerId, registerServiceWorker
};
