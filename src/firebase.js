// Firebase laddas först när den behövs: Firestore för nyheterna, Auth och Storage bara för administratörer.
import { initializeApp } from "firebase/app";

const env = import.meta.env;
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
};
export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
const useEmulators = env.VITE_USE_EMULATORS === "true";

/** Storage-hinken för bilder och filmer som admins laddar upp. Tom = uppladdning är inte påslagen. */
export const storageBucket = isConfigured && firebaseConfig.storageBucket ? firebaseConfig.storageBucket : "";
// Besökare hämtar filerna direkt med en vanlig adress (storage.rules tillåter läsning), utan Storage-biblioteket.
export const storageBase = storageBucket
  ? `${useEmulators ? "http://127.0.0.1:9199" : "https://firebasestorage.googleapis.com"}/v0/b/${storageBucket}/o/`
  : null;

let app = null;
const getApp = () => (app ??= initializeApp(firebaseConfig));

let dbPromise = null;
// Firestore Lite (REST) räcker: nyheterna hämtas på nytt varje minut och direkt efter ändringar.
// Det håller JavaScript-mängden nere för besökare på mobil.
/** @returns {Promise<{db: import("firebase/firestore/lite").Firestore, fs: typeof import("firebase/firestore/lite")}>} */
export function getDb() {
  return (dbPromise ??= import("firebase/firestore/lite").then((fs) => {
    const db = fs.getFirestore(getApp());
    if (useEmulators) fs.connectFirestoreEmulator(db, "127.0.0.1", 8080);
    return { db, fs };
  }));
}

let authPromise = null;
/** @returns {Promise<{auth: import("firebase/auth").Auth, fa: typeof import("firebase/auth")}>} */
export function getAuthApi() {
  return (authPromise ??= import("firebase/auth").then((fa) => {
    const auth = fa.getAuth(getApp());
    auth.languageCode = "sv";
    if (useEmulators) fa.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    return { auth, fa };
  }));
}

let storagePromise = null;
// Bara för administratörer som laddar upp eller tar bort bilder och filmer.
/** @returns {Promise<{storage: import("firebase/storage").FirebaseStorage, st: typeof import("firebase/storage")}>} */
export function getStorageApi() {
  return (storagePromise ??= import("firebase/storage").then((st) => {
    const storage = st.getStorage(getApp());
    if (useEmulators) st.connectStorageEmulator(storage, "127.0.0.1", 9199);
    return { storage, st };
  }));
}
