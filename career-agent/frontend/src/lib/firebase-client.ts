import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";

function localConfig(): FirebaseOptions | undefined {
  const raw = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (!raw) return undefined;

  try {
    return JSON.parse(raw) as FirebaseOptions;
  } catch {
    throw new Error("NEXT_PUBLIC_FIREBASE_CONFIG must be valid JSON.");
  }
}

function createApp() {
  const config = localConfig();
  if (config) return initializeApp(config);

  // App Hosting supplies FIREBASE_WEBAPP_CONFIG during its build.
  return initializeApp();
}

const app = getApps().length ? getApp() : createApp();

export const auth = getAuth(app);
