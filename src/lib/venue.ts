import { roomById, venue, zoneById } from "./data";

export const OFFSITE = "offsite";
export const ENTRANCE = "entrance";
/** A personal block you can attend from wherever you are (e.g. a video call). */
export const ANYWHERE = "anywhere";

const zoneOf = (roomId: string) => (roomId === ENTRANCE ? venue.entrance : roomById.get(roomId)?.zone);
const floorOf = (roomId: string) => roomById.get(roomId)?.floor ?? 1;

/** Walking minutes between two rooms: zone matrix + floor changes + buffer. Offsite blocks get a flat travel time. */
export function travelMinutes(from: string, to: string): number {
  if (from === to || from === ANYWHERE || to === ANYWHERE) return 0;
  if (from === OFFSITE || to === OFFSITE) return venue.offsiteMinutes;
  const za = zoneOf(from);
  const zb = zoneOf(to);
  if (!za || !zb) return venue.offsiteMinutes;
  const walk = (venue.walk as Record<string, Record<string, number>>)[za][zb];
  return walk + venue.floorChangeMinutes * Math.abs(floorOf(from) - floorOf(to)) + venue.bufferMinutes;
}

export function roomLabel(roomId: string): string {
  if (roomId === OFFSITE) return "Outside the venue";
  const r = roomById.get(roomId);
  if (!r) return roomId;
  return `${r.name} · ${zoneById.get(r.zone)?.label}, Level ${r.floor}`;
}

/** Zone-level route (BFS over walkable paths), used for directions and the map. */
export function zoneRoute(fromZone: string, toZone: string): string[] {
  if (fromZone === toZone) return [fromZone];
  const adj = new Map<string, string[]>();
  for (const p of venue.paths) {
    adj.set(p.a, [...(adj.get(p.a) ?? []), p.b]);
    adj.set(p.b, [...(adj.get(p.b) ?? []), p.a]);
  }
  const prev = new Map<string, string>([[fromZone, ""]]);
  const queue = [fromZone];
  while (queue.length) {
    const z = queue.shift()!;
    if (z === toZone) break;
    for (const n of adj.get(z) ?? []) if (!prev.has(n)) { prev.set(n, z); queue.push(n); }
  }
  const route = [toZone];
  while (route[0] !== fromZone) {
    const p = prev.get(route[0]);
    if (!p) return [fromZone, toZone];
    route.unshift(p);
  }
  return route;
}

export type Directions = { minutes: number; steps: string[]; zones: string[] };

export function directions(fromRoom: string, toRoom: string): Directions {
  const to = roomById.get(toRoom);
  if (!to) return { minutes: 0, steps: [], zones: [] };
  const fromZone = fromRoom === OFFSITE || fromRoom === ENTRANCE ? venue.entrance : roomById.get(fromRoom)?.zone ?? venue.entrance;
  const zones = zoneRoute(fromZone, to.zone);
  const steps: string[] = [];
  if (fromRoom === OFFSITE) steps.push("Enter through the main lobby doors");
  for (let i = 0; i < zones.length - 1; i++) {
    const a = zones[i], b = zones[i + 1];
    const p = venue.paths.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    const reversed = p && p.a !== a;
    steps.push(p ? (reversed ? `Head back towards the ${zoneById.get(b)?.label}` : p.text) : `Walk to the ${zoneById.get(b)?.label}`);
  }
  const fromFloor = roomById.get(fromRoom)?.floor ?? 1;
  if (to.floor !== fromFloor) steps.push(`Take the escalator ${to.floor > fromFloor ? "up" : "down"} to Level ${to.floor}`);
  steps.push(`${to.name} is signposted on Level ${to.floor}`);
  return { minutes: travelMinutes(fromRoom, toRoom), steps, zones };
}
