/**
 * src/pages/views/QrCodeView.tsx — the view „QR-Code“ the plan orders (dashboard.views).
 *
 * ROUTE   #/ansicht/qr-code — generated in App.tsx, OUTSIDE the dashboard chrome.
 * LIVE    static — loads once.
 * READS   veranstaltungen (titel, datum, ort)
 * JOIN    <PublicPageQr entity="veranstaltungen" recordId={…} />
 * PURPOSE Den QR-Code der Veranstaltung bildschirmfüllend zeigen.
 *
 * CONTRACT
 *   - Zeigt den QR-Code genau der Veranstaltung, die in der Übersicht geöffnet wurde (?record=), mit Titel darüber.
 *   - Ist keine Veranstaltung gewählt, erscheint „Bitte eine Veranstaltung wählen“.
 */
import { useLiveRecords } from '@/hooks/useLiveRecords';
import { tx } from '@/i18n';
import { PublicPageQr } from '@/components/widgets/PublicPageQr';

export default function QrCodeView() {
  const pinned = (new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('record') ?? '').replace(/["\\]/g, '');
  const veranstaltungen = useLiveRecords('veranstaltungen', {
    intervalMs: 0,
    query: pinned ? { filter: `r.id == "${pinned}"`, limit: 1 } : { limit: 1 },
  });
  const record = pinned ? veranstaltungen.records.find(r => r.record_id === pinned) ?? null : null;
  const fail = veranstaltungen.error && veranstaltungen.records.length === 0;
  return (
    <main className="min-h-dvh bg-background p-6 text-foreground flex flex-col items-center justify-center gap-8 text-center">
      {fail ? (
        <p role="alert" data-live-error className="text-destructive" style={{ fontSize: 'clamp(1.5rem, 2.8vh, 3rem)' }}>
          {veranstaltungen.unauthorized ? tx('Bitte melde dich an, um diese Ansicht zu sehen.') : tx('Die Daten konnten nicht geladen werden.')}
        </p>
      ) : !pinned ? (
        <p style={{ fontSize: 'clamp(1.5rem, 2.8vh, 3rem)' }}>{tx('Bitte eine Veranstaltung wählen')}</p>
      ) : record ? (
        <>
          <h1 className="font-semibold" style={{ fontSize: 'clamp(2rem, 5vh, 5rem)' }}>{record.fields.titel}</h1>
          <PublicPageQr entity="veranstaltungen" recordId={record.record_id} size="50vh" linkClassName="text-muted-foreground text-lg" />
        </>
      ) : !veranstaltungen.loading ? (
        <p style={{ fontSize: 'clamp(1.5rem, 2.8vh, 3rem)' }}>{tx('Bitte eine Veranstaltung wählen')}</p>
      ) : null}
    </main>
  );
}
