import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig, prepareChallenge,
  type PublicPagesConfig, type PublicPageConfig,
} from '@/lib/publicClient';
import {
  useStepForm, useJourneySubmit, useLiveList, useVisitorKey, fieldText,
} from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { Bound } from '@/components/blocks/Bound';
import { Field } from '@/components/blocks/Field';
import { FieldErrorSummary } from '@/components/blocks/FieldErrorSummary';
import { LoadProblem } from '@/components/blocks/LoadProblem';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { tx } from '@/i18n';

export default function KuerzelEmail() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [declined, setDeclined] = useState(false);
  const [searchParams] = useSearchParams();
  const veranstaltungId = searchParams.get('veranstaltung');
  const kuerzel = useVisitorKey({ length: 5 });

  useEffect(() => {
    loadPublicPagesConfig('kuerzel-email').then(c => {
      setCfg(c);
      setPage(c?.pages['kuerzel-email'] ?? null);
      setLoading(false);
    });
  }, []);

  const port = useMemo(() => (cfg && page ? createPublicPort(cfg, page) : null), [cfg, page]);
  const live = useLiveList(port, 'veranstaltungen', { intervalMs: 0, enabled: !!port && !!veranstaltungId });

  const f = useStepForm('teilnehmerkuerzel', {
    fields: ['email', 'einwilligung'],
    required: { email: true, einwilligung: true },
    autoComplete: true,
  });
  const submit = useJourneySubmit(
    port ?? createFallbackPort(),
    [{
      key: 'kuerzel',
      entity: 'teilnehmerkuerzel',
      form: f,
      primary: true,
      values: () => ({ kuerzel: kuerzel, veranstaltung: veranstaltungId ?? '' }),
    }],
    { draftKey: `kuerzel-email-${veranstaltungId ?? 'x'}` },
  );

  if (loading || !cfg || !page || !port) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }

  const record = live.records.find(r => r.id === veranstaltungId);

  let body: React.ReactNode;
  if (!veranstaltungId) {
    body = (
      <p className="text-sm text-muted-foreground">
        {tx('Dieser Link ist unvollständig. Scanne bitte den QR-Code der Veranstaltung noch einmal.')}
      </p>
    );
  } else if (!live.loaded && live.error) {
    body = <LoadProblem onRetry={live.reload} />;
  } else if (!live.loaded) {
    body = <PublicShell loading />;
  } else if (!record) {
    body = (
      <p className="text-sm text-muted-foreground">
        {tx('Dieser Link passt zu keiner Veranstaltung. Scanne bitte den QR-Code noch einmal.')}
      </p>
    );
  } else if (declined) {
    body = (
      <p className="text-sm">
        {tx('Alles klar — wir speichern keine E-Mail-Adresse. Danke fürs Mitmachen!')}
      </p>
    );
  } else if (submit.result) {
    body = (
      <div className="space-y-2">
        <p className="font-medium">{tx('Danke! Deine E-Mail-Adresse ist zu deinem Kürzel gespeichert.')}</p>
        <p className="text-sm text-muted-foreground">
          {tx('Dein Kürzel auf diesem Handy:')} <span className="font-mono font-semibold tracking-widest">{kuerzel}</span>
        </p>
      </div>
    );
  } else {
    body = (
      <form
        className="space-y-5"
        onSubmit={e => {
          e.preventDefault();
          if (f.validate()) void submit.run();
        }}
        onFocus={() => prepareChallenge(cfg, page, 'POST', `/apps/${page.endpoints?.find(ep => ep.op === 'create')?.app_id}/records`)}
      >
        <p className="text-sm text-muted-foreground">
          {tx('Du hast bei')} <b>{fieldText(record, 'titel')}</b> {tx('mitgemacht. Wenn du magst, speichern wir deine E-Mail-Adresse zu deinem Kürzel — freiwillig.')}
        </p>
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          {tx('Dein Kürzel auf diesem Handy:')} <span className="font-mono font-semibold tracking-widest">{kuerzel}</span>
        </div>
        <Bound form={f} name="email" />
        <Field form={f} name="einwilligung" hideLabel>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox {...f.checkbox('einwilligung')} />
            <span>{tx('Ich willige in die Speicherung meiner E-Mail-Adresse zu meinem Kürzel ein.')}</span>
          </label>
        </Field>
        <FieldErrorSummary forms={[f]} />
        {submit.offline && (
          <p className="text-sm text-muted-foreground">{tx('Keine Verbindung — deine Eingaben sind gesichert.')}</p>
        )}
        {submit.error && !submit.offline && (
          <p className="text-sm text-destructive">{tx('Das Speichern hat nicht geklappt. Bitte versuche es noch einmal.')}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={submit.submitting}>{tx('E-Mail speichern')}</Button>
          <Button type="button" variant="ghost" onClick={() => setDeclined(true)}>{tx('Nein, danke')}</Button>
        </div>
      </form>
    );
  }

  return (
    <PublicShell title={page.title} description={page.description}>
      {body}
    </PublicShell>
  );
}

// Hooks must run before the config has loaded; the plan is only run once a real port exists.
function createFallbackPort() {
  const fail = () => Promise.reject(new Error(tx('not ready')));
  return {
    door: 'public' as const,
    list: fail, count: fail, get: fail, create: fail,
    ref: (_appId: string, id: string) => id,
  };
}
