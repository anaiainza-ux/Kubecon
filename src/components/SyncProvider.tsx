"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { syncNow } from "@/lib/client";

/** Debounced background sync of profile + plans to the server (Elasticsearch attendees index). */
export function SyncProvider() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void syncNow().catch(() => {}), 800);
    };
    schedule();
    const unsub = useStore.subscribe((s, prev) => {
      if (s.profile !== prev.profile || s.plans !== prev.plans || s.blocks !== prev.blocks) schedule();
    });
    return () => { unsub(); clearTimeout(timer); };
  }, []);
  return null;
}
