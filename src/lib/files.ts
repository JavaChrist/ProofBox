import { firebaseAuth, firebaseStorage } from "./firebase";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";

export interface UploadedFileInfo {
  name: string;
  url: string;
  path: string;
}

export function uploadInvoiceFile(itemId: string, file: File, onProgress?: (pct: number) => void): Promise<UploadedFileInfo> {
  return new Promise((resolve, reject) => {
    const uid = firebaseAuth.currentUser?.uid || "public";
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `users/${uid}/invoices/${itemId}/${Date.now()}-${safeName}`;
    const storageRef = ref(firebaseStorage, path);
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type || undefined });
    task.on("state_changed",
      (snap) => {
        if (onProgress) {
          const pct = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
          onProgress(pct);
        }
      },
      (err) => reject(err),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve({ name: file.name, url, path });
      }
    );
  });
}

export async function deleteFileByPath(path: string): Promise<void> {
  const storageRef = ref(firebaseStorage, path);
  await deleteObject(storageRef);
}


