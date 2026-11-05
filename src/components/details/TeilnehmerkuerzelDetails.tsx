import type { Teilnehmerkuerzel, Veranstaltungen, Feedbacks } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { SatelliteSection } from '@/components/SatelliteSection';
import { usePermissions } from '@/lib/permissions';

export interface TeilnehmerkuerzelDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Teilnehmerkuerzel;
  /** N:1-Ziel „Veranstaltungen": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  veranstaltungenList: Veranstaltungen[];
  /** Klick auf die Veranstaltungen-Relation → overlay.push auf dessen Detail. */
  onOpenVeranstaltungen?: (record: Veranstaltungen) => void;
  /** 1:N „Feedbacks" (teilnehmerkuerzel): VOLLE Liste — der Block filtert auf diesen Record. */
  feedbacksList: Feedbacks[];
  /** Zeilen-Klick → overlay.push auf das Feedbacks-Detail (nie der Edit-Dialog). */
  onOpenFeedbacks: (record: Feedbacks) => void;
  /** Kontextuelles „+": öffnet den Feedbacks-Dialog mit diesem Record vorgesetzt. */
  onAddFeedbacks?: () => void;
}

export function TeilnehmerkuerzelDetails({
  record,
  veranstaltungenList,
  onOpenVeranstaltungen,
  feedbacksList,
  onOpenFeedbacks,
  onAddFeedbacks,
}: TeilnehmerkuerzelDetailsProps) {
  // attachments are a write to this record — read-only without the platform right
  const perms = usePermissions();
  const veranstaltungTarget = veranstaltungenList.find(r => r.record_id === extractRecordId(record.fields.veranstaltung));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('teilnehmerkuerzel', 'kuerzel')} value={record.fields.kuerzel} format="text" />
        <RecordField label={fieldLabel('teilnehmerkuerzel', 'email')} value={record.fields.email} format="email" />
        <RecordField label={fieldLabel('teilnehmerkuerzel', 'einwilligung')} value={record.fields.einwilligung} format="bool" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={1}>
        <RecordRelation
          label={fieldLabel('teilnehmerkuerzel', 'veranstaltung')}
          name={veranstaltungTarget?.fields.titel ?? '—'}
          meta={[veranstaltungTarget?.fields.ort].filter(Boolean).join(' · ') || undefined}
          onClick={veranstaltungTarget && onOpenVeranstaltungen ? () => onOpenVeranstaltungen!(veranstaltungTarget!) : undefined}
        />
      </RecordSection>

      <SatelliteSection
        title={appLabel('feedbacks')}
        items={feedbacksList.filter(r => extractRecordId(r.fields.teilnehmerkuerzel) === record.record_id)}
        map={r => ({ name: r.fields.absendekennung ?? appLabel('feedbacks'), meta: undefined })}
        onOpen={onOpenFeedbacks}
        onAdd={onAddFeedbacks}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.TEILNEHMERKUERZEL} recordId={record.record_id} readOnly={!perms.canWrite('teilnehmerkuerzel')} />
    </>
  );
}
