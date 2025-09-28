
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Calendar,
  Search,
  Plus,
  AlertTriangle,
  ChevronDown,
  CreditCard,
  Package,
  Wifi,
  Phone,
  Tv2,
  HardDrive,
  ShoppingCart,
  Tag,
  Sun,
  Moon,
  Trash2,
  Paperclip,
  LogOut,
  X
} from "lucide-react";
import { uploadInvoiceFile, deleteFileByPath } from "../lib/files";
import { ensureNotificationPermission, scheduleLocalNotification, showLocalNotification } from "../lib/notify";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { subscribeItems, setItem as setDbItem, updateItemPartial as updateDbItem, deleteItem as deleteDbItem, type DBItem, addReminder as addReminderDoc } from "../lib/db";

// ---- Helpers
function parseDateFlexible(input?: string): Date | undefined {
  if (!input) return undefined;
  // If date-only format YYYY-MM-DD, parse in local time to avoid TZ shift
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, dd] = input.split("-").map(Number);
    return new Date(y, (m || 1) - 1, dd || 1, 12, 0, 0); // noon local to avoid DST edge
  }
  const d = new Date(input);
  return isNaN(d.getTime()) ? undefined : d;
}

// Accepte "YYYY-MM-DDTHH:mm" (datetime-local) et "dd/mm/yyyy HH:mm"
function parseDateTimeFlexible(input: string): Date | undefined {
  if (!input) return undefined;
  // datetime-local exact, interprété en heure locale
  const m1 = input.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})$/);
  if (m1) {
    const [, y, mo, d, h, mi] = m1.map(Number) as unknown as number[];
    return new Date(y as number, (mo as number) - 1, d as number, h as number, mi as number, 0);
  }
  // format saisi manuellement: dd/mm/yyyy HH:mm (ou sans heure)
  const m2 = input.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (m2) {
    const dd = parseInt(m2[1], 10);
    const mm = parseInt(m2[2], 10);
    const yy = parseInt(m2[3], 10);
    const hh = m2[4] ? parseInt(m2[4], 10) : 9;
    const mi = m2[5] ? parseInt(m2[5], 10) : 0;
    return new Date(yy, mm - 1, dd, hh, mi, 0);
  }
  const d = new Date(input);
  return isNaN(d.getTime()) ? undefined : d;
}

const fmt = (d?: string) => {
  const parsed = parseDateFlexible(d);
  return parsed ? parsed.toLocaleDateString() : "—";
};
const daysLeft = (iso?: string) => {
  if (!iso) return Infinity;
  const today = new Date();
  const target = parseDateFlexible(iso) || new Date();
  const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 3600 * 24));
  return diff;
};

// progress 0..100
function progressTo(dateISO?: string, fallbackWindowDays = 30) {
  if (!dateISO) return 0;
  const left = daysLeft(dateISO);
  const window = Math.max(fallbackWindowDays, 1);
  const clamped = Math.max(0, Math.min(window, window - left));
  return Math.round((clamped / window) * 100);
}

function barColor(left: number) {
  if (left <= 3) return "bg-rose-500";
  if (left <= 10) return "bg-amber-500";
  return "bg-emerald-500";
}

