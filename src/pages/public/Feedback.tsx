import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PublicShell } from '@/components/PublicShell';
import { Button } from '@/components/ui/button';
import { Bound } from '@/components/blocks/Bound';
import { FieldErrorSummary } from '@/components/blocks/FieldErrorSummary';
import { LoadProblem } from '@/components/blocks/LoadProblem';
import {
  loadPublicPagesConfig,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  useStepForm,
  useJourneySubmit,
  useLiveList,
  fieldText,
  fieldRef,
  useVisitorKey,
  rememberOwnRecord,
  ownRecordIds,
  type JourneyPort,
  type PlanStep,
} from '@/lib/journey';
import { tx } from '@/i18n';

const SLUG = 'feedback';

export default function Feedback() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPublicPagesConfig(SLUG)
      .then(c => {
        setCfg(c);
        setPage(c?.pages[SLUG] ?? null);
      })
      .catch(() => {
        setCfg(null);
        setPage(null);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }
  return <FeedbackBody cfg={cfg} page={page} />;
}

function FeedbackBody({ cfg, page }: { cfg: PublicPagesConfig; page: PublicPageConfig }) {
  const port = useMemo(() => createPublicPort(cfg, page), [cfg, page]);
  const [params] = useSearchParams();
  const veranstaltungId = params.get('veranstaltung');

  if (!veranstaltungId) {
    return (
      <PublicShell title={page.title} description={page.description}>
        <p className="text-sm text-muted-foreground">
          {tx('Dieser Link ist unvollständig. Scanne bitte den QR-Code der Veranstaltung.')}
        </p>
      </PublicShell>
    );
  }
  return <FeedbackForm port={port} page={page} veranstaltungId={veranstaltungId} />;
}

function FeedbackForm({
  port,
  page,
  veranstaltungId,
}: {
  port: JourneyPort;
  page: PublicPageConfig;
  veranstaltungId: string;
}) {
  const events = useLiveList(port, 'veranstaltungen', { intervalMs: 15000 });
  const questions = useLiveList(port, 'interaktionen', { intervalMs: 15000 });
  const kuerzel = useVisitorKey({ length: 5 });

  const form = useStepForm('feedbacks', { fields: ['feedbacktext'], autoComplete: true });

  const event = events.records.find(r => r.id === veranstaltungId) ?? null;
  const activeId = event ? fieldRef(event, 'aktive_interaktion') : null;
  const active = activeId ? questions.records.find(r => r.id === activeId) ?? null : null;

  const ownEntity = `teilnehmerkuerzel-${veranstaltungId}`;

  const known = ownRecordIds(ownEntity)[0] ?? null;
  const plan: PlanStep[] = [
    ...(known
      ? []
      : [
          {
            key: 'kuerzel',
            entity: 'teilnehmerkuerzel' as const,
            values: () => ({ kuerzel: kuerzel, veranstaltung: veranstaltungId }),
          },
        ]),
    {
      key: 'feedback',
      entity: 'feedbacks',
      form,
      primary: true,
      ...(known ? {} : { needs: ['kuerzel'], link: { teilnehmerkuerzel: 'kuerzel' } }),
      ...(known ? { values: () => ({ teilnehmerkuerzel: known }) } : {}),
    },
  ];
  const submit = useJourneySubmit(port, plan, {
    draftKey: `feedback-${veranstaltungId}`,
    onSuccess: result => {
      const own = result.records.kuerzel;
      if (own) rememberOwnRecord(ownEntity, own.id);
    },
  });

  const again = () => {
    submit.reset();
    form.reset();
  };

  const send = () => {
    if (!active || !form.validate()) return;
    void submit.run();
  };

  let body;
  if (!events.loaded && events.error) {
    body = <LoadProblem onRetry={events.reload} />;
  } else if (!events.loaded || !questions.loaded) {
    body = <p className="text-sm text-muted-foreground">{tx('Wird geladen …')}</p>;
  } else if (!event) {
    body = (
      <p className="text-sm text-muted-foreground">
        {tx('Dieser Link passt zu keiner Veranstaltung. Scanne bitte den QR-Code noch einmal.')}
      </p>
    );
  } else if (submit.result) {
    body = (
      <div className="space-y-5 text-center">
        <p className="text-lg font-semibold">{tx('Danke für dein Feedback!')}</p>
        <div className="rounded-2xl border bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">{tx('Dein Kürzel für heute Abend')}</p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-widest">{kuerzel}</p>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link to={`/public/kuerzel-email?veranstaltung=${encodeURIComponent(veranstaltungId)}`}>
            {tx('E-Mail zu deinem Kürzel hinterlegen')}
          </Link>
        </Button>
        <Button className="w-full" onClick={again}>
          {tx('Weiteres Feedback abgeben')}
        </Button>
      </div>
    );
  } else if (!active) {
    body = (
      <p className="text-sm text-muted-foreground">
        {tx('Gerade ist keine Frage geöffnet. Schau gleich noch einmal vorbei.')}
      </p>
    );
  } else {
    body = (
      <form
        className="space-y-5"
        onSubmit={e => {
          e.preventDefault();
          send();
        }}
      >
        <div className="rounded-2xl bg-muted/40 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {fieldText(active, 'titel')}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-base font-medium">{fieldText(active, 'frage')}</p>
        </div>
        <Bound form={form} name="feedbacktext" rows={5} />
        <FieldErrorSummary forms={[form]} />
        {submit.error && !submit.offline && (
          <p className="text-sm text-destructive">
            {tx('Das hat nicht geklappt. Bitte versuche es noch einmal.')}
          </p>
        )}
        {submit.offline && (
          <p className="text-sm text-muted-foreground">
            {tx('Keine Verbindung — deine Eingaben sind gesichert.')}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={submit.submitting}>
          {submit.submitting ? tx('Wird gesendet …') : tx('Absenden')}
        </Button>
      </form>
    );
  }

  return (
    <PublicShell title={page.title} description={page.description}>
      {body}
    </PublicShell>
  );
}
