import { useEffect, useMemo, useState } from 'react';
import { useUi } from './ui';
import { accountLocalTime, accountReviewPreset, accountTimeChoices } from './review-time';
import { workflowCopy } from './review-workflow-copy';
export function ReviewReschedule({ due, timezone, save, disabled = false }: { due: string | null; timezone: string; save: (instant: string | null) => Promise<boolean>; disabled?: boolean }) {
  const { locale, t } = useUi(), c = workflowCopy[locale];
  const [value, setValue] = useState(''), [selected, setSelected] = useState(''), [busy, setBusy] = useState(false), [invalid, setInvalid] = useState(false);
  useEffect(() => { setValue(due ? accountLocalTime(due, timezone) : ''); setSelected(due ?? ''); }, [due, timezone]);
  const choices = useMemo(() => accountTimeChoices(value, timezone), [value, timezone]);
  const instant = selected && accountLocalTime(selected, timezone) === value ? selected : choices.length === 1 ? choices[0] : undefined;
  async function submit() {
    if (value && !instant) { setInvalid(true); return; }
    setInvalid(false); setBusy(true);
    try { await save(value ? instant! : null); } finally { setBusy(false); }
  }
  return <details className="review-reschedule"><summary>{c.schedule}</summary><p className="muted">{timezone}</p><fieldset disabled={busy || disabled}><div className="actions">{([1, 7] as const).map(days => <button className="secondary" type="button" key={days} onClick={() => { setValue(accountReviewPreset(new Date(), timezone, days)); setSelected(''); }}>{days === 1 ? c.tomorrow : c.week}</button>)}</div><label>{c.due}<input type="datetime-local" value={value} aria-invalid={invalid} onChange={event => { setValue(event.target.value); setSelected(''); }}/></label>{choices.length > 1 && <label>UTC<select value={selected} onChange={event => setSelected(event.target.value)}><option value="">—</option>{choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}</select></label>}{invalid && <p role="alert">{c.invalid}</p>}<div className="actions"><button type="button" onClick={() => void submit()}>{busy ? t('pending') : c.save}</button><button type="button" className="secondary" onClick={() => { setValue(''); setSelected(''); }}>{c.clear}</button></div></fieldset></details>;
}
