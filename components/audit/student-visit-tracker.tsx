"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

const STORAGE_KEY = "cca_lms_last_visit_log";
const VISIT_THROTTLE_MS = 30 * 60 * 1000; // 30 minutes

export default function StudentVisitTracker() {
  const { data: session, status } = useSession();
  const isSubmitting = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    if (session.user.role !== "STUDENT") return;
    if (isSubmitting.current) return;

    const now = Date.now();
    const lastVisit =
      typeof window !== "undefined"
        ? parseInt(window.localStorage.getItem(STORAGE_KEY) || "0", 10)
        : 0;

    if (lastVisit && now - lastVisit < VISIT_THROTTLE_MS) {
      return;
    }

    isSubmitting.current = true;

    fetch("/api/audit/visit", {
      method: "POST",
      keepalive: true,
    })
      .then(() => {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, now.toString());
        }
      })
      .catch((error) => {
        console.error("Failed to log visit", error);
      })
      .finally(() => {
        isSubmitting.current = false;
      });
  }, [session, status]);

  return null;
}
