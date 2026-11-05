/**
 * src/pages/views/TextfeldView.tsx — the view „Zusammengeführter Text“ the plan orders (dashboard.views).
 *
 * ROUTE   #/ansicht/textfeld — generated in App.tsx, OUTSIDE the dashboard chrome.
 * LIVE    static — loads once.
 * READS   interaktionen (titel, frage, zusammengefuehrter_text)
 * SHOWS   the interaktionen record that veranstaltungen.aktive_interaktion points at.
 * EDITS   interaktionen.zusammengefuehrter_text is edited ON this view (<ViewTextEditor>).
 *
 * CONTRACT
 *   - Zeigt den zusammengeführten Text der aktiven Interaktion der Veranstaltung.
 *   - Großes bearbeitbares Feld, speichert beim Tippen, mit Kopieren-Knopf.
 *   - Kein Text: „Noch nichts zusammengeführt“; keine aktive Interaktion: „Keine aktive Interaktion“.
 */
import { useLiveRecords } from '@/hooks/useLiveRecords';
import { tx } from '@/i18n';
import { LivingAppsService } from '@/services/livingAppsService';
import { ViewTextEditor } from '@/components/blocks/ViewTextEditor';

export default function TextfeldView() {
  // opened for ONE record (`#/ansicht/textfeld?record=<id>`) → that one;
  // else the control record set LAST (several may each carry a mark — the latest choice wins)
  const pinned = (new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('record') ?? '').replace(/["\\]/g, '');
  const veranstaltungenControl = useLiveRecords('veranstaltungen', { intervalMs: 0, query: pinned
    ? { filter: `r.id == "${pinned}"`, limit: 1 }
    : { filter: "r.v_aktive_interaktion is not None", orderby: ['r.updatedat desc', 'r.id desc'], limit: 1 } });
  const interaktionen = useLiveRecords('interaktionen', { intervalMs: 0 });
  // the record whose zusammengefuehrter_text this view edits — the one the control record points at
  const interaktionenEditId = String((veranstaltungenControl.records[0]?.fields as Record<string, unknown> | undefined)?.['aktive_interaktion'] ?? '').split('/').pop() ?? '';
  const interaktionenEdit = interaktionen.records.find(r => r.record_id === interaktionenEditId) ?? null;
  const hasText = !!String((interaktionenEdit?.fields as Record<string, unknown> | undefined)?.['zusammengefuehrter_text'] ?? '').trim();
  const loading = veranstaltungenControl.loading || interaktionen.loading;
  const failed = (veranstaltungenControl.error && veranstaltungenControl.records.length === 0) || (interaktionen.error && interaktionen.records.length === 0);
  const unauthorized = veranstaltungenControl.unauthorized || interaktionen.unauthorized;
  return (
    <main className="min-h-dvh bg-background p-6 text-foreground flex flex-col gap-4">
      <h1 className="font-semibold" style={{ fontSize: 'clamp(1.5rem, 3.5vh, 3rem)' }}>
        {interaktionenEdit ? String(interaktionenEdit.fields.titel ?? '') : tx('Zusammengeführter Text')}
      </h1>
      {interaktionenEdit?.fields.frage && (
        <p className="text-muted-foreground" style={{ fontSize: 'clamp(1.1rem, 2.2vh, 2rem)' }}>{interaktionenEdit.fields.frage}</p>
      )}
      {failed && (
        <p role="alert" data-live-error className="text-destructive" style={{ fontSize: 'clamp(1.5rem, 2.8vh, 3rem)' }}>
          {unauthorized ? tx('Bitte melde dich an, um diese Ansicht zu sehen.') : tx('Die Daten konnten nicht geladen werden.')}
        </p>
      )}
      {!loading && !failed && !interaktionenEdit && (
        <p data-nothing-marked style={{ fontSize: 'clamp(1.5rem, 2.8vh, 3rem)' }}>
          {veranstaltungenControl.records.length === 0 ? tx('Nichts ausgewählt.') : tx('Keine aktive Interaktion')}
        </p>
      )}
      {interaktionenEdit && !hasText && (
        <p className="text-muted-foreground" style={{ fontSize: 'clamp(1.1rem, 2.2vh, 2rem)' }}>{tx('Noch nichts zusammengeführt')}</p>
      )}
      {interaktionenEdit && (
        <ViewTextEditor
          field="zusammengefuehrter_text"
          recordId={interaktionenEdit.record_id}
          value={String((interaktionenEdit.fields as Record<string, unknown>)['zusammengefuehrter_text'] ?? '')}
          save={async text => {
            await LivingAppsService.updateInteraktionenEntry(interaktionenEdit.record_id, { zusammengefuehrter_text: text });
            interaktionen.apply(interaktionenEdit.record_id, { zusammengefuehrter_text: text });
          }}
        />
      )}
    </main>
  );
}
