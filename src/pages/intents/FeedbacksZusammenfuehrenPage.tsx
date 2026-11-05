/**
 * Feedbacks zusammenführen — 3-Schritt-Wizard.
 * Steps: 1) Veranstaltung wählen → 2) Aktive Interaktion und ihre Feedbacks ansehen → 3) Zusammenführen auslösen (Prüfen).
 * Reads: veranstaltungen, interaktionen, feedbacks, teilnehmerkuerzel. Writes: interaktionen.zusammengefuehrter_text (update via flow hook).
 * Composes: IntentWizardShell, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useRef, useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldRef, refFilter, useLiveList } from '@/lib/journey';
import type { JourneyRecord } from '@/lib/journey';
import { useFeedbacksZusammenfuehrenFlow } from '@/lib/journey/flows/FeedbacksZusammenfuehren';
import { tx } from '@/i18n';

export default function FeedbacksZusammenfuehrenPage() {
  const [step, setStep] = useState(1);
  const [eventId, setEventId] = useState<string | null>(null);
  // the merged text is computed at submit time from the latest render's data
  const mergeRef = useRef<() => string>(() => '');

  const flow = useFeedbacksZusammenfuehrenFlow({
    steps: { interaktionen: 2 },
    items: {
      interaktionen: r => ({ id: r.id, title: fieldText(r, 'titel'), subtitle: fieldText(r, 'frage') }),
    },
    compute: { zusammengefuehrter_text: () => mergeRef.current() },
  });

  const events = useLiveList(flow.port, 'veranstaltungen', { intervalMs: 0 });
  const eventRecord = events.records.find(r => r.id === eventId);
  const activeId = eventRecord ? fieldRef(eventRecord, 'aktive_interaktion') : null;

  const interaktionId = flow.targets.interaktionen.selectedId;
  const interaktion: JourneyRecord | undefined = flow.targets.interaktionen.record;

  const feedbacks = useLiveList(flow.port, 'feedbacks', {
    intervalMs: 0,
    enabled: Boolean(interaktionId),
    list: { filter: interaktionId ? refFilter('interaktion', interaktionId) : undefined },
  });
  const kuerzel = useLiveList(flow.port, 'teilnehmerkuerzel', {
    intervalMs: 0,
    enabled: Boolean(eventId),
    list: { filter: eventId ? refFilter('veranstaltung', eventId) : undefined },
  });

  const kuerzelOf = (f: JourneyRecord): string => {
    const ref = fieldRef(f, 'teilnehmerkuerzel');
    const rec = ref ? kuerzel.records.find(k => k.id === ref) : undefined;
    return (rec ? fieldText(rec, 'kuerzel') : '') || fieldText(f, 'absendekennung');
  };
  const lines = feedbacks.records.map(f => `${kuerzelOf(f)}: ${fieldText(f, 'feedbacktext')}`);
  const merged = [interaktion ? fieldText(interaktion, 'vorprompt') : '', ...lines, interaktion ? fieldText(interaktion, 'endprompt') : '']
    .map(s => s.trim())
    .filter(Boolean)
    .join('\n\n');
  mergeRef.current = () => merged;

  const eventItems = events.records.map(r => ({ id: r.id, title: fieldText(r, 'titel'), subtitle: fieldText(r, 'ort') }));

  return (
    <IntentWizardShell
      title={tx('Feedbacks zusammenführen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{ description: tx('Alle Feedbacks der aktiven Interaktion werden zu einem Text verbunden.'), needs: [tx('Eine Veranstaltung mit aktiver Interaktion')] }}
    >
      <WizardStep label={tx('Veranstaltung')} description={tx('Für welche Veranstaltung sollen die Feedbacks zusammengeführt werden?')}>
        <EntitySelectStep
          items={eventItems}
          loading={events.loading && !events.loaded}
          error={events.error ? events.error.message : null}
          selectedId={eventId}
          searchPlaceholder={tx('Titel der Veranstaltung …')}
          avatar="none"
          onSelect={id => {
            setEventId(id);
            setStep(2);
          }}
        />
      </WizardStep>

      <WizardStep label={tx('Feedbacks')} description={tx('Prüfe die aktive Interaktion und die eingegangenen Feedbacks.')} needs={[]}>
        {!eventId ? (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Dieser Schritt braucht die Veranstaltung aus Schritt 1.')}
          </StepNav>
        ) : !activeId ? (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Für diese Veranstaltung ist keine Interaktion aktiv. Setze zuerst eine aktive Interaktion.')}
            <a className="ml-2 underline" href="#/intents/aktive-interaktion-setzen">{tx('Aktive Interaktion setzen')}</a>
          </StepNav>
        ) : (
          <div className="space-y-4">
            <EntitySelectStep
              key={`${eventId}:${activeId}`}
              {...flow.picks.interaktionen.select}
              items={flow.picks.interaktionen.select.items.filter(i => i.id === activeId)}
              {...flow.pick('interaktionen')}
              avatar="none"
            />
            {interaktionId && (
              <div className="space-y-2 overflow-hidden rounded-2xl border bg-card p-4">
                <p className="text-sm font-medium">
                  {feedbacks.loading && !feedbacks.loaded ? tx('Feedbacks werden geladen …') : tx`${lines.length} Feedbacks`}
                </p>
                {lines.length === 0 && feedbacks.loaded && (
                  <p className="text-sm text-muted-foreground">{tx('Noch keine Feedbacks eingegangen.')}</p>
                )}
                <ul className="space-y-2">
                  {feedbacks.records.map(f => (
                    <li key={f.id} className="min-w-0 rounded-xl bg-secondary p-3 text-sm">
                      <span className="font-semibold">{kuerzelOf(f)}</span>
                      <p className="whitespace-pre-wrap break-words text-muted-foreground">{fieldText(f, 'feedbacktext')}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <StepNav
              onBack={() => setStep(1)}
              onNext={() => flow.validateStep(2)}
              nextStepLabel={tx('Prüfen')}
              nextDisabled={!interaktionId || lines.length === 0}
            />
          </div>
        )}
      </WizardStep>

      <WizardStep label={tx('Zusammenführen')} description={tx('Prüfe den Text und löse das Zusammenführen aus.')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            confirmLabel={tx('Feedbacks zusammenführen')}
            items={[{ key: 'anzahl', label: tx('Feedbacks'), value: String(lines.length) }]}
            whatHappensNext={tx('Der Text wird in der Interaktion gespeichert und ersetzt einen früheren zusammengeführten Text.')}
          >
            <div className="max-h-72 overflow-auto rounded-xl bg-secondary p-3 text-sm">
              <p className="mb-1 font-medium">{tx('Vorschau')}</p>
              <p className="whitespace-pre-wrap break-words text-muted-foreground">{merged}</p>
            </div>
          </SummaryStep>
        )}
      </WizardStep>

      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          undo={flow.undo}
          next={[
            { label: tx('KI-Antwort einfügen'), href: '#/intents/ki-antwort-einfuegen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        >
          <div className="max-h-72 overflow-auto rounded-xl bg-secondary p-3 text-sm">
            <p className="mb-1 font-medium">{tx('Zusammengeführter Text')}</p>
            <p className="whitespace-pre-wrap break-words text-muted-foreground">
              {fieldText(flow.submit.result.primary, 'zusammengefuehrter_text') || merged}
            </p>
          </div>
        </SuccessStep>
      )}
    </IntentWizardShell>
  );
}
