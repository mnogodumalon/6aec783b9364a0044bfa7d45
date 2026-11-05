/**
 * KI-Antwort einfügen — 3-Schritt-Wizard.
 * Steps: 1) Interaktion wählen → 2) Antwort der KI einfügen → 3) Prüfen & speichern.
 * Reads: interaktionen (Titel, Veranstaltung, zusammengeführter Text, KI-Antwort). Writes: interaktionen.ki_antwort (update, via useKiAntwortEinfuegenFlow).
 * Composes: IntentWizardShell, EntitySelectStep, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText } from '@/lib/journey';
import { useKiAntwortEinfuegenFlow } from '@/lib/journey/flows/KiAntwortEinfuegen';
import { tx } from '@/i18n';

export default function KiAntwortEinfuegenPage() {
  const [step, setStep] = useState(1);
  const flow = useKiAntwortEinfuegenFlow({
    steps: { interaktionen: 1, ki_antwort: 2 },
    items: {
      interaktionen: (r, ctx) => ({
        id: r.id,
        title: fieldText(r, 'titel'),
        subtitle: ctx.ref('veranstaltung'),
      }),
    },
  });

  const target = flow.targets.interaktionen.record;
  const merged = target ? fieldText(target, 'zusammengefuehrter_text') : '';

  return (
    <IntentWizardShell
      title={tx('KI-Antwort einfügen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Hinterlege die Antwort des Chatbots bei der passenden Interaktion.'),
        needs: [tx('Die Antwort der KI als Text')],
      }}
    >
      <WizardStep label={tx('Interaktion')} description={tx('Zu welcher Interaktion gehört die Antwort?')}>
        <EntitySelectStep
          {...flow.picks.interaktionen.select}
          {...flow.pick('interaktionen')}
          searchPlaceholder={tx('Titel der Interaktion …')}
        />
      </WizardStep>
      <WizardStep
        label={tx('KI-Antwort')}
        description={tx('Füge die Antwort des Chatbots hier ein.')}
        needs={['interaktionen']}
      >
        <div className="space-y-4">
          {merged && (
            <div className="rounded-2xl bg-secondary p-3 text-sm overflow-hidden">
              <p className="mb-1 font-medium">{tx('Zusammengeführter Text')}</p>
              <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-muted-foreground">{merged}</p>
            </div>
          )}
          <Bound form={flow.forms.interaktionen} name="ki_antwort" rows={10} />
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => flow.validateStep(2)}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>
      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            whatHappensNext={tx('Die Antwort wird bei der Interaktion gespeichert. Du kannst sie später ändern oder entfernen.')}
          />
        )}
      </WizardStep>
      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          undo={flow.undo}
          next={[
            { label: tx('Aktive Interaktion setzen'), href: '#/intents/aktive-interaktion-setzen' },
            { label: tx('Feedbacks zusammenführen'), href: '#/intents/feedbacks-zusammenfuehren' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
