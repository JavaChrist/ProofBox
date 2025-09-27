import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { firebaseAuth } from "./firebase";
import { initMessagingForUser } from "./messaging";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u?.uid) {
        try { (window as any).proofboxUserId = u.uid; } catch { }
        try { await initMessagingForUser(u.uid); } catch { }
      } else {
        try { delete (window as any).proofboxUserId; } catch { }
      }
    });
    return () => unsub();
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    user,
    loading,
    async signIn(email, password) {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    },
    async signUp(email, password) {
      await createUserWithEmailAndPassword(firebaseAuth, email, password);
    },
    async resetPassword(email) {
      await sendPasswordResetEmail(firebaseAuth, email);
    },
    async signOut() {
      await fbSignOut(firebaseAuth);
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}


