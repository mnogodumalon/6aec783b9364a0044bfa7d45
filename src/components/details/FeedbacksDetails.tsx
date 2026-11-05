import type { Feedbacks, Interaktionen, Teilnehmerkuerzel } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { usePermissions } from '@/lib/permissions';

export interface FeedbacksDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Feedbacks;
  /** N:1-Ziel „Interaktionen": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  interaktionenList: Interaktionen[];
  /** Klick auf die Interaktionen-Relation → overlay.push auf dessen Detail. */
  onOpenInteraktionen?: (record: Interaktionen) => void;
  /** N:1-Ziel „Teilnehmerkuerzel": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  teilnehmerkuerzelList: Teilnehmerkuerzel[];
  /** Klick auf die Teilnehmerkuerzel-Relation → overlay.push auf dessen Detail. */
  onOpenTeilnehmerkuerzel?: (record: Teilnehmerkuerzel) => void;
}

export function FeedbacksDetails({
  record,
  interaktionenList,
  onOpenInteraktionen,
  teilnehmerkuerzelList,
  onOpenTeilnehmerkuerzel,
}: FeedbacksDetailsProps) {
  // attachments are a write to this record — read-only without the platform right
  const perms = usePermissions();
  const interaktionTarget = interaktionenList.find(r => r.record_id === extractRecordId(record.fields.interaktion));
  const teilnehmerkuerzelTarget = teilnehmerkuerzelList.find(r => r.record_id === extractRecordId(record.fields.teilnehmerkuerzel));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('feedbacks', 'feedbacktext')} value={record.fields.feedbacktext} format="longtext" className="md:col-span-2" />
        <RecordField label={fieldLabel('feedbacks', 'absendekennung')} value={record.fields.absendekennung} format="text" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={2}>
        <RecordRelation
          label={fieldLabel('feedbacks', 'interaktion')}
          name={interaktionTarget?.fields.titel ?? '—'}
          meta={undefined}
          onClick={interaktionTarget && onOpenInteraktionen ? () => onOpenInteraktionen!(interaktionTarget!) : undefined}
        />
        <RecordRelation
          label={fieldLabel('feedbacks', 'teilnehmerkuerzel')}
          name={teilnehmerkuerzelTarget?.fields.email ?? '—'}
          meta={[teilnehmerkuerzelTarget?.fields.email].filter(Boolean).join(' · ') || undefined}
          onClick={teilnehmerkuerzelTarget && onOpenTeilnehmerkuerzel ? () => onOpenTeilnehmerkuerzel!(teilnehmerkuerzelTarget!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.FEEDBACKS} recordId={record.record_id} readOnly={!perms.canWrite('feedbacks')} />
    </>
  );
}
