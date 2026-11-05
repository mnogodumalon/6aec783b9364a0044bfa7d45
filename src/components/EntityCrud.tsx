/**
 * EntityCrud — pre-generated CRUD + overlay plumbing for the dashboard.
 * Compose it; NEVER re-roll dialog state, submit handlers, an overlay stack
 * or a RecordOverlayHost in the page — this file owns all of it.
 *
 * API at a glance:
 *   const data = useDashboardData();
 *   const crud = useEntityCrud(data, {
 *     // optional — the ONE semantic slot on the overlay: the record's next
 *     // workflow step. Return undefined for types without one.
 *     footer: (top) => top.type === 'veranstaltungen'
 *       ? { label: …, onClick: () => … }
 *       : undefined,
 *   });
 *
 *   `top.type` is the SAME camelCase key as `crud.<entity>` — one spelling
 *   per entity, everywhere in this API.
 *   …
 *   crud.veranstaltungen.openCreate({ …defaults })   // create dialog, prefilled — defaults are
 *                                       // shape-tolerant: bare lookup keys / record ids are fine
 *   crud.veranstaltungen.openEdit(record)            // edit dialog (recordId + defaults wired)
 *   crud.veranstaltungen.openDetail(record)          // record overlay — pass the RAW record,
 *                                       // enrichment is resolved inside
 *   crud.overlay                         // RecordOverlayStack<OverlayItem> for drills:
 *                                       // push / pop / replace / close
 *   crud.enriched.veranstaltungen              // the display-ready array for EVERY entity —
 *                                       // Enriched* where relations exist, the raw array
 *                                       // otherwise. Reuse these; never call enrich*()
 *                                       // in the page, and never guess which entity has
 *                                       // one: they all do.
 *   {crud.surfaces}                      // render ONCE at the end of the page JSX:
 *                                       // all entity dialogs + the overlay host
 *
 * Built in (do NOT re-implement): optimistic update + Rückgängig counter-write
 * on edit, fetchAll-on-error, edit-from-overlay, and per-entity overlay bodies
 * (RecordHeader + <{Entity}Details> with every relation reachable and the
 * contextual "+" prefilled; list-field back-references additionally get a
 * "choose existing" picker that links an EXISTING record — built in, do not
 * re-roll). Drag writes (onEventDrop/onCardMove) stay YOURS:
 * optimistic setter first, PATCH in background, undoToast with counter-write.
 *
 * Overlay content per entity (the host renders these — you never compose
 * Details blocks yourself):
 *   veranstaltungen: titel, datum, ort, beschreibung, aktive_interaktion  ·  → interaktionen · ← interaktionen (list + contextual +) · ← teilnehmerkuerzel (list + contextual +)
 *   interaktionen: veranstaltung, titel, reihenfolge, frage, vorprompt, endprompt, zusammengefuehrter_text, ki_antwort  ·  → veranstaltungen · ← veranstaltungen (list + contextual +) · ← feedbacks (list + contextual +)
 *   teilnehmerkuerzel: kuerzel, email, einwilligung, veranstaltung  ·  → veranstaltungen · ← feedbacks (list + contextual +)
 *   feedbacks: feedbacktext, absendekennung, interaktion, teilnehmerkuerzel  ·  → interaktionen · → teilnehmerkuerzel
 */
import { useState, useMemo, type ReactNode } from 'react';
import type { Veranstaltungen, Interaktionen, Teilnehmerkuerzel, Feedbacks } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { enrichVeranstaltungen, enrichInteraktionen, enrichTeilnehmerkuerzel, enrichFeedbacks } from '@/lib/enrich';
import type { EnrichedVeranstaltungen, EnrichedInteraktionen, EnrichedTeilnehmerkuerzel, EnrichedFeedbacks } from '@/types/enriched';
import { useDashboardData } from '@/hooks/useDashboardData';
import {
  useRecordOverlayStack, RecordOverlayHost, RecordHeader,
  type RecordOverlayStack,
} from '@/components/widgets/RecordView';
import { VeranstaltungenDialog, type VeranstaltungenDialogDefaults } from '@/components/dialogs/VeranstaltungenDialog';
import { VeranstaltungenDetails } from '@/components/details/VeranstaltungenDetails';
import { InteraktionenDialog, type InteraktionenDialogDefaults } from '@/components/dialogs/InteraktionenDialog';
import { InteraktionenDetails } from '@/components/details/InteraktionenDetails';
import { TeilnehmerkuerzelDialog, type TeilnehmerkuerzelDialogDefaults } from '@/components/dialogs/TeilnehmerkuerzelDialog';
import { TeilnehmerkuerzelDetails } from '@/components/details/TeilnehmerkuerzelDetails';
import { FeedbacksDialog, type FeedbacksDialogDefaults } from '@/components/dialogs/FeedbacksDialog';
import { FeedbacksDetails } from '@/components/details/FeedbacksDetails';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { t, appLabel } from '@/i18n';
import { undoToast } from '@/lib/polish';
import { usePermissions } from '@/lib/permissions';
import { toast } from 'sonner';
import { formatDate } from '@/lib/formatters';

