import { firebaseDb } from "./firebase";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  type Unsubscribe,
} from "firebase/firestore";

export type DBItem = {
  id: string;
  type: "warranty" | "subscription";
  title: string;
  provider?: string;
  category: string;
  price?: number;
  currency?: string;
  tags?: string[];
  endDate?: string;
  nextBillingDate?: string;
  startDate?: string;
  status: "active" | "endsSoon" | "expired" | "canceled" | "overdue";
  documents?: { type: string; name: string; url: string; path?: string }[];
  reminders?: { dateISO: string; note?: string }[];
  createdAt?: any;
  updatedAt?: any;
};

export type ReminderDoc = {
  id?: string;
  atMs: number;
  userId: string;
  itemId: string;
  itemTitle: string;
  note?: string;
  sent?: boolean;
  createdAt?: any;
  sentAt?: any;
};

function itemsColRef(uid: string) {
  return collection(firebaseDb, "users", uid, "items");
}

export function subscribeItems(uid: string, cb: (items: DBItem[]) => void): Unsubscribe {
  const q = query(itemsColRef(uid), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    const list: DBItem[] = [];
    snap.forEach((d) => {
      const data = d.data() as DBItem;
      const id = d.id;
      list.push({ ...data, id });
    });
    cb(list);
  });
}

function pruneUndefined<T>(value: T): T {
  if (value === undefined) return undefined as unknown as T;
  if (value === null) return value;
  if (Array.isArray(value)) {
    const arr = (value as unknown as any[])
      .filter((el) => el !== undefined)
      .map((el) => (el && typeof el === 'object' ? pruneUndefined(el) : el));
    return arr as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v === undefined) continue;
      out[k] = v && typeof v === 'object' ? pruneUndefined(v) : v;
    }
    return out as unknown as T;
  }
  return value;
}

export async function setItem(uid: string, item: DBItem): Promise<void> {
  const ref = doc(itemsColRef(uid), item.id);
  const payload = pruneUndefined({ ...item, createdAt: item.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp() });
  await setDoc(ref, payload, { merge: true });
}

export async function updateItemPartial(uid: string, id: string, partial: Partial<DBItem>): Promise<void> {
  const ref = doc(itemsColRef(uid), id);
  const payload = pruneUndefined({ ...partial, updatedAt: serverTimestamp() } as any);
  await updateDoc(ref, payload);
}

export async function deleteItem(uid: string, id: string): Promise<void> {
  const ref = doc(itemsColRef(uid), id);
  await deleteDoc(ref);
}


// FCM tokens
import { setDoc as setDocRaw, doc as docRaw, collection as collectionRaw } from 'firebase/firestore';
export async function saveFcmToken(uid: string, token: string): Promise<void> {
  const ref = docRaw(collectionRaw(firebaseDb, 'users', uid, 'tokens'), token);
  await setDocRaw(ref, { createdAt: serverTimestamp() }, { merge: true });
}

// Reminder documents for push scheduling
export async function addReminder(uid: string, r: Omit<ReminderDoc, 'userId'>): Promise<void> {
  const ref = docRaw(collectionRaw(firebaseDb, 'users', uid, 'reminders'));
  const payload = pruneUndefined({
    ...r,
    userId: uid,
    sent: false,
    createdAt: serverTimestamp(),
  } as any);
  await setDocRaw(ref, payload);
}


