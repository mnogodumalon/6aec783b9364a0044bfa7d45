// The orchestrator's plan, as far as the running app needs it
// (docs/orchestrator/SPEC.md). Generated — do not edit; regenerated on every
// build and update from the stored plan. Without a plan every map is empty.
//
//   SYSTEM_ASSIGNED entity → fields a tool fills when a record is CREATED — the
//                   value does not exist before; dialogs hide these on create and
//                   the form-polish sets no default on them. A scheduled or
//                   update-triggered tool owns its field but is NOT in here.
//   PLAN_SENTENCES  slug → the plan in the owner's words (flows' field page)
//
// The runtime write guard (FLOW_WRITES/OWNERSHIP, planGuard.ts) left on
// 23.09.2026: a flow page composes against its generated hook, whose submit
// plan IS the Schreibliste — there is no way to spell a write outside it.

import { INTENTS } from '@/config/intents';

export const SYSTEM_ASSIGNED: Record<string, string[]> = {
  "teilnehmerkuerzel": [
    "einwilligung",
    "email"
  ]
};

export const PLAN_SENTENCES: Record<string, string[]> = {
  "aktive-interaktion-setzen": [
    "Ändert: veranstaltungen"
  ],
  "feedbacks-zusammenfuehren": [
    "Ändert: interaktionen",
    "Automatisch: zusammengefuehrter_text (Vorprompt, dann jedes Feedback der Interaktion als eine Zeile mit dem Kürzel des Teilne …)"
  ],
  "ki-antwort-einfuegen": [
    "Ändert: interaktionen"
  ]
};

export const PLAN_SUMMARY = "Du moderierst Veranstaltungen und bereitest dazu Interaktionen vor, jede mit einer Frage an die Teilnehmenden, einem Vorprompt und einem Endprompt. Pro Veranstaltung ist genau eine Interaktion aktiv, die du mit einem Klick setzt. Teilnehmende scannen den QR-Code der Veranstaltung und sehen ohne Anmeldung nur das Feedback-Formular der aktiven Interaktion. Beim ersten Feedback bekommt jedes Handy still ein fünfstelliges Kürzel, das es sich merkt und nach jedem Absenden anzeigt; ein Feedback kommt nie doppelt an. Am Ende können Teilnehmende freiwillig ihre E-Mail-Adresse mit Einwilligung zum Kürzel hinterlegen. Mit einem Klick führst du alle Feedbacks der aktiven Interaktion in einen großen Text zusammen (Vorprompt, Feedbacks mit Kürzel, Endprompt), den du bildschirmfüllend bearbeitest und kopierst. Die Antwort des Chatbots fügst du bei der Interaktion wieder ein.";

/** entity → the plan's noun („Frage“ / „Fragen“). A review row or a plan step
 *  names ONE record, so it reads the singular (J-6, 03.11.2026: „Auswertungen:
 *  Sommerfest“ for one record); the app label is the list's plural. */
export const NOUNS: Record<string, { one: string; many: string }> = {
  "veranstaltungen": {
    "one": "Veranstaltung",
    "many": "Veranstaltungen"
  },
  "interaktionen": {
    "one": "Interaktion",
    "many": "Interaktionen"
  },
  "teilnehmerkuerzel": {
    "one": "Teilnehmerkürzel",
    "many": "Teilnehmerkürzel"
  },
  "feedbacks": {
    "one": "Feedback",
    "many": "Feedbacks"
  }
};

export function nounOne(entity: string, fallback: string): string {
  return NOUNS[entity]?.one || fallback;
}

/** „1 Beitrag“ / „3 Beiträge“ — a count with the right noun (S-13, acceptance 4:
 *  „1 Beiträge“). `many` is the list's label when the plan has no noun. */
export function countOf(entity: string, n: number, many: string): string {
  const noun = n === 1 ? (NOUNS[entity]?.one || many) : (NOUNS[entity]?.many || many);
  return `${n} ${noun}`;
}

/** slug → the lists a flow writes (the plan's Schreibliste). The nav leaves a
 *  flow out for a user who may not write one of them (lib/permissions.ts). */
export const FLOW_ENTITIES: Record<string, string[]> = {
  "aktive-interaktion-setzen": [
    "veranstaltungen"
  ],
  "feedbacks-zusammenfuehren": [
    "interaktionen"
  ],
  "ki-antwort-einfuegen": [
    "interaktionen"
  ]
};

/** A field an UPDATE flow writes, and the value it fixes (if it does). */
export interface FlowOwner { slug: string; value?: string }

