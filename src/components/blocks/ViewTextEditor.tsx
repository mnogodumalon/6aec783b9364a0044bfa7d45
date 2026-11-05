/**
 * blocks/ViewTextEditor.tsx — a big text a person edits IN FRONT OF the room (generated, presentational).
 *
 *   <ViewTextEditor field="<field>" recordId={rec.record_id}
 *     value={String(rec.fields.<field> ?? '')}
 *     save={text => <the entity's update method>(rec.record_id, { <field>: text })} />
 *
 * A view's `edits` (plan.dashboard.views[].edits): Bau 10 of Meet-the-Member showed the
 * merged text read-only and sent the moderator to a small dialog, while the owner wrote
 * „Dieses Textfeld öffne ich bildschirmfüllend, gehe es durch und ändere den Text
 * beliebig; er bleibt gespeichert … kopiere ich mit einem Klick“. Mechanics fixed here:
 * typing saves by itself after a short pause; the state is always on screen —
 * „Gespeichert“, „Speichert …“ or „Nicht gespeichert — erneut versuchen“ (a button that
 * sends the SAME text again); „Text kopieren“ copies what is in the field. A poll of the
 * view never overwrites what the person is typing: the platform's value is taken only
 * while nothing is pending, and only when it really changed.
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';

export interface ViewTextEditorProps {
  /** The plan field this editor writes (the gate matches it against the view's `edits`). */
  field: string;
  /** The record the text belongs to — a new record resets the editor. */
  recordId: string;
  /** The value the platform has now (from the view's live read). */
  value: string | null | undefined;
  /** Writes the text to the record; a rejected promise is shown as „Nicht gespeichert“. */
  save: (text: string) => Promise<unknown>;
  /** Pause after the last keystroke before saving, in ms (default 800). */
  delayMs?: number;
  /** Text size; the default is read from across a room. */
  style?: React.CSSProperties;
  className?: string;
}

type Phase = 'saved' | 'saving' | 'failed' | 'dirty';

export function ViewTextEditor({ field, recordId, value, save, delayMs = 800, style, className }: ViewTextEditorProps) {
  const [text, setText] = useState(value ?? '');
  const [phase, setPhase] = useState<Phase>('saved');
  const [copied, setCopied] = useState(false);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(value ?? '');
  const record = useRef(recordId);

  // another record → its text, nothing pending
  useEffect(() => {
    if (record.current === recordId) return;
    record.current = recordId;
    if (timer.current) clearTimeout(timer.current);
    pending.current = false;
    last.current = value ?? '';
    setText(value ?? '');
    setPhase('saved');
  }, [recordId, value]);

  // the platform's value — only while the person has nothing unsaved
  useEffect(() => {
    const v = value ?? '';
    if (pending.current || v === last.current) return;
    last.current = v;
    setText(v);
  }, [value]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const send = async (next: string) => {
    setPhase('saving');
    try {
      await save(next);
      last.current = next;
      pending.current = false;
      setPhase('saved');
    } catch (err) {
      console.error(`[ViewTextEditor] ${field}:`, err);
      setPhase('failed');
    }
  };

  const onChange = (next: string) => {
    setText(next);
    pending.current = true;
    setPhase('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void send(next); }, delayMs);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* a browser without clipboard access — the text stays selectable */ }
  };

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-3 ${className ?? ''}`} data-view-edit={field}>
      <textarea
        value={text}
        onChange={e => onChange(e.target.value)}
        className="min-h-[50vh] w-full flex-1 resize-none rounded-2xl border border-input bg-card p-6 leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={style ?? { fontSize: 'clamp(1.25rem, 2.4vh, 2.5rem)' }}
        aria-label={field}
      />
      <div className="flex flex-wrap items-center gap-3" style={{ fontSize: 'clamp(1rem, 1.8vh, 1.75rem)' }}>
        <Button type="button" variant="outline" onClick={() => { void copy(); }} data-view-copy>
          {copied ? t('vte_copied') : t('vte_copy')}
        </Button>
        <span role="status" aria-live="polite" data-view-save={phase}
          className={phase === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
          {phase === 'failed' ? (
            <button type="button" className="underline" onClick={() => { void send(text); }}>{t('vte_failed')}</button>
          ) : phase === 'saved' ? t('vte_saved') : t('vte_saving')}
        </span>
      </div>
    </div>
  );
}

export default ViewTextEditor;
