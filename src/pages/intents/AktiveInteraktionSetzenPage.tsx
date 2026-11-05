/**
 * Aktive Interaktion setzen — 3-Schritt-Wizard.
 * Steps: 1) Veranstaltung wählen → 2) Eine Interaktion dieser Veranstaltung wählen → 3) Prüfen & als aktiv setzen.
 * Reads: veranstaltungen, interaktionen. Writes: veranstaltungen.aktive_interaktion (update, via useAktiveInteraktionSetzenFlow).
 * Composes: IntentWizardShell, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldNumber, fieldDate, fieldRef, formatFieldValue } from '@/lib/journey';
import { useAktiveInteraktionSetzenFlow } from '@/lib/journey/flows/AktiveInteraktionSetzen';
import { tx } from '@/i18n';

export default function AktiveInteraktionSetzenPage() {
  const [step, setStep] = useState(1);
  const [eventId, setEventId] = useState<string | null>(null);

  const flow = useAktiveInteraktionSetzenFlow({
    steps: { veranstaltungen: 1, aktive_interaktion: 2 },
    items: {
      veranstaltungen: r => {
        const datum = fieldDate(r, 'datum');
        return {
          id: r.id,
          title: fieldText(r, 'titel'),
          subtitle: datum ? formatFieldValue('veranstaltungen', 'datum', datum) : undefined,
        };
      },
      aktive_interaktion: r => {
        const nr = fieldNumber(r, 'reihenfolge');
        return {
          id: r.id,
          title: nr != null ? `${nr}. ${fieldText(r, 'titel')}` : fieldText(r, 'titel'),
          subtitle: fieldText(r, 'frage'),
        };
      },
    },
    where: {
      aktive_interaktion: r => eventId !== null && fieldRef(r, 'veranstaltung') === eventId,
    },
  });

  const veranstaltungen = flow.pick('veranstaltungen');

  return (
    <IntentWizardShell
      title={tx('Aktive Interaktion setzen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Eine Interaktion deiner Veranstaltung für die Teilnehmenden freischalten.'),
        needs: [tx('Die Veranstaltung'), tx('Die Interaktion, die jetzt laufen soll')],
      }}
    >
      <WizardStep label={tx('Veranstaltung')} description={tx('Für welche Veranstaltung willst du die aktive Interaktion ändern?')}>
        <EntitySelectStep
          {...flow.picks.veranstaltungen.select}
          {...veranstaltungen}
          onSelect={id => {
            setEventId(id);
            veranstaltungen.onSelect(id);
          }}
          searchPlaceholder={tx('Veranstaltung suchen …')}
          avatar="none"
        />
      </WizardStep>
      <WizardStep label={tx('Interaktion')} description={tx('Welche Interaktion soll jetzt aktiv sein? Pro Veranstaltung ist immer genau eine aktiv.')}>
        {eventId ? (
          <EntitySelectStep
            {...flow.picks.aktive_interaktion.select}
            {...flow.pick('aktive_interaktion')}
            searchPlaceholder={tx('Interaktion suchen …')}
            emptyText={tx('Diese Veranstaltung hat noch keine Interaktion.')}
            avatar="none"
          />
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
          </StepNav>
        )}
      </WizardStep>
      <WizardStep label={tx('Prüfen')} description={tx('Kontrolliere die Auswahl und setze die Interaktion aktiv.')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            confirmLabel={tx('Als aktiv setzen')}
            whatHappensNext={tx('Die Interaktion wird sofort für die Teilnehmenden aktiv. Die bisher aktive wird abgelöst.')}
          />
        )}
      </WizardStep>
      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          undo={flow.undo}
          title={tx('Interaktion ist aktiv')}
          whatHappensNext={tx('Wenn die Teilnehmenden Feedback abgegeben haben, kannst du es zusammenführen.')}
          next={[
            { label: tx('Feedbacks zusammenführen'), href: '#/intents/feedbacks-zusammenfuehren' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
