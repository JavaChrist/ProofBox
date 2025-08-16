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

function pruneUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = pruneUndefined(v as any);
    } else {
      out[k] = v;
    }
  }
  return out as T;
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