/** entity → field → the update flows that change it. Such a change is the
 *  flow's job — it records who and when (a review, a decision) — so the
 *  dashboard never writes these fields itself; it opens the flow
 *  (check-dashboard gate 25). */
export const FLOW_OWNED: Record<string, Record<string, FlowOwner[]>> = {
  "veranstaltungen": {
    "aktive_interaktion": [
      {
        "slug": "aktive-interaktion-setzen"
      }
    ]
  },
  "interaktionen": {
    "zusammengefuehrter_text": [
      {
        "slug": "feedbacks-zusammenfuehren"
      }
    ],
    "ki_antwort": [
      {
        "slug": "ki-antwort-einfuegen"
      }
    ]
  }
};

/** The link that opens the flow owning `entity.field` with `recordId` already
 *  picked — `toValue` chooses between flows that fix different values (the
 *  approve flow vs the execute flow). null when no LIVE flow owns it (not
 *  built yet, or removed): the caller then offers no shortcut. */
export function flowLinkFor(entity: string, field: string, recordId: string, toValue?: string): string | null {
  const owners = (FLOW_OWNED[entity]?.[field] ?? []).filter(o => INTENTS.some(i => i.path === `/intents/${o.slug}`));
  const owner = (toValue !== undefined ? owners.find(o => o.value === toValue) : undefined)
    ?? owners.find(o => o.value === undefined)
    ?? owners[0];
  // a chosen record for a pick of the flow travels as `?<field>=<id>` — the hook preselects it (J-2)
  const pick = toValue !== undefined && owner && owner.value === undefined && FLOW_ONE_CLICK[entity]?.[field]?.['*'] ? `&${field}=${encodeURIComponent(toValue)}` : '';
  return owner ? `#/intents/${owner.slug}?record=${encodeURIComponent(recordId)}${pick}` : null;
}

/** entity → field → value → the flow that asks nothing but which record, and
 *  the values it writes (fixed, today/now). flowActionFor runs it in place.
 *  Key '*' with `pick`: the flow's one input is a chosen record the caller
 *  already knows — `flowActionFor(entity, field, id, <chosen id>)` writes it. */
export const FLOW_ONE_CLICK: Record<string, Record<string, Record<string, { slug: string; sets: Record<string, string | { rel: 'today' | 'now' }>; pick?: string }>>> = {
  "veranstaltungen": {
    "aktive_interaktion": {
      "*": {
        "slug": "aktive-interaktion-setzen",
        "sets": {},
        "pick": "aktive_interaktion"
      }
    }
  }
};

function oneClickValues(sets: Record<string, string | { rel: 'today' | 'now' }>): Record<string, unknown> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return Object.fromEntries(Object.entries(sets).map(([k, v]) =>
    [k, typeof v === 'string' ? v : v.rel === 'today' ? day : `${day}T${pad(now.getHours())}:${pad(now.getMinutes())}`]));
}

/** flowLinkFor as a click handler — `action: go ? { label, onClick: go } : undefined`.
 *  When the owning flow asks nothing but which record (FLOW_ONE_CLICK), the
 *  handler IS the change: it writes the flow's values through the flow's door
 *  and tells the page to re-read (one click, no wizard). Otherwise it opens the
 *  flow with the record picked. null when no live flow owns the change. */
export function flowActionFor(entity: string, field: string, recordId: string, toValue?: string): (() => void) | null {
  const live = (slug: string) => INTENTS.some(i => i.path === `/intents/${slug}`);
  const one = toValue !== undefined ? FLOW_ONE_CLICK[entity]?.[field]?.[toValue] ?? (toValue ? FLOW_ONE_CLICK[entity]?.[field]?.['*'] : undefined) : undefined;
  if (one && live(one.slug)) {
    const values = { ...oneClickValues(one.sets), ...(one.pick ? { [one.pick]: toValue } : {}) };
    return () => {
      void import('@/services/journeyPort')
        .then(({ servicePort }) => servicePort.update(entity as never, recordId, values as never))
        .then(() => window.dispatchEvent(new CustomEvent('assistant:data-changed')))
        .catch(err => {
          console.error(`[flowActionFor] ${entity}.${field} → ${toValue}: ${String(err)}`);
          window.location.hash = `/intents/${one.slug}?record=${encodeURIComponent(recordId)}`;
        });
    };
  }
  const href = flowLinkFor(entity, field, recordId, toValue);
  return href ? () => { window.location.hash = href.slice(1); } : null;
}
