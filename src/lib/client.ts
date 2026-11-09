"use client";
import { useEffect, useState } from "react";
import { toAttendee, useStore } from "./store";

/** True once the persisted store has loaded in the browser (avoids SSR hydration mismatches). */
export function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => setH(true), []);
  return h;
}

/** Current time, or the demo clock when one is set. Ticks every 15s. */
export function useNow() {
  const demoNow = useStore((s) => s.demoNow);
  const [real, setReal] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setReal(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  return demoNow ?? real;
}

export async function api<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

/** Push the local profile + plans to Elasticsearch so others can scan you and calendars can subscribe. */
export async function syncNow() {
  const s = useStore.getState();
  await fetch("/api/me", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toAttendee(s)) });
}

export const baseUrl = () => process.env.NEXT_PUBLIC_BASE_URL && !process.env.NEXT_PUBLIC_BASE_URL.includes("localhost") ? process.env.NEXT_PUBLIC_BASE_URL : typeof window !== "undefined" ? window.location.origin : "";
