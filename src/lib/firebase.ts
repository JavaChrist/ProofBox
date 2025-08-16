import { initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseDb = getFirestore(firebaseApp);

// Assure un bucket valide même si la variable d'env n'est pas au format attendu
function resolveBucketUrl(): string | undefined {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
  const bucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined;
  if (!projectId) return undefined;
  // Utilise gs://{projectId}.appspot.com par défaut
  const defaultGs = `gs://${projectId}.appspot.com`;
  if (!bucket) return defaultGs;
  if (bucket.startsWith('gs://')) return bucket;
  if (bucket.endsWith('.appspot.com')) return `gs://${bucket}`;
  if (bucket.endsWith('.firebasestorage.app')) return `gs://${bucket}`;
  // Fallback
  return defaultGs;
}

export const firebaseStorage = getStorage(firebaseApp, resolveBucketUrl());

// Connexion éventuelle aux émulateurs en dev
if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
  try { connectAuthEmulator(firebaseAuth, "http://127.0.0.1:9099", { disableWarnings: true } as any); } catch { }
  try { connectStorageEmulator(firebaseStorage as any, "127.0.0.1", 9199); } catch { }
}


