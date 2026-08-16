import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const adminApp = getApps()[0] ?? initializeApp();

export const adminAuth = getAuth(adminApp);
