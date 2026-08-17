import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function projectId() {
  const raw =
    process.env.NEXT_PUBLIC_FIREBASE_CONFIG ??
    process.env.FIREBASE_WEBAPP_CONFIG;

  if (raw) {
    const config = JSON.parse(raw) as { projectId?: string };
    if (config.projectId) return config.projectId;
  }

  return process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT;
}

const adminApp =
  getApps()[0] ??
  initializeApp({
    projectId: projectId(),
  });

export const adminAuth = getAuth(adminApp);
