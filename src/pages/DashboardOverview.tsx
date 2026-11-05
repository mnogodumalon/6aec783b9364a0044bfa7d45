import { useMemo, useState } from 'react';
import { IconPlus, IconQrcode, IconFileText, IconCalendar, IconMapPin, IconPlayerPlay, IconCheck, IconMessage } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { flowActionFor, countOf } from '@/config/plan';
import type { EnrichedInteraktionen, EnrichedFeedbacks } from '@/types/enriched';
import { extractRecordId } from '@/services/livingAppsService';
import { formatDateTime } from '@/lib/formatters';
import { useClock, gruss, namen } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
import { Button } from '@/components/ui/button';
import { ToolButton } from '@/components/ToolButton';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';

type Filter = 'all' | 'ohne' | 'feedback';

// Composition: hub-and-spoke on Veranstaltungen. No widget covers "pick the one active
// child per hub" (CalendarWidget/Kanban rejected: they have no per-hub single-select of
// related records), so the primary surface is one card per Veranstaltung carrying its
// Interaktionen + Feedbacks. No urgent hero; split grid with a slim StatStrip, aside = two
// WorkLists over the next workflow steps (zusammenführen, KI-Antwort einfügen).
// Mobile: cards stack full width, aside work lists come first (DashboardGrid order).
export default function DashboardOverview({ data }: { data: DashboardData }) {
  const clock = useClock();
  const [filter, setFilter] = useState<Filter>('all');

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type !== 'interaktionen') return undefined;
      const vId = extractRecordId(top.record.fields.veranstaltung);
      if (!vId) return undefined;
      const v = data.veranstaltungenMap.get(vId);
      if (!v || extractRecordId(v.fields.aktive_interaktion) === top.record.record_id) return undefined;
      const go = flowActionFor('veranstaltungen', 'aktive_interaktion', vId, top.record.record_id);
      return go ? { label: tx('Als aktive Interaktion setzen'), onClick: go } : undefined;
    },
  });
  const veranstaltungen = crud.enriched.veranstaltungen;
  const interaktionen = crud.enriched.interaktionen;
  const feedbacks = crud.enriched.feedbacks;
  const kuerzelMap = data.teilnehmerkuerzelMap;

  const interByVer = useMemo(() => {
    const m = new Map<string, EnrichedInteraktionen[]>();
    for (const i of interaktionen) {
      const vId = extractRecordId(i.fields.veranstaltung);
      if (!vId) continue;
      const list = m.get(vId) ?? [];
      list.push(i);
      m.set(vId, list);
    }
    for (const list of m.values()) list.sort((a, b) => (a.fields.reihenfolge ?? 0) - (b.fields.reihenfolge ?? 0));
    return m;
  }, [interaktionen]);

  const fbByInter = useMemo(() => {
    const m = new Map<string, EnrichedFeedbacks[]>();
    for (const f of feedbacks) {
      const iId = extractRecordId(f.fields.interaktion);
      if (!iId) continue;
      const list = m.get(iId) ?? [];
      list.push(f);
      m.set(iId, list);
    }
    for (const list of m.values()) list.sort((a, b) => String(b.createdat ?? '').localeCompare(String(a.createdat ?? '')));
    return m;
  }, [feedbacks]);

  const activeOf = (aktive?: string) => extractRecordId(aktive);
  const withActive = veranstaltungen.filter(v => activeOf(v.fields.aktive_interaktion));
  const withoutActive = veranstaltungen.filter(v => !activeOf(v.fields.aktive_interaktion));
  const activeInteraktionen = withActive
    .map(v => data.interaktionenMap.get(activeOf(v.fields.aktive_interaktion)!))
    .filter((i): i is NonNullable<typeof i> => !!i);
  const activeFeedbackCount = activeInteraktionen.reduce((n, i) => n + (fbByInter.get(i.record_id)?.length ?? 0), 0);
  const withFeedback = veranstaltungen.filter(v => {
    const a = activeOf(v.fields.aktive_interaktion);
    return !!a && (fbByInter.get(a)?.length ?? 0) > 0;
  });

  const shown = filter === 'ohne' ? withoutActive : filter === 'feedback' ? withFeedback : veranstaltungen;

  // WorkList 1: aktive Interaktionen mit Feedbacks, aber ohne zusammengeführten Text
  const toMerge = activeInteraktionen.filter(i => (fbByInter.get(i.record_id)?.length ?? 0) > 0 && !i.fields.zusammengefuehrter_text);
  // WorkList 2: Text da, KI-Antwort fehlt
  const toAnswer = interaktionen.filter(i => !!i.fields.zusammengefuehrter_text && !i.fields.ki_antwort);

  const titleOf = (id: string) => data.interaktionenMap.get(id)?.fields.titel ?? '';
  const contextLine = veranstaltungen.length === 0
    ? tx('Lege deine erste Veranstaltung an, dann kann es losgehen.')
    : activeInteraktionen.length > 0
      ? tx`Aktiv: ${namen(activeInteraktionen.map(i => i.fields.titel ?? ''))} — ${countOf('feedbacks', activeFeedbackCount, appLabel('feedbacks'))} bisher.`
      : tx`${namen(veranstaltungen.map(v => v.fields.titel ?? ''))} — noch keine Interaktion aktiv.`;

  const openTab = (path: string, id: string) => window.open(tx`#/ansicht/${path}?record=${id}`, '_blank');

  const mergeItems = toMerge.map(i => {
    const go = flowActionFor('interaktionen', 'zusammengefuehrter_text', i.record_id);
    return {
      id: i.record_id,
      title: i.fields.titel ?? '',
      secondLine: <span className="text-muted-foreground">{countOf('feedbacks', fbByInter.get(i.record_id)?.length ?? 0, appLabel('feedbacks'))}</span>,
      action: go ? { label: tx('Zusammenführen'), onClick: go } : undefined,
    };
  });
  const answerItems = toAnswer.map(i => {
    const go = flowActionFor('interaktionen', 'ki_antwort', i.record_id);
    return {
      id: i.record_id,
      title: i.fields.titel ?? '',
      secondLine: <span className="text-muted-foreground">{i.veranstaltungName}</span>,
      action: go ? { label: tx('Antwort einfügen'), onClick: go } : undefined,
    };
  });
  const openInter = (id: string) => {
    const rec = data.interaktionenMap.get(id);
    if (rec) crud.interaktionen.openDetail(rec);
  };

  const empty = veranstaltungen.length === 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="text-sm text-muted-foreground mt-1">{contextLine}</p>
        </div>
        {crud.veranstaltungen.canWrite && (
          <Button onClick={() => crud.veranstaltungen.openCreate({})}>
            <IconPlus size={16} className="shrink-0" /> {tx('Neue Veranstaltung')}
          </Button>
        )}
      </div>

      <DashboardGrid
        variant="split"
        kpis={empty ? undefined : (
          <StatStrip>
            <StatStripItem
              title={tx('Ohne aktive Interaktion')}
              value={withoutActive.length}
              tone={withoutActive.length > 0 ? 'warning' : 'default'}
              onClick={() => setFilter(f => (f === 'ohne' ? 'all' : 'ohne'))}
              active={filter === 'ohne'}
            />
            <StatStripItem
              title={tx('Feedbacks in aktiven Interaktionen')}
              value={activeFeedbackCount}
              tone={activeFeedbackCount > 0 ? 'primary' : 'default'}
              icon={<IconMessage size={16} className="text-muted-foreground" />}
              onClick={() => setFilter(f => (f === 'feedback' ? 'all' : 'feedback'))}
              active={filter === 'feedback'}
            />
          </StatStrip>
        )}
        aside={empty ? undefined : (
          <>
            <WorkList
              title={tx('Text zusammenführen')}
              items={mergeItems}
              onItemClick={openInter}
              empty={{ text: tx('Nichts zu tun — sobald Feedbacks eintreffen, erscheint die Interaktion hier.') }}
            />
            <WorkList
              title={tx('KI-Antwort einfügen')}
              items={answerItems}
              onItemClick={openInter}
              empty={{ text: tx('Keine Antwort offen.') }}
            />
          </>
        )}
        primary={empty ? (
          <div className="rounded-[27px] bg-card shadow-sm p-10 flex flex-col items-center text-center gap-4 overflow-hidden">
            <IconCalendar size={48} className="text-muted-foreground" />
            <p className="text-muted-foreground max-w-md">{tx('Lege eine Veranstaltung an und bereite Interaktionen mit Frage, Vorprompt und Endprompt vor.')}</p>
            {crud.veranstaltungen.canWrite && (
              <Button onClick={() => crud.veranstaltungen.openCreate({})}>{tx('Erste Veranstaltung anlegen')}</Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {shown.length === 0 && (
              <p className="rounded-[27px] bg-card shadow-sm p-6 text-sm text-muted-foreground">{tx('Keine Veranstaltung in dieser Ansicht.')}</p>
            )}
            {shown.map(v => {
              const list = interByVer.get(v.record_id) ?? [];
              const activeId = activeOf(v.fields.aktive_interaktion);
              const activeFb = activeId ? fbByInter.get(activeId) ?? [] : [];
              return (
                <section key={v.record_id} className="rounded-[27px] bg-card shadow-sm p-5 space-y-4 overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button type="button" className="min-w-0 text-left" onClick={() => crud.veranstaltungen.openDetail(v)}>
                      <h2 className="text-lg font-semibold truncate">{v.fields.titel}</h2>
                      <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                        {v.fields.datum && <span className="inline-flex items-center gap-1"><IconCalendar size={14} className="shrink-0" />{formatDateTime(v.fields.datum)}</span>}
                        {v.fields.ort && <span className="inline-flex items-center gap-1"><IconMapPin size={14} className="shrink-0" />{v.fields.ort}</span>}
                      </p>
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => openTab('qr-code', v.record_id)}>
                        <IconQrcode size={16} className="shrink-0" /> {tx('QR-Code')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openTab('textfeld', v.record_id)}>
                        <IconFileText size={16} className="shrink-0" /> {tx('Text')}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {list.length === 0 && (
                      <p className="text-sm text-muted-foreground">{tx('Noch keine Interaktion vorbereitet.')}</p>
                    )}
                    {list.map(i => {
                      const isActive = i.record_id === activeId;
                      const go = isActive ? null : flowActionFor('veranstaltungen', 'aktive_interaktion', v.record_id, i.record_id);
                      const n = fbByInter.get(i.record_id)?.length ?? 0;
                      return (
                        <div
                          key={i.record_id}
                          className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${isActive ? 'border-primary bg-primary/5' : 'border-border'}`}
                        >
                          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => crud.interaktionen.openDetail(i)}>
                            <div className="font-medium truncate">{i.fields.titel}</div>
                            <div className="text-xs text-muted-foreground truncate">{i.fields.frage}</div>
                          </button>
                          <span className="text-xs text-muted-foreground">{countOf('feedbacks', n, appLabel('feedbacks'))}</span>
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary"><IconCheck size={14} className="shrink-0" />{tx('Aktiv')}</span>
                          ) : go ? (
                            <Button size="sm" variant="outline" onClick={go}>
                              <IconPlayerPlay size={14} className="shrink-0" /> {tx('Aktiv setzen')}
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                    {crud.interaktionen.canWrite && (
                      <Button size="sm" variant="ghost" onClick={() => crud.interaktionen.openCreate({ veranstaltung: v.record_id })}>
                        <IconPlus size={14} className="shrink-0" /> {tx('Interaktion hinzufügen')}
                      </Button>
                    )}
                  </div>

                  {activeId && (
                    <div className="space-y-2 border-t pt-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-medium truncate min-w-0">{tx`Feedbacks zu „${titleOf(activeId)}“`}</h3>
                        <ToolButton tool="feedbacks-zusammenfuehren" recordId={activeId} label={tx('Feedbacks zu einem Text zusammenführen')} />
                      </div>
                      {activeFb.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{tx('Noch keine Feedbacks — die Teilnehmenden scannen den QR-Code.')}</p>
                      ) : (
                        <ul className="space-y-1">
                          {activeFb.slice(0, 4).map(f => (
                            <li key={f.record_id}>
                              <button type="button" className="w-full text-left text-sm flex gap-2 min-w-0 hover:bg-muted/50 rounded-md px-2 py-1" onClick={() => crud.feedbacks.openDetail(f)}>
                                <span className="font-mono text-xs text-muted-foreground shrink-0">{f.fields.absendekennung || kuerzelMap.get(extractRecordId(f.fields.teilnehmerkuerzel) ?? '')?.fields.kuerzel}</span>
                                <span className="truncate">{f.fields.feedbacktext}</span>
                              </button>
                            </li>
                          ))}
                          {activeFb.length > 4 && (
                            <li className="text-xs text-muted-foreground px-2">{tx`+${activeFb.length - 4} weitere`}</li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      />
      {crud.surfaces}
    </div>
  );
}
