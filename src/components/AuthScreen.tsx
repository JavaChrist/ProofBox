import { useState } from "react";
import { useAuth } from "../lib/auth";
import { ShieldCheck, Mail, Lock, Eye, EyeOff } from "lucide-react";

export default function AuthScreen() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null); setLoading(true);
    try {
      if (mode === "signin") await signIn(email, password);
      if (mode === "signup") await signUp(email, password);
      if (mode === "reset") { await resetPassword(email); setInfo("Email de réinitialisation envoyé."); }
    } catch (err: any) {
      setError(err?.message || "Erreur d’authentification");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 text-slate-900 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src="/icon-512.png" alt="ProofBox" className="w-12 h-12" />
          <h1 className="text-lg font-semibold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-300">ProofBox — Accès sécurisé</h1>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4">
        <div className="min-h-[calc(100vh-72px)] grid place-items-center">
          <div className="p-[1px] rounded-2xl bg-gradient-to-r from-indigo-600/60 to-sky-600/60 shadow-lg shadow-slate-900/20">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 ring-1 ring-slate-200/70 dark:ring-slate-700/70">
              <div className="flex items-center justify-between mb-4">
                <div className="text-base font-semibold">
                  {mode === "signin" ? "Connexion" : mode === "signup" ? "Créer un compte" : "Réinitialiser le mot de passe"}
                </div>
                <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                  <button onClick={() => setMode("signin")} className={`px-3 py-1.5 transition ${mode === "signin" ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100" : "bg-white text-slate-600 hover:text-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-200"}`}>Connexion</button>
                  <button onClick={() => setMode("signup")} className={`px-3 py-1.5 transition ${mode === "signup" ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100" : "bg-white text-slate-600 hover:text-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-200"}`}>Créer</button>
                  <button onClick={() => setMode("reset")} className={`px-3 py-1.5 transition ${mode === "reset" ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100" : "bg-white text-slate-600 hover:text-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-200"}`}>Reset</button>
                </div>
              </div>
              {mode !== 'signin' && (
                <p className="text-xs mb-3 text-slate-600 dark:text-slate-300">
                  {mode === 'signup' ? "Crée ton compte avec un email valide et un mot de passe sécurisé." : "Entre ton email, tu recevras un lien pour réinitialiser ton mot de passe."}
                </p>
              )}
              <form onSubmit={handle} className="space-y-4">
                <div className="relative">
                  <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">Email</label>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <Mail className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <input placeholder="ton@email.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input w-full bg-transparent outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400" required />
                  </div>
                </div>
                {mode !== "reset" && (
                  <div className="relative">
                    <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">Mot de passe</label>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                      <Lock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      <input placeholder="Au moins 8 caractères" type={showPwd ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="auth-input w-full bg-transparent outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400" required />
                      <button type="button" onClick={() => setShowPwd(s => !s)} className="ml-auto inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200" aria-label={showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
                        {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
                {error && <div className="text-sm text-rose-600">{error}</div>}
                {info && <div className="text-sm text-emerald-600">{info}</div>}
                <button disabled={loading} className="w-full px-3 py-2 rounded-xl text-white bg-gradient-to-r from-indigo-600 to-sky-600 shadow-sm">
                  {loading ? "..." : mode === "signin" ? "Se connecter" : mode === "signup" ? "Créer" : "Envoyer le lien"}
                </button>
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center">En continuant, tu acceptes les conditions d’utilisation.</p>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}


