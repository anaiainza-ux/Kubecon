export type SessionKind = "talk" | "workshop" | "keynote" | "activity";

export type Speaker = { name: string; company: string };

export type Session = {
  id: string;
  kind: SessionKind;
  activityType?: string;
  title: string;
  abstract: string;
  keywords: string;
  speakers: Speaker[];
  topics: string[];
  level: string;
  day: number;
  start: string; // ISO with conference UTC offset
  end: string;
  roomId: string;
  seriesId: string;
  encore?: boolean;
  /** Official track name and schedule link (real data). */
  track?: string;
  link?: string;
};

/** A personal non-negotiable imported from the user's calendar. Never moved by the scheduler. */
export type Block = { id: string; title: string; start: string; end: string; day: number; /** true = physically away from the venue (adds travel time); false = a call you can take anywhere. */ offsite: boolean };

/** Interest weight per topic id: 1 = interested, 2 = very interested. */
export type Interests = Record<string, number>;

export type DayPlan = {
  sessionIds: string[];
  /** Favorites pre-placed as tentative anchors (dashed until accepted). */
  anchorIds: string[];
  /** Builder cursor (epoch ms): the next free window starts at or after this. */
  cursor: number | null;
  done: boolean;
};

export type Profile = {
  userId: string;
  name: string;
  linkedin: string;
  role: string;
  company: string;
  interests: Interests;
  favoriteSessionIds: string[];
  favoriteSpeakers: string[];
  lunchOptIn: boolean;
  lunchTheme: string | null;
  shareScope: "day" | "event";
  shareFields: { name: boolean; linkedin: boolean; role: boolean; company: boolean };
  shareToken: string;
  contactToken: string;
};

export type Attendee = Profile & { blocks: Block[]; plans: Record<number, DayPlan> };

export type Connection = {
  owner: string;
  other: string;
  type: "schedule" | "contact";
  at: string;
  contextSessionId: string | null;
  contextLabel: string;
  card: { userId: string; name: string; linkedin: string; role: string; company: string };
};
