import { Client } from "@elastic/elasticsearch";

const prefix = process.env.ES_INDEX_PREFIX ?? "kubecon";
export const INDEX = {
  sessions: `${prefix}-sessions`,
  attendees: `${prefix}-attendees`,
  connections: `${prefix}-connections`,
};

let client: Client | null = null;

/** Elasticsearch client. Local Docker by default; set ES_URL + ES_API_KEY for Elastic Cloud. */
export function es(): Client {
  if (!client) {
    const apiKey = process.env.ES_API_KEY;
    client = new Client({
      node: process.env.ES_URL ?? "http://localhost:9200",
      ...(apiKey ? { auth: { apiKey } } : {}),
      requestTimeout: 5000,
    });
  }
  return client;
}