// The overlay union — one branch per entity, `record` typed the way the data
// flows: Enriched* where enrichment exists, the raw record type otherwise.
// The host resolves enrichment itself; pages pass raw records everywhere.
export type OverlayItem =
  | { type: 'veranstaltungen'; record: EnrichedVeranstaltungen }
  | { type: 'interaktionen'; record: EnrichedInteraktionen }
  | { type: 'teilnehmerkuerzel'; record: EnrichedTeilnehmerkuerzel }
  | { type: 'feedbacks'; record: EnrichedFeedbacks };

/** The useDashboardData() return — pass it in, never re-fetch inside. */
export type EntityCrudData = ReturnType<typeof useDashboardData>;

export interface EntityCrudOptions {
  /** Per-type overlay footer — the record's next workflow step. */
  /** The action may return a sentence — the reason the step was NOT taken; the overlay shows it under the button. */
  footer?: (top: OverlayItem) => ReactNode | { label: ReactNode; onClick: () => void | string | Promise<void | string> } | undefined;
  placement?: 'side' | 'center';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface EntityCrudApi<TRecord, TDefaults> {
  /** Open the create dialog, optionally prefilled (shape-tolerant defaults). */
  openCreate: (defaults?: TDefaults) => void;
  /** Open the edit dialog for a record (recordId + defaults are wired). */
  openEdit: (record: TRecord) => void;
  /** Open the record overlay (raw record is fine — enrichment resolved inside). */
  openDetail: (record: TRecord) => void;
  /** May the signed-in user create/change records of this list? (the
   *  platform's rights — show a „+ Neu“ only when true; openCreate/openEdit
   *  refuse with a notice otherwise). */
  canWrite: boolean;
}

export interface EntityCrud {
  /** The overlay stack for drills: push / pop / replace / close. */
  overlay: RecordOverlayStack<OverlayItem>;
  /** Render ONCE at the end of the page JSX — all dialogs + the overlay host. */
  surfaces: ReactNode;
  veranstaltungen: EntityCrudApi<Veranstaltungen, VeranstaltungenDialogDefaults>;
  interaktionen: EntityCrudApi<Interaktionen, InteraktionenDialogDefaults>;
  teilnehmerkuerzel: EntityCrudApi<Teilnehmerkuerzel, TeilnehmerkuerzelDialogDefaults>;
  feedbacks: EntityCrudApi<Feedbacks, FeedbacksDialogDefaults>;
  /** The display-ready array per entity: Enriched* where an enrich function
   *  exists, the raw array otherwise. One key per entity so no page has to
   *  know which is which. Reuse these; never re-enrich in the page. */
  enriched: { veranstaltungen: EnrichedVeranstaltungen[]; interaktionen: EnrichedInteraktionen[]; teilnehmerkuerzel: EnrichedTeilnehmerkuerzel[]; feedbacks: EnrichedFeedbacks[] };
}

export function useEntityCrud(data: EntityCrudData, options?: EntityCrudOptions): EntityCrud {
  const overlay = useRecordOverlayStack<OverlayItem>();
  // the platform's rights of the signed-in user (lib/permissions.ts) — unknown = allowed
  const perms = usePermissions();
  const refuse = () => { toast.error(t('perm_denied_title'), { description: t('perm_denied_desc') }); };
  const [veranstaltungenDialog, setVeranstaltungenDialog] = useState<{ defaults?: VeranstaltungenDialogDefaults; editing?: Veranstaltungen } | null>(null);
  const [interaktionenDialog, setInteraktionenDialog] = useState<{ defaults?: InteraktionenDialogDefaults; editing?: Interaktionen } | null>(null);
  const [teilnehmerkuerzelDialog, setTeilnehmerkuerzelDialog] = useState<{ defaults?: TeilnehmerkuerzelDialogDefaults; editing?: Teilnehmerkuerzel } | null>(null);
  const [feedbacksDialog, setFeedbacksDialog] = useState<{ defaults?: FeedbacksDialogDefaults; editing?: Feedbacks } | null>(null);
  const enrichedVeranstaltungen = useMemo(() => enrichVeranstaltungen(data.veranstaltungen, { interaktionenMap: data.interaktionenMap }), [data.veranstaltungen, data.interaktionenMap]);
  const enrichedInteraktionen = useMemo(() => enrichInteraktionen(data.interaktionen, { veranstaltungenMap: data.veranstaltungenMap }), [data.interaktionen, data.veranstaltungenMap]);
  const enrichedTeilnehmerkuerzel = useMemo(() => enrichTeilnehmerkuerzel(data.teilnehmerkuerzel, { veranstaltungenMap: data.veranstaltungenMap }), [data.teilnehmerkuerzel, data.veranstaltungenMap]);
  const enrichedFeedbacks = useMemo(() => enrichFeedbacks(data.feedbacks, { interaktionenMap: data.interaktionenMap, teilnehmerkuerzelMap: data.teilnehmerkuerzelMap }), [data.feedbacks, data.interaktionenMap, data.teilnehmerkuerzelMap]);

  function detailVeranstaltungen(record: Veranstaltungen, push = false) {
    const rec = enrichedVeranstaltungen.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'veranstaltungen', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitVeranstaltungen(fields: Veranstaltungen['fields']) {
    const editing = veranstaltungenDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setVeranstaltungen(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateVeranstaltungenEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('veranstaltungen')} — ${t('crud_updated')}`, async () => {
        data.setVeranstaltungen(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateVeranstaltungenEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createVeranstaltungenEntry(fields);
      undoToast(`${appLabel('veranstaltungen')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailInteraktionen(record: Interaktionen, push = false) {
    const rec = enrichedInteraktionen.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'interaktionen', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitInteraktionen(fields: Interaktionen['fields']) {
    const editing = interaktionenDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setInteraktionen(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateInteraktionenEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('interaktionen')} — ${t('crud_updated')}`, async () => {
        data.setInteraktionen(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateInteraktionenEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createInteraktionenEntry(fields);
      undoToast(`${appLabel('interaktionen')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailTeilnehmerkuerzel(record: Teilnehmerkuerzel, push = false) {
    const rec = enrichedTeilnehmerkuerzel.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'teilnehmerkuerzel', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitTeilnehmerkuerzel(fields: Teilnehmerkuerzel['fields']) {
    const editing = teilnehmerkuerzelDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setTeilnehmerkuerzel(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateTeilnehmerkuerzelEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('teilnehmerkuerzel')} — ${t('crud_updated')}`, async () => {
        data.setTeilnehmerkuerzel(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateTeilnehmerkuerzelEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createTeilnehmerkuerzelEntry(fields);
      undoToast(`${appLabel('teilnehmerkuerzel')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailFeedbacks(record: Feedbacks, push = false) {
    const rec = enrichedFeedbacks.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'feedbacks', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitFeedbacks(fields: Feedbacks['fields']) {
    const editing = feedbacksDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setFeedbacks(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateFeedback(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('feedbacks')} — ${t('crud_updated')}`, async () => {
        data.setFeedbacks(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateFeedback(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createFeedback(fields);
      undoToast(`${appLabel('feedbacks')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  const surfaces = (
    <>
      <VeranstaltungenDialog
        open={veranstaltungenDialog !== null}
        onClose={() => setVeranstaltungenDialog(null)}
        onSubmit={submitVeranstaltungen}
        defaultValues={veranstaltungenDialog?.defaults}
        recordId={veranstaltungenDialog?.editing?.record_id}
        interaktionenList={data.interaktionen}
        enablePhotoScan={AI_PHOTO_SCAN['Veranstaltungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Veranstaltungen']}
      />
      <InteraktionenDialog
        open={interaktionenDialog !== null}
        onClose={() => setInteraktionenDialog(null)}
        onSubmit={submitInteraktionen}
        defaultValues={interaktionenDialog?.defaults}
        recordId={interaktionenDialog?.editing?.record_id}
        veranstaltungenList={data.veranstaltungen}
        enablePhotoScan={AI_PHOTO_SCAN['Interaktionen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Interaktionen']}
      />
      <TeilnehmerkuerzelDialog
        open={teilnehmerkuerzelDialog !== null}
        onClose={() => setTeilnehmerkuerzelDialog(null)}
        onSubmit={submitTeilnehmerkuerzel}
        defaultValues={teilnehmerkuerzelDialog?.defaults}
        recordId={teilnehmerkuerzelDialog?.editing?.record_id}
        veranstaltungenList={data.veranstaltungen}
        enablePhotoScan={AI_PHOTO_SCAN['Teilnehmerkuerzel']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Teilnehmerkuerzel']}
      />
      <FeedbacksDialog
        open={feedbacksDialog !== null}
        onClose={() => setFeedbacksDialog(null)}
        onSubmit={submitFeedbacks}
        defaultValues={feedbacksDialog?.defaults}
        recordId={feedbacksDialog?.editing?.record_id}
        interaktionenList={data.interaktionen}
        teilnehmerkuerzelList={data.teilnehmerkuerzel}
        enablePhotoScan={AI_PHOTO_SCAN['Feedbacks']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Feedbacks']}
      />
      <RecordOverlayHost
        overlay={overlay}
        placement={options?.placement}
        size={options?.size}
        footer={options?.footer}
        render={(top) => {
          if (top.type === 'veranstaltungen') {
            return (
              <>
                <RecordHeader title={top.record.fields.titel ?? appLabel('veranstaltungen')} subtitle={top.record.fields.datum ? formatDate(top.record.fields.datum) : undefined} />
                <VeranstaltungenDetails
                  record={top.record}
                  interaktionenList={data.interaktionen}
                  onOpenInteraktionen={(r) => detailInteraktionen(r, true)}
                  interaktionenVeranstaltungList={data.interaktionen}
                  onOpenInteraktionenVeranstaltung={(r) => detailInteraktionen(r, true)}
                  onAddInteraktionenVeranstaltung={perms.canWrite('interaktionen') ? () => setInteraktionenDialog({ defaults: { veranstaltung: createRecordUrl(APP_IDS.VERANSTALTUNGEN, top.record.record_id) } }) : undefined}
                  teilnehmerkuerzelList={data.teilnehmerkuerzel}
                  onOpenTeilnehmerkuerzel={(r) => detailTeilnehmerkuerzel(r, true)}
                  onAddTeilnehmerkuerzel={perms.canWrite('teilnehmerkuerzel') ? () => setTeilnehmerkuerzelDialog({ defaults: { veranstaltung: createRecordUrl(APP_IDS.VERANSTALTUNGEN, top.record.record_id) } }) : undefined}
                />
              </>
            );
          }
          if (top.type === 'interaktionen') {
            return (
              <>
                <RecordHeader title={top.record.fields.titel ?? appLabel('interaktionen')} subtitle={undefined} />
                <InteraktionenDetails
                  record={top.record}
                  veranstaltungenList={data.veranstaltungen}
                  onOpenVeranstaltungen={(r) => detailVeranstaltungen(r, true)}
                  veranstaltungenAktiveInteraktionList={data.veranstaltungen}
                  onOpenVeranstaltungenAktiveInteraktion={(r) => detailVeranstaltungen(r, true)}
                  onAddVeranstaltungenAktiveInteraktion={perms.canWrite('veranstaltungen') ? () => setVeranstaltungenDialog({ defaults: { aktive_interaktion: createRecordUrl(APP_IDS.INTERAKTIONEN, top.record.record_id) } }) : undefined}
                  feedbacksList={data.feedbacks}
                  onOpenFeedbacks={(r) => detailFeedbacks(r, true)}
                  onAddFeedbacks={perms.canWrite('feedbacks') ? () => setFeedbacksDialog({ defaults: { interaktion: createRecordUrl(APP_IDS.INTERAKTIONEN, top.record.record_id) } }) : undefined}
                />
              </>
            );
          }
          if (top.type === 'teilnehmerkuerzel') {
            return (
              <>
                <RecordHeader title={top.record.fields.kuerzel ?? appLabel('teilnehmerkuerzel')} subtitle={undefined} />
                <TeilnehmerkuerzelDetails
                  record={top.record}
                  veranstaltungenList={data.veranstaltungen}
                  onOpenVeranstaltungen={(r) => detailVeranstaltungen(r, true)}
                  feedbacksList={data.feedbacks}
                  onOpenFeedbacks={(r) => detailFeedbacks(r, true)}
                  onAddFeedbacks={perms.canWrite('feedbacks') ? () => setFeedbacksDialog({ defaults: { teilnehmerkuerzel: createRecordUrl(APP_IDS.TEILNEHMERKUERZEL, top.record.record_id) } }) : undefined}
                />
              </>
            );
          }
          if (top.type === 'feedbacks') {
            return (
              <>
                <RecordHeader title={top.record.fields.absendekennung ?? appLabel('feedbacks')} subtitle={undefined} />
                <FeedbacksDetails
                  record={top.record}
                  interaktionenList={data.interaktionen}
                  onOpenInteraktionen={(r) => detailInteraktionen(r, true)}
                  teilnehmerkuerzelList={data.teilnehmerkuerzel}
                  onOpenTeilnehmerkuerzel={(r) => detailTeilnehmerkuerzel(r, true)}
                />
              </>
            );
          }
          return null;
        }}
        canEdit={(top) => {
          if (top.type === 'veranstaltungen') return perms.canWrite('veranstaltungen');
          if (top.type === 'interaktionen') return perms.canWrite('interaktionen');
          if (top.type === 'teilnehmerkuerzel') return perms.canWrite('teilnehmerkuerzel');
          if (top.type === 'feedbacks') return perms.canWrite('feedbacks');
          return true;
        }}
        onEdit={(top) => {
          overlay.close();
          if (top.type === 'veranstaltungen') setVeranstaltungenDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'interaktionen') setInteraktionenDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'teilnehmerkuerzel') setTeilnehmerkuerzelDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'feedbacks') setFeedbacksDialog({ editing: top.record, defaults: top.record.fields });
        }}
      />
    </>
  );

  return {
    overlay,
    surfaces,
    veranstaltungen: {
      openCreate: (defaults?: VeranstaltungenDialogDefaults) => (perms.canWrite('veranstaltungen') ? setVeranstaltungenDialog({ defaults }) : refuse()),
      openEdit: (record: Veranstaltungen) => (perms.canWrite('veranstaltungen') ? setVeranstaltungenDialog({ editing: record, defaults: record.fields }) : refuse()),
      openDetail: (record: Veranstaltungen) => detailVeranstaltungen(record, false),
      canWrite: perms.canWrite('veranstaltungen'),
    },
    interaktionen: {
      openCreate: (defaults?: InteraktionenDialogDefaults) => (perms.canWrite('interaktionen') ? setInteraktionenDialog({ defaults }) : refuse()),
      openEdit: (record: Interaktionen) => (perms.canWrite('interaktionen') ? setInteraktionenDialog({ editing: record, defaults: record.fields }) : refuse()),
      openDetail: (record: Interaktionen) => detailInteraktionen(record, false),
      canWrite: perms.canWrite('interaktionen'),
    },
    teilnehmerkuerzel: {
      openCreate: (defaults?: TeilnehmerkuerzelDialogDefaults) => (perms.canWrite('teilnehmerkuerzel') ? setTeilnehmerkuerzelDialog({ defaults }) : refuse()),
      openEdit: (record: Teilnehmerkuerzel) => (perms.canWrite('teilnehmerkuerzel') ? setTeilnehmerkuerzelDialog({ editing: record, defaults: record.fields }) : refuse()),
      openDetail: (record: Teilnehmerkuerzel) => detailTeilnehmerkuerzel(record, false),
      canWrite: perms.canWrite('teilnehmerkuerzel'),
    },
    feedbacks: {
      openCreate: (defaults?: FeedbacksDialogDefaults) => (perms.canWrite('feedbacks') ? setFeedbacksDialog({ defaults }) : refuse()),
      openEdit: (record: Feedbacks) => (perms.canWrite('feedbacks') ? setFeedbacksDialog({ editing: record, defaults: record.fields }) : refuse()),
      openDetail: (record: Feedbacks) => detailFeedbacks(record, false),
      canWrite: perms.canWrite('feedbacks'),
    },
    enriched: { veranstaltungen: enrichedVeranstaltungen, interaktionen: enrichedInteraktionen, teilnehmerkuerzel: enrichedTeilnehmerkuerzel, feedbacks: enrichedFeedbacks },
  };
}
