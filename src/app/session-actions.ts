"use server";

import { touchSession } from "@/lib/auth/session";

/** Called by the inactivity warning ("Stay signed in") and, every few minutes, while the person is typing or clicking. */
export async function touchSessionAction(): Promise<boolean> {
  return touchSession();
}
