/** Index mappings. Sessions get search_as_you_type fields for autocomplete and english analysis for MLT/relevance. */
export const sessionsMapping = {
  properties: {
    id: { type: "keyword" },
    kind: { type: "keyword" },
    activityType: { type: "keyword" },
    title: {
      type: "text",
      analyzer: "english",
      fields: { suggest: { type: "search_as_you_type" }, raw: { type: "keyword" } },
    },
    abstract: { type: "text", analyzer: "english" },
    keywords: { type: "text", analyzer: "english" },
    speakers: {
      properties: {
        name: { type: "text", fields: { keyword: { type: "keyword" }, suggest: { type: "search_as_you_type" } } },
        company: { type: "text", fields: { keyword: { type: "keyword" } } },
      },
    },
    topics: { type: "keyword" },
    level: { type: "keyword" },
    day: { type: "integer" },
    start: { type: "date" },
    end: { type: "date" },
    roomId: { type: "keyword" },
    zone: { type: "keyword" },
    capacity: { type: "integer" },
    seriesId: { type: "keyword" },
    encore: { type: "boolean" },
    status: { type: "keyword" },
  },
} as const;

/** Attendees: full profile lives in _source; only the fields we query are indexed. */
export const attendeesMapping = {
  dynamic: false,
  properties: {
    userId: { type: "keyword" },
    name: { type: "text" },
    shareToken: { type: "keyword" },
    contactToken: { type: "keyword" },
    scheduleIds: { type: "keyword" },
    interestTopics: { type: "keyword" },
    lunchTheme: { type: "keyword" },
    fake: { type: "boolean" },
  },
} as const;

export const connectionsMapping = {
  dynamic: false,
  properties: {
    owner: { type: "keyword" },
    other: { type: "keyword" },
    type: { type: "keyword" },
    at: { type: "date" },
  },
} as const;