function addMonths(base: Date, months: number) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addYears(base: Date, years: number) {
  const d = new Date(base);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

// ---- Types
type ItemType = "warranty" | "subscription";
type Status = "active" | "endsSoon" | "expired" | "canceled" | "overdue";

interface DocumentRef { type: "invoice" | "warranty" | "other"; name: string; url: string; path?: string }
interface ReminderRef { dateISO: string; note?: string }

interface BaseItem {
  id: string;
  type: ItemType;
  title: string;
  provider?: string; // vendeur pour garanties, opérateur pour abo
  category: string; // ex: "Maison/Électroménager" | "internet" | ...
  price?: number;
  currency?: string;
  tags?: string[];
  // warranty
  endDate?: string; // fin de garantie (ISO)
  // subscription
  nextBillingDate?: string; // prochaine échéance (ISO)
  startDate?: string;
  status: Status;
  documents?: DocumentRef[];
  reminders?: ReminderRef[];
}

// ---- Category theming (couleurs "réalistes")
function catTheme(category: string) {
  // Couleur stable et bien différenciée: hash → palette de teintes espacées
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  // Teintes espacées (14 couleurs distinctes)
  const hues = [12, 32, 52, 72, 92, 112, 142, 172, 202, 232, 262, 292, 322, 342];
  const h = hues[hash % hues.length];
  const stripe = `hsl(${h} 78% 48%)`;
  const iconBgLight = `hsl(${h} 90% 94%)`;
  const iconTextLight = `hsl(${h} 40% 26%)`;
  const iconBgDark = `hsl(${h} 40% 20% / 0.45)`;
  const iconTextDark = `hsl(${h} 65% 72%)`;
  const priceColorLight = `hsl(${h} 46% 32%)`;
  const priceColorDark = `hsl(${h} 64% 72%)`;
  return {
    // classes minimales + styles dynamiques
    icon: "",
    iconStyleLight: { backgroundColor: iconBgLight, color: iconTextLight } as React.CSSProperties,
    iconStyleDark: { backgroundColor: iconBgDark, color: iconTextDark } as React.CSSProperties,
    stripeStyle: { backgroundColor: stripe } as React.CSSProperties,
    priceStyleLight: { color: priceColorLight } as React.CSSProperties,
    priceStyleDark: { color: priceColorDark } as React.CSSProperties,
  };
}

// ---- Initial (prod): pas de données de démo, tout vient de Firestore
const INITIAL_ITEMS: BaseItem[] = [];

// ---- Small UI primitives
function Badge(
  { children, tone = "default" as "default" | "warning" | "danger" | "muted" }:
    { children: ReactNode; tone?: "default" | "warning" | "danger" | "muted" }
) {
  const tones: Record<string, string> = {
    default: "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
    warning: "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800/60",
    danger: "bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-800/60",
    muted: "bg-slate-50 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${tones[tone]}`}> {children} </span>
  );
}

const ChipButton = ({ active, children, onClick, color = "slate" }: any) => (
  <button
    onClick={onClick}
    className={`px-3 py-1 rounded-full text-sm border transition ${active
      ? `text-white border-${color}-700 bg-${color}-700`
      : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700"
      }`}
  >
    {children}
  </button>
);

function CategoryIcon({ name }: { name: string }) {
  if (name.startsWith("Maison")) return <Package className="w-4 h-4" />;
  if (name.startsWith("Bricolage")) return <ShoppingCart className="w-4 h-4" />;
  if (name.toLowerCase().includes("informatique") || name.includes("Ordinateurs")) return <HardDrive className="w-4 h-4" />;
  if (name === "internet") return <Wifi className="w-4 h-4" />;
  if (name === "mobile") return <Phone className="w-4 h-4" />;
  if (name === "streaming-video") return <Tv2 className="w-4 h-4" />;
  return <Tag className="w-4 h-4" />;
}

function Progress({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center p-4 bg-black/30" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditModal({ item, onCancel, onSave }: { item: BaseItem; onCancel: () => void; onSave: (updated: BaseItem) => void }) {
  const [title, setTitle] = useState(item.title);
  const [provider, setProvider] = useState(item.provider ?? "");
  const [category, setCategory] = useState(item.category);
  const [price, setPrice] = useState(typeof item.price === "number" ? item.price : 0);
  const [currency, setCurrency] = useState(item.currency ?? "EUR");
  const [status, setStatus] = useState<Status>(item.status);
  const [endDate, setEndDate] = useState(item.endDate ? item.endDate.slice(0, 10) : "");
  const [nextBillingDate, setNextBillingDate] = useState(item.nextBillingDate ? item.nextBillingDate.slice(0, 10) : "");
  const [purchase, setPurchase] = useState(item.startDate ? item.startDate.slice(0, 10) : "");
  const [duration, setDuration] = useState<string>(() => {
    if (item.type !== 'warranty' || !item.endDate) return '24';
    const start = item.startDate ? (parseDateFlexible(item.startDate) || new Date()) : new Date();
    const end = parseDateFlexible(item.endDate) || new Date();
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    return String(Math.max(1, months || 24));
  });

  useEffect(() => {
    if (item.type !== 'warranty') return;
    const base = purchase ? (parseDateFlexible(purchase) || new Date()) : (item.startDate ? (parseDateFlexible(item.startDate) || new Date()) : new Date());
    const m = Math.max(1, parseInt(duration || '24', 10));
    const e = addMonths(base, m);
    const y = e.getFullYear();
    const mm = String(e.getMonth() + 1).padStart(2, '0');
    const dd = String(e.getDate()).padStart(2, '0');
    setEndDate(`${y}-${mm}-${dd}`);
  }, [purchase, duration]);

  const handleSave = () => {
    const updated: BaseItem = {
      ...item,
      title: title.trim() || item.title,
      provider: provider.trim() || undefined,
      category: category.trim() || item.category,
      price: Number.isNaN(price) ? item.price : price,
      currency: currency || item.currency,
      status,
      endDate: item.type === "warranty" ? (endDate ? new Date(endDate).toISOString() : undefined) : undefined,
      nextBillingDate: item.type === "subscription" ? (nextBillingDate ? new Date(nextBillingDate).toISOString() : undefined) : undefined,
    };
    onSave(updated);
  };

  return (
    <Modal title="Modifier" onClose={onCancel}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Titre</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40 bg-white dark:bg-slate-900 dark:border-slate-700 dark:ring-slate-700 dark:focus:ring-indigo-500/35" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Fournisseur</label>
          <input value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40 bg-white dark:bg-slate-900 dark:border-slate-700 dark:ring-slate-700 dark:focus:ring-indigo-500/35" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Catégorie</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40 bg-white dark:bg-slate-900 dark:border-slate-700 dark:ring-slate-700 dark:focus:ring-indigo-500/35" />
        </div>
        <div className="grid grid-cols-3 gap-2 items-end">
          <div className="col-span-2">
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Montant</label>
            <input value={price} onChange={(e) => setPrice(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 rounded-xl border border-slate-300 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40 bg-white dark:bg-slate-900 dark:border-slate-700 dark:ring-slate-700 dark:focus:ring-indigo-500/35" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Devise</label>
            <input value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40 bg-white dark:bg-slate-900 dark:border-slate-700 dark:ring-slate-700 dark:focus:ring-indigo-500/35" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">État</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className="w-full px-3 py-2 rounded-xl border border-slate-300 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40 bg-white dark:bg-slate-900 dark:border-slate-700 dark:ring-slate-700 dark:focus:ring-indigo-500/35">
            {(["active", "endsSoon", "expired", "canceled", "overdue"] as const).map(s => <option key={s} value={s}>{labelStatus(s)}</option>)}
          </select>
        </div>
        {item.type === "warranty" ? (
          <>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Date d’achat</label>
              <input type="date" value={purchase} onChange={(e) => setPurchase(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40 bg-white dark:bg-slate-900 dark:border-slate-700 dark:ring-slate-700 dark:focus:ring-indigo-500/35" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Durée</label>
              <select value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40 bg-white dark:bg-slate-900 dark:border-slate-700 dark:ring-slate-700 dark:focus:ring-indigo-500/35">
                {['12', '24', '36', '48', '60', '72', '84', '96', '108', '120'].map(m => <option key={m} value={m}>{parseInt(m, 10) / 12} an(s)</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Fin de garantie</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40 bg-white dark:bg-slate-900 dark:border-slate-700 dark:ring-slate-700 dark:focus:ring-indigo-500/35" />
            </div>
          </>
        ) : (
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Prochain prélèvement</label>
            <input type="date" value={nextBillingDate} onChange={(e) => setNextBillingDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40 bg-white dark:bg-slate-900 dark:border-slate-700 dark:ring-slate-700 dark:focus:ring-indigo-500/35" />
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Annuler</button>
        <button onClick={handleSave} className="px-3 py-2 rounded-xl text-white bg-gradient-to-r from-indigo-600 to-sky-600">Enregistrer</button>
      </div>
    </Modal>
  );
}

// ---- Main Component
export default function ProofBoxMock() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"warranties" | "subscriptions">("warranties");
  const [items, setItems] = useState<BaseItem[]>(INITIAL_ITEMS);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string | "all">("all");
  const [selected, setSelected] = useState<BaseItem | null>(null);
  const [showNew, setShowNew] = useState<null | ItemType>(null);
  const { isDark, toggle } = useTheme();
  const [editing, setEditing] = useState<BaseItem | null>(null);
  const [docsFor, setDocsFor] = useState<BaseItem | null>(null);
  const [remindFor, setRemindFor] = useState<BaseItem | null>(null);
  const [toDelete, setToDelete] = useState<BaseItem | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; provider: string; category: string; amount: string; purchase: string; duration: string }>({ title: "", provider: "", category: "", amount: "", purchase: "", duration: "24" });

  const updateItem = async (updated: BaseItem) => {
    setItems(prev => prev.map(it => it.id === updated.id ? updated : it));
    setSelected(sel => (sel && sel.id === updated.id ? updated : sel));
    // garder les modales synchronisées avec l'élément mis à jour
    setRemindFor(cur => (cur && cur.id === updated.id ? updated : cur));
    setDocsFor(cur => (cur && cur.id === updated.id ? updated : cur));
    if (user?.uid) await setDbItem(user.uid, updated as unknown as DBItem);
  };

  const handleMarkPaid = (item: BaseItem) => {
    if (item.type !== "subscription") return;
    const refDate = item.nextBillingDate ? new Date(item.nextBillingDate) : new Date();
    const next = addMonths(refDate, 1).toISOString();
    void updateItem({ ...item, nextBillingDate: next, status: "active" });
  };

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeItems(user.uid, (remote) => {
      // fusionne id doc si absent
      const normalized = (remote as unknown as BaseItem[]).map((r: any) => ({ id: r.id, ...r }));
      setItems(normalized as unknown as BaseItem[]);
      setSelected(sel => sel ? (remote.find(r => r.id === sel.id) as any) ?? null : null);
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!showNew) return;
    setDraft({ title: "", provider: "", category: "", amount: "", purchase: "", duration: "24" });
  }, [showNew]);

  // Masquer la fiche sélectionnée si on change d'onglet (type différent)
  useEffect(() => {
    setSelected((sel) => {
      if (!sel) return sel;
      const tabType = tab === "warranties" ? "warranty" : "subscription";
      return sel.type === tabType ? sel : null;
    });
  }, [tab]);

  const filtered = useMemo(() => {
    const type = tab === "warranties" ? "warranty" : "subscription";
    return items
      .filter(i => i.type === type)
      .filter(i => (statusFilter === "all" ? true : i.status === statusFilter))
      .filter(i => (categoryFilter === "all" ? true : i.category === categoryFilter))
      .filter(i => {
        if (!query) return true;
        const hay = `${i.title} ${i.provider ?? ""} ${i.category} ${(i.tags || []).join(" ")}`.toLowerCase();
        return hay.includes(query.toLowerCase());
      })
      .sort((a, b) => {
        const da = tab === "warranties" ? a.endDate : a.nextBillingDate;
        const db = tab === "warranties" ? b.endDate : b.nextBillingDate;
        return (new Date(da || 0).getTime() - new Date(db || 0).getTime());
      });
  }, [items, tab, statusFilter, categoryFilter, query]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.filter(i => i.type === (tab === "warranties" ? "warranty" : "subscription"))
      .forEach(i => set.add(i.category));
    return ["all", ...Array.from(set)];
  }, [items, tab]);

  // Grouped view by category (dynamic categories)
  const groups = useMemo(() => {
    const map = new Map<string, BaseItem[]>();
    filtered.forEach(it => {
      const k = it.category || 'Sans catégorie';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const handleCreateQuick = async (type: ItemType) => {
    const id = Math.random().toString(36).slice(2);
    const now = new Date();
    const purchase = draft.purchase ? (parseDateFlexible(draft.purchase) || now) : now;
    const months = Math.max(1, parseInt(draft.duration || "24", 10));
    const endLocal = addMonths(purchase, months);
    const nextDate = addMonths(now, 1);
    const base: BaseItem = {
      id,
      type,
      title: draft.title.trim() || (type === "warranty" ? "" : "" as any),
      provider: draft.provider.trim() || undefined,
      category: draft.category.trim() || (type === "warranty" ? "Maison/Électroménager" : "internet"),
      price: isNaN(Number.parseFloat(draft.amount)) ? undefined : Number.parseFloat(draft.amount),
      currency: "EUR",
      status: "active",
      startDate: now.toISOString(),
      ...(type === "warranty"
        ? { endDate: endLocal.toISOString(), nextBillingDate: undefined }
        : { nextBillingDate: nextDate.toISOString(), endDate: undefined })
    };
    setShowNew(null);
    if (!user?.uid) {
      setSaveError("Tu dois être connecté pour sauvegarder.");
      return;
    }
    try {
      await setDbItem(user.uid, base as unknown as DBItem);
      // l'écoute Firestore ramènera l'item; pas d’insert local pour éviter les doublons
    } catch (e: any) {
      setSaveError(e?.message || "Échec de sauvegarde Firebase");
    }
  };

  const activeTabColor = tab === "warranties" ? "from-indigo-500 to-sky-500" : "from-fuchsia-500 to-rose-500";

  return (
    <div className={isDark ? "dark" : ""}>
      <div className={`min-h-screen ${isDark ? 'bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900' : 'bg-gradient-to-br from-[#f4f5f2] via-[#fafaf7] to-[#f4f5f2] noise-light'} text-slate-900 dark:text-slate-100`}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 backdrop-blur bg-white/80 dark:bg-slate-900/80 border-b border-slate-300 dark:border-slate-800">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
            <img src="/icon-512.png" alt="ProofBox" className="w-12 h-12" />
            <h1 className="text-lg font-semibold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-300">
              ProofBox
            </h1>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={toggle}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-sm bg-white border-slate-300 hover:bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:border-slate-700 dark:ring-slate-700 dark:hover:bg-slate-800"
                title={isDark ? "Mode clair" : "Mode sombre"}
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                <span className="hidden sm:inline">{isDark ? "Clair" : "Sombre"}</span>
              </button>
              <div className="hidden md:flex items-center bg-white border border-slate-300 rounded-xl px-3 py-1.5 gap-2 w-96 dark:bg-slate-900 dark:border-slate-700">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher (/, titre, fournisseur, tags…)"
                  className="w-full bg-transparent outline-none text-sm placeholder:text-slate-400"
                />
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">/</span>
              </div>
              <div className="flex gap-2">
                {/* Bouton Ajouter unique (desktop/tablette). En mobile, on garde le FAB. */}
                <button
                  onClick={() => setShowNew(tab === "warranties" ? "warranty" : "subscription")}
                  className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 via-sky-500 to-rose-500 text-white text-sm hover:brightness-110 shadow-sm"
                >
                  <Plus className="w-4 h-4" /> Ajouter
                </button>
                <SignOutButton />
              </div>
            </div>
          </div>
          {saveError && (
            <div className="max-w-6xl mx-auto px-4 pt-2">
              <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 dark:bg-rose-900/20 dark:border-rose-900/30 dark:text-rose-300">{saveError}</div>
            </div>
          )}
          <div className="max-w-6xl mx-auto px-4">
            <nav className="flex gap-2 pb-2">
              <TabButton
                active={tab === "warranties"}
                onClick={() => setTab("warranties")}
                variant="indigo"
                icon={<Package className="w-4 h-4" />}
              >
                Garanties
              </TabButton>
              <TabButton
                active={tab === "subscriptions"}
                onClick={() => setTab("subscriptions")}
                variant="fuchsia"
                icon={<CreditCard className="w-4 h-4" />}
              >
                Abonnements
              </TabButton>
            </nav>
          </div>
        </header>

        {/* Filters */}
        <section className="border-b border-slate-300 bg-white/80 dark:bg-slate-900/80 dark:border-slate-800">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-2">
            <div className="md:hidden flex-1">
              <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 gap-2 w-full dark:bg-slate-900 dark:border-slate-700">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher…"
                  className="w-full bg-transparent outline-none text-sm placeholder:text-slate-400"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-300">État</span>
              {(["all", "active", "endsSoon", "expired", "canceled", "overdue"] as const).map((s) => (
                <ChipButton key={s} active={statusFilter === s} onClick={() => setStatusFilter(s as any)} color={tab === "warranties" ? "indigo" : "fuchsia"}>
                  {labelStatus(s)}
                </ChipButton>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs font-medium text-sky-600 dark:text-sky-300">Catégorie</span>
              <select
                className="px-2 py-1.5 text-sm rounded-xl bg-white border border-slate-300 ring-1 ring-slate-200 dark:bg-slate-900 dark:border-slate-700 dark:ring-slate-700"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as any)}
              >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* Content */}
        <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* List */}
          <div className="lg:col-span-8 xl:col-span-9 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {groups.map(([cat, list]) => (
              <div key={`grp-${cat}`} className="contents">
                <div className="col-span-full flex items-center gap-2 mt-2 mb-1 px-1">
                  {(() => {
                    const th = catTheme(cat); return (
                      <span className="inline-flex w-6 h-6 rounded-lg" style={isDark ? th.iconStyleDark : th.iconStyleLight} />
                    );
                  })()}
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{cat}</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">{list.length}</span>
                </div>
                {list.map((i) => {
                  const theme = catTheme(i.category);
                  const left = i.type === "warranty" ? daysLeft(i.endDate) : daysLeft(i.nextBillingDate);
                  const prog = i.type === "warranty" ? progressTo(i.endDate, 365) : progressTo(i.nextBillingDate, 30);
                  const colorBar = barColor(left);
                  const derivedStatus: Status = i.type === "warranty"
                    ? (left <= 0 ? "expired" : (left <= 30 ? "endsSoon" : "active"))
                    : (i.nextBillingDate && daysLeft(i.nextBillingDate) < 0 ? "overdue" : i.status);
                  return (
                    <article
                      key={i.id}
                      onClick={() => setSelected(i)}
                      className={`group relative cursor-pointer bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl overflow-hidden hover:shadow-md transition ring-1 ring-slate-200 dark:ring-slate-800`}
                    >
                      <div className="h-1.5" style={theme.stripeStyle} />
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={`mt-1 shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl`} style={isDark ? theme.iconStyleDark : theme.iconStyleLight}>
                            {i.type === "warranty" ? <Package className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium leading-tight line-clamp-1 flex items-center gap-2 flex-1">
                                <span>{i.title}</span>
                                {i.documents && i.documents.length > 0 && (
                                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    <Paperclip className="w-3 h-3" /> {i.documents.length}
                                  </span>
                                )}
                              </h3>
                              {derivedStatus === "endsSoon" && (
                                <Badge tone="warning"><AlertTriangle className="w-3 h-3 mr-1" /> Bientôt</Badge>
                              )}
                              {derivedStatus === "expired" && <Badge tone="danger">Expiré</Badge>}
                              {derivedStatus === "overdue" && <Badge tone="danger">Impayé</Badge>}
                              <button
                                onClick={(e) => { e.stopPropagation(); setToDelete(i); }}
                                className="ml-auto inline-flex items-center justify-center w-7 h-7 rounded-xl border border-slate-300 bg-white/70 backdrop-blur hover:bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"
                                title="Supprimer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                              <CategoryIcon name={i.category} />
                              <span className="truncate">{i.provider ?? "—"}</span>
                              <span>•</span>
                              {i.type === "warranty" ? (
                                <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> Fin garantie : {fmt(i.endDate)} ({left} j)</span>
                              ) : (
                                <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> Prochain prélèvement : {fmt(i.nextBillingDate)} ({left} j)</span>
                              )}
                            </div>
                            <div className="mt-2 text-sm">
                              {typeof i.price === "number" ? (
                                <span className="font-semibold" style={isDark ? theme.priceStyleDark : theme.priceStyleLight}>{i.price?.toFixed(2)} {i.currency}</span>
                              ) : <span className="text-slate-400">—</span>}
                            </div>
                            <div className="mt-3">
                              <Progress value={prog} color={colorBar} />
                            </div>
                            {i.tags && i.tags.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {i.tags.map(t => <Badge key={t} tone="muted">#{t}</Badge>)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full text-center text-slate-500 dark:text-slate-400 py-16 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-900">Aucun élément avec ces filtres.</div>
            )}
          </div>

          {/* Details panel */}
          <aside className="lg:col-span-4 xl:col-span-3">
            {selected ? (
              <div className="sticky top-[88px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className={`mt-1 shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl ${catTheme(selected.category).icon}`}>
                    {selected.type === "warranty" ? <Package className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold leading-tight">{selected.title}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{selected.provider} · {selected.category}</p>
                  </div>
                  <button onClick={() => setSelected(null)} className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" aria-label="Fermer">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  {selected.type === "warranty" ? (
                    <div className="flex items-center justify-between"><span className="text-slate-500 dark:text-slate-400">Fin de garantie</span><span>{fmt(selected.endDate)} ({daysLeft(selected.endDate)} j)</span></div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between"><span className="text-slate-500 dark:text-slate-400">Prochain prélèvement</span><span>{fmt(selected.nextBillingDate)} ({daysLeft(selected.nextBillingDate)} j)</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-500 dark:text-slate-400">Début</span><span>{fmt(selected.startDate)}</span></div>
                    </>
                  )}
                  <div className="flex items-center justify-between"><span className="text-slate-500 dark:text-slate-400">Montant</span><span>{typeof selected.price === "number" ? `${selected.price.toFixed(2)} ${selected.currency}` : "—"}</span></div>
                  <div className="pt-2">
                    <Progress
                      value={selected.type === "warranty" ? progressTo(selected.endDate, 365) : progressTo(selected.nextBillingDate, 30)}
                      color={barColor(selected.type === "warranty" ? daysLeft(selected.endDate) : daysLeft(selected.nextBillingDate))}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <Badge>{labelStatus(selected.status)}</Badge>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-2">
                  {selected.type === "warranty" ? (
                    <>
                      <button onClick={() => setDocsFor(selected)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm">Ouvrir facture</button>
                      <button onClick={() => setRemindFor(selected)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm">Ajouter rappel</button>
                      <button onClick={() => setEditing(selected)} className="col-span-2 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 text-white text-sm">Modifier</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setDocsFor(selected)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm">Dernière facture</button>
                      <button onClick={() => handleMarkPaid(selected)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm">Marquer payé</button>
                      <button onClick={() => setEditing(selected)} className="col-span-2 px-3 py-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-rose-600 text-white text-sm">Modifier</button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="sticky top-[88px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl p-6 text-sm ring-1 ring-slate-200 dark:ring-slate-700">
                <span className="font-medium text-sky-700 dark:text-sky-300">Sélectionne un élément</span> pour voir les détails, les documents et les actions rapides.
              </div>
            )}
          </aside>
        </main>

        {/* Mobile FAB */}
        <button
          onClick={() => setShowNew(tab === "warranties" ? "warranty" : "subscription")}
          className="fixed bottom-6 right-6 md:hidden inline-flex items-center gap-2 px-4 py-3 rounded-full shadow-lg text-white bg-gradient-to-r from-indigo-600 via-sky-500 to-rose-500"
        >
          <Plus className="w-4 h-4" /> Ajouter
        </button>

        {/* Quick create sheet */}
        {showNew && (
          <div className="fixed inset-0 bg-black/30 flex items-end md:items-center justify-center p-4 z-30" onClick={() => setShowNew(null)}>
            <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold mb-3">{showNew === "warranty" ? "Nouvelle garantie" : "Nouvel abonnement"}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Titre</label>
                  <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" placeholder={showNew === "warranty" ? "Ex: Lave-vaisselle Bosch" : "Ex: Netflix Premium"} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Fournisseur</label>
                  <input value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" placeholder={showNew === "warranty" ? "Darty, Amazon…" : "Orange, Netflix…"} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Catégorie</label>
                  <input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" placeholder={showNew === "warranty" ? "Maison/Électroménager" : "internet"} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Montant</label>
                  <input value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" placeholder="0.00 EUR" />
                </div>
                {showNew === 'warranty' ? (
                  <>
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Date d’achat</label>
                      <input type="date" value={draft.purchase} onChange={(e) => setDraft({ ...draft, purchase: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Durée de garantie</label>
                      <select value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                        {['12', '24', '36', '48', '60', '72', '84', '96', '108', '120'].map(m => <option key={m} value={m}>{parseInt(m, 10) / 12} an(s)</option>)}
                      </select>
                    </div>
                  </>
                ) : (
                  <div className="md:col-span-2">
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Prochain prélèvement</label>
                    <input type="date" value={draft.purchase} onChange={(e) => setDraft({ ...draft, purchase: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button onClick={() => setShowNew(null)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Annuler</button>
                <button onClick={() => handleCreateQuick(showNew as ItemType)} className={`px-3 py-2 rounded-xl text-white bg-gradient-to-r ${showNew === "warranty" ? "from-indigo-600 to-sky-600" : "from-fuchsia-600 to-rose-600"}`}>Créer</button>
              </div>
            </div>
          </div>
        )}

        {editing && (
          <EditModal
            item={editing}
            onCancel={() => { setEditing(null); setSelected(null); }}
            onSave={(upd) => { updateItem(upd); setEditing(null); setSelected(null); }}
          />
        )}

        {docsFor && (
          <DocumentsModal
            item={docsFor}
            onUpdate={(upd) => updateItem(upd)}
            onClose={() => setDocsFor(null)}
          />
        )}

        {remindFor && (
          <ReminderModal
            item={remindFor}
            onUpdate={(upd) => updateItem(upd)}
            onClose={() => setRemindFor(null)}
          />
        )}

        {/* Desktop bottom add button (centered) */}
        <div className="hidden md:flex max-w-6xl mx-auto px-4 pb-6 justify-center">
          <button
            onClick={() => setShowNew(tab === "warranties" ? "warranty" : "subscription")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-white bg-gradient-to-r from-indigo-600 via-sky-500 to-rose-500 shadow-md hover:brightness-110"
          >
            <Plus className="w-4 h-4" /> Ajouter
          </button>
        </div>

        {toDelete && (
          <Modal title="Supprimer" onClose={() => setToDelete(null)}>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">Confirmer la suppression de <span className="font-medium">{toDelete.title}</span> ? Cette action est irréversible.</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Fichiers liés: {toDelete.documents?.length ?? 0}</p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setToDelete(null)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Annuler</button>
              <button onClick={async () => {
                // supprimer documents liés dans Storage
                try {
                  const docs = toDelete.documents || [];
                  if (docs.length > 0) {
                    const { deleteFileByPath } = await import("../lib/../lib/files");
                    await Promise.all(docs.map(d => d.path ? deleteFileByPath(d.path) : Promise.resolve()));
                  }
                } catch { }
                // supprimer l'item en base
                if (user?.uid) await deleteDbItem(user.uid, toDelete.id);
                setToDelete(null);
                if (selected?.id === toDelete.id) setSelected(null);
              }} className="px-3 py-2 rounded-xl text-white bg-gradient-to-r from-rose-600 to-amber-600">Supprimer</button>
            </div>
          </Modal>
        )}


      </div>
    </div>
  );
}

function TabButton({ active, onClick, children, icon, variant = "indigo" }: any) {
  const activeCls = variant === "indigo" ? "from-indigo-600 to-sky-600" : "from-fuchsia-600 to-rose-600";
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm transition ${active
        ? `text-white border-transparent bg-gradient-to-r ${activeCls}`
        : "bg-white border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700"
        }`}
    >
      {icon}
      {children}
    </button>
  );
}

function labelStatus(s: Status | "all") {
  switch (s) {
    case "all": return "Tous";
    case "active": return "Actif";
    case "endsSoon": return "Bientôt";
    case "expired": return "Expiré";
    case "canceled": return "Résilié";
    case "overdue": return "Impayé";
    default: return s;
  }
}

function FilterIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-400">
      <path d="M3 5h18M7 12h10M10 19h4" />
    </svg>
  );
}

function SignOutButton() {
  const { signOut } = useAuth();
  return (
    <button onClick={signOut as any} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-slate-200 to-slate-300 text-slate-800 text-sm hover:brightness-110 shadow-sm dark:from-slate-700 dark:to-slate-800 dark:text-slate-100">
      <span className="hidden sm:inline">Déconnexion</span>
      <LogOut className="w-4 h-4 sm:ml-0" />
    </button>
  );
}

function DocumentsModal({ item, onUpdate, onClose }: { item: BaseItem; onUpdate: (updated: BaseItem) => void; onClose: () => void }) {
  const docs = item.documents ?? [];
  const [progress, setProgress] = useState<number | null>(null);
  const addDoc = async (file: File) => {
    const MIN_MS = 2400;
    setProgress(0);
    const start = Date.now();
    let fake = 0;
    const fakeId = setInterval(() => {
      fake = Math.min(fake + 4, 90);
      setProgress(prev => (prev === null ? fake : Math.max(prev, fake)));
    }, 100);
    try {
      const res = await uploadInvoiceFile(item.id, file, (p) => setProgress(Math.max(p, fake)));
      const next: DocumentRef = { type: "invoice", name: res.name, url: res.url, path: res.path };
      onUpdate({ ...item, documents: [...docs, next] });
    } finally {
      clearInterval(fakeId);
      const elapsed = Date.now() - start;
      if (elapsed < MIN_MS) {
        await new Promise(r => setTimeout(r, MIN_MS - elapsed));
      }
      setProgress(100);
      await new Promise(r => setTimeout(r, 500));
      setProgress(null);
    }
  };
  const removeDoc = async (idx: number) => {
    const toRemove = docs[idx];
    const arr = docs.slice();
    arr.splice(idx, 1);
    onUpdate({ ...item, documents: arr });
    if (toRemove?.path) {
      try { await deleteFileByPath(toRemove.path); } catch { /* noop */ }
    }
  };
  return (
    <Modal title="Factures" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <input id="upload-doc" type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addDoc(f); (e.currentTarget as HTMLInputElement).value = ""; }} />
          <label htmlFor="upload-doc" className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 text-sm">Ajouter une facture</label>
        </div>
        {progress !== null && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden ring-1 ring-sky-200 dark:ring-indigo-700">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-500" style={{ width: `${progress}%`, transition: 'width .2s ease' }} />
            </div>
            <span className="text-xs text-slate-600 dark:text-slate-300 w-12 text-right">{progress}%</span>
          </div>
        )}
        <ul className="space-y-2">
          {docs.length === 0 && <li className="text-sm text-slate-500 dark:text-slate-400">Aucune facture pour l’instant.</li>}
          {docs.map((d, idx) => (
            <li key={idx} className="flex items-center justify-between gap-3">
              <a href={d.url} target="_blank" rel="noreferrer" className="text-sm underline">{d.name}</a>
              <button onClick={() => removeDoc(idx)} className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">Supprimer</button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

function ReminderModal({ item, onUpdate, onClose }: { item: BaseItem; onUpdate: (updated: BaseItem) => void; onClose: () => void }) {
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const reminders = item.reminders ?? [];
  const add = () => {
    if (!when) return;
    const dt = parseDateTimeFlexible(when);
    if (!dt) return;
    const iso = dt.toISOString();
    const next: ReminderRef = { dateISO: iso, note: note || undefined };
    onUpdate({ ...item, reminders: [...reminders, next] });
    // Notifications locales (meilleur effort quand l’app est ouverte)
    const whenDate = new Date(when);
    ensureNotificationPermission().then((ok) => {
      if (!ok) return;
      const whenDate = dt;
      scheduleLocalNotification(whenDate, `Rappel: ${item.title}`, next.note);
      if (whenDate.getTime() <= Date.now() + 60000) {
        void showLocalNotification(`Rappel: ${item.title}`, next.note);
      }
    }).catch(() => { });
    // ne pas vider tout de suite: laisser visible au moins jusqu'au refresh de Firestore
    setTimeout(() => { setWhen(""); setNote(""); }, 150);
    // Persistance pour push (Cloud Functions)
    try {
      const at = dt.getTime();
      if (Number.isFinite(at) && (window as any)?.proofboxUserId) {
        const uid = (window as any).proofboxUserId as string;
        void addReminderDoc(uid, { atMs: at, itemId: item.id, itemTitle: item.title, note: next.note });
      }
    } catch { }
  };
  const remove = (idx: number) => {
    const arr = reminders.slice();
    arr.splice(idx, 1);
    onUpdate({ ...item, reminders: arr });
  };
  return (
    <Modal title="Rappels" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Date & heure</label>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
          </div>
        </div>
        <div className="flex items-center justify-end">
          <button onClick={add} className="px-3 py-2 rounded-xl text-white bg-gradient-to-r from-indigo-600 to-sky-600 text-sm">Ajouter</button>
        </div>
        <ul className="space-y-2">
          {reminders.length === 0 && <li className="text-sm text-slate-500 dark:text-slate-400">Aucun rappel enregistré.</li>}
          {reminders.map((r, idx) => (
            <li key={idx} className="flex items-center justify-between gap-3 text-sm">
              <span>{new Date(r.dateISO).toLocaleString()} {r.note ? `— ${r.note}` : ""}</span>
              <button onClick={() => remove(idx)} className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">Supprimer</button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
