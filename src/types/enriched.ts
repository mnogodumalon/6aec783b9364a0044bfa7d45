import type { Feedbacks, Interaktionen, Teilnehmerkuerzel, Veranstaltungen } from './app';

export type EnrichedVeranstaltungen = Veranstaltungen & {
  aktive_interaktionName: string;
};

export type EnrichedInteraktionen = Interaktionen & {
  veranstaltungName: string;
};

export type EnrichedTeilnehmerkuerzel = Teilnehmerkuerzel & {
  veranstaltungName: string;
};

export type EnrichedFeedbacks = Feedbacks & {
  interaktionName: string;
  teilnehmerkuerzelName: string;
};
