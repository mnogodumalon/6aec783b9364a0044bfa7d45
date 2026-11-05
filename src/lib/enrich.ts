import type { EnrichedFeedbacks, EnrichedInteraktionen, EnrichedTeilnehmerkuerzel, EnrichedVeranstaltungen } from '@/types/enriched';
import type { Feedbacks, Interaktionen, Teilnehmerkuerzel, Veranstaltungen } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface VeranstaltungenMaps {
  interaktionenMap: Map<string, Interaktionen>;
}

export function enrichVeranstaltungen(
  veranstaltungen: Veranstaltungen[],
  maps: VeranstaltungenMaps
): EnrichedVeranstaltungen[] {
  return veranstaltungen.map(r => ({
    ...r,
    aktive_interaktionName: resolveDisplay(r.fields.aktive_interaktion, maps.interaktionenMap, 'titel'),
  }));
}

interface InteraktionenMaps {
  veranstaltungenMap: Map<string, Veranstaltungen>;
}

export function enrichInteraktionen(
  interaktionen: Interaktionen[],
  maps: InteraktionenMaps
): EnrichedInteraktionen[] {
  return interaktionen.map(r => ({
    ...r,
    veranstaltungName: resolveDisplay(r.fields.veranstaltung, maps.veranstaltungenMap, 'titel'),
  }));
}

interface TeilnehmerkuerzelMaps {
  veranstaltungenMap: Map<string, Veranstaltungen>;
}

export function enrichTeilnehmerkuerzel(
  teilnehmerkuerzel: Teilnehmerkuerzel[],
  maps: TeilnehmerkuerzelMaps
): EnrichedTeilnehmerkuerzel[] {
  return teilnehmerkuerzel.map(r => ({
    ...r,
    veranstaltungName: resolveDisplay(r.fields.veranstaltung, maps.veranstaltungenMap, 'titel'),
  }));
}

interface FeedbacksMaps {
  interaktionenMap: Map<string, Interaktionen>;
  teilnehmerkuerzelMap: Map<string, Teilnehmerkuerzel>;
}

export function enrichFeedbacks(
  feedbacks: Feedbacks[],
  maps: FeedbacksMaps
): EnrichedFeedbacks[] {
  return feedbacks.map(r => ({
    ...r,
    interaktionName: resolveDisplay(r.fields.interaktion, maps.interaktionenMap, 'titel'),
    teilnehmerkuerzelName: resolveDisplay(r.fields.teilnehmerkuerzel, maps.teilnehmerkuerzelMap, 'email'),
  }));
}
