"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { Attendee, Block, DayPlan, Profile } from "./types";
import { conference, sessions } from "./data";
import { fits, sessionSlot, blockSlot } from "./scheduler/feasibility";
import { ms } from "./time";

const emptyPlan = (): DayPlan => ({ sessionIds: [], anchorIds: [], cursor: null, done: false });

const newProfile = (): Profile => ({
  userId: `u-${nanoid(10)}`,
  name: "",
  linkedin: "",
  role: "",
  company: "",
  interests: {},
  favoriteSessionIds: [],
  favoriteSpeakers: [],
  lunchOptIn: true,
  lunchTheme: null,
  shareScope: "day",
  shareFields: { name: true, linkedin: true, role: true, company: true },
  shareToken: `s-${nanoid(12)}`,
  contactToken: `c-${nanoid(12)}`,
});

type State = {
  profile: Profile;
  blocks: Block[];
  plans: Record<number, DayPlan>;
  onboarded: boolean;
  /** Demo clock: a fixed "now" (epoch ms) for live mode, or null for the real time. */
  demoNow: number | null;

  updateProfile: (p: Partial<Profile>) => void;
  setInterest: (topic: string, weight: number) => void;
  toggleFavoriteSession: (id: string) => void;
  toggleFavoriteSpeaker: (name: string) => void;
  setBlocks: (blocks: Block[]) => void;
  removeBlock: (id: string) => void;
  setOnboarded: (v: boolean) => void;
  /** Start a day: pre-place favorite talks and followed speakers as tentative anchors. */
  initDay: (day: number) => void;
  /** Apply plans returned by the scheduler (all days, since encores can move talks across days). */
  applyPlans: (plans: Record<number, string[]>, cursor?: { day: number; at: number }) => void;
  removeSession: (day: number, id: string) => void;
  acceptAnchor: (day: number, id: string) => void;
  setCursor: (day: number, at: number | null) => void;
  setDone: (day: number, done: boolean) => void;
  resetDay: (day: number) => void;
  setDemoNow: (t: number | null) => void;
  resetAll: () => void;
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      profile: newProfile(),
      blocks: [],
      plans: {},
      onboarded: false,
      demoNow: null,

      updateProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
      setInterest: (topic, weight) =>
        set((s) => {
          const interests = { ...s.profile.interests };
          if (weight > 0) interests[topic] = weight;
          else delete interests[topic];
          return { profile: { ...s.profile, interests } };
        }),
      toggleFavoriteSession: (id) =>
        set((s) => {
          const f = s.profile.favoriteSessionIds;
          return { profile: { ...s.profile, favoriteSessionIds: f.includes(id) ? f.filter((x) => x !== id) : [...f, id] } };
        }),
      toggleFavoriteSpeaker: (name) =>
        set((s) => {
          const f = s.profile.favoriteSpeakers;
          return { profile: { ...s.profile, favoriteSpeakers: f.includes(name) ? f.filter((x) => x !== name) : [...f, name] } };
        }),
      setBlocks: (blocks) => set({ blocks }),
      removeBlock: (id) => set((s) => ({ blocks: s.blocks.filter((b) => b.id !== id) })),
      setOnboarded: (v) => set({ onboarded: v }),

      initDay: (day) => {
        const { plans, profile, blocks } = get();
        if (plans[day]) return;
        const favs = sessions
          .filter((s) => s.day === day && s.kind !== "activity")
          .filter((s) => profile.favoriteSessionIds.includes(s.id) || s.speakers.some((p) => profile.favoriteSpeakers.includes(p.name)))
          .sort((a, b) => Number(profile.favoriteSessionIds.includes(b.id)) - Number(profile.favoriteSessionIds.includes(a.id)) || ms(a.start) - ms(b.start));
        const slots = blocks.filter((b) => b.day === day).map(blockSlot);
        const anchors: string[] = [];
        for (const s of favs) {
          const slot = sessionSlot(s);
          if (fits(slots, slot)) { slots.push(slot); anchors.push(s.id); }
        }
        set({ plans: { ...plans, [day]: { ...emptyPlan(), sessionIds: anchors, anchorIds: anchors } } });
      },

      applyPlans: (next, cursor) =>
        set((s) => {
          const plans = { ...s.plans };
          for (const [d, ids] of Object.entries(next)) {
            const day = Number(d);
            const prev = plans[day] ?? emptyPlan();
            plans[day] = { ...prev, sessionIds: ids, anchorIds: prev.anchorIds.filter((a) => ids.includes(a)) };
          }
          if (cursor) plans[cursor.day] = { ...plans[cursor.day], cursor: cursor.at };
          return { plans };
        }),
      removeSession: (day, id) =>
        set((s) => {
          const p = s.plans[day] ?? emptyPlan();
          return { plans: { ...s.plans, [day]: { ...p, sessionIds: p.sessionIds.filter((x) => x !== id), anchorIds: p.anchorIds.filter((x) => x !== id), done: false } } };
        }),
      acceptAnchor: (day, id) =>
        set((s) => {
          const p = s.plans[day];
          return { plans: { ...s.plans, [day]: { ...p, anchorIds: p.anchorIds.filter((x) => x !== id) } } };
        }),
      setCursor: (day, at) => set((s) => ({ plans: { ...s.plans, [day]: { ...(s.plans[day] ?? emptyPlan()), cursor: at } } })),
      setDone: (day, done) => set((s) => ({ plans: { ...s.plans, [day]: { ...(s.plans[day] ?? emptyPlan()), done } } })),
      resetDay: (day) =>
        set((s) => {
          const plans = { ...s.plans };
          delete plans[day];
          return { plans };
        }),
      setDemoNow: (t) => set({ demoNow: t }),
      resetAll: () => set({ profile: newProfile(), blocks: [], plans: {}, onboarded: false, demoNow: null }),
    }),
    {
      name: "kubecon-planner",
      // v2 = real KubeCon schedule: drop any saved session ids that no longer exist.
      version: 2,
      migrate: (persisted) => {
        const s = persisted as State;
        const known = (ids: string[]) => ids.filter((id) => sessions.some((x) => x.id === id));
        const plans = Object.fromEntries(
          Object.entries(s.plans ?? {}).map(([d, p]) => [d, { ...p, sessionIds: known(p.sessionIds), anchorIds: known(p.anchorIds), done: false }]),
        );
        return { ...s, plans, profile: { ...s.profile, favoriteSessionIds: known(s.profile?.favoriteSessionIds ?? []) } };
      },
    },
  ),
);

export const toAttendee = (s: Pick<State, "profile" | "blocks" | "plans">): Attendee => ({ ...s.profile, blocks: s.blocks, plans: s.plans });

/** Plans as plain {day: ids} for the scheduler API. */
export const planIds = (plans: Record<number, DayPlan>): Record<number, string[]> =>
  Object.fromEntries(conference.days.map((d) => [d.day, plans[d.day]?.sessionIds ?? []]));
