import type { AlertResponse } from '@diary/contracts/alerts';
import { localTradeChoices, localTradeValue, resolveLocalTradeInstant } from './trade-time';
import { useUi } from './ui';
export type ReminderDraft = { key: string; message: string; time: string; instant: string; mode: '' | 'WEEK' | 'MONTH' };
export function reminderDrafts(rows: readonly AlertResponse[]): ReminderDraft[] {
  return rows.filter(row => !row.isDismissed && (!row.recurringMode || row.instanceNumber === 1)).map(row => ({ key: row.id, message: row.message, time: localTradeValue(new Date(row.triggerAt)), instant: row.triggerAt, mode: row.recurringMode ?? '' }));
}
export function reminderInputs(rows: readonly ReminderDraft[]) {
  return rows.map(row => ({ message: row.message, triggerAt: resolveLocalTradeInstant(row.time, row.instant) ?? '', ...(row.mode ? { recurringMode: row.mode } : {}) }));
}
export const reminderCopy = {
  en: { title: 'Diary reminders', message: 'Reminder message', time: 'Reminder time', mode: 'Repeat', once: 'Once', week: 'Weekdays through Friday', month: 'Weekdays through month end', add: 'Add reminder', remove: 'Remove reminder', device: 'Choose times in your device timezone:', recurrence: 'Repeated reminders run at 09:00 in your account timezone. A weekend weekly start begins next Monday; a monthly start uses the remaining weekdays of that month.', replace: 'Changing this list replaces existing reminders. Repeated series are generated again, including previously dismissed occurrences. Leave this list unchanged to preserve their state.', invalid: 'Check reminder messages and times. Choose a UTC instant when the clock repeats. Maximum 50 reminders.' },
  'zh-TW': { title: '日記提醒', message: '提醒訊息', time: '提醒時間', mode: '重複', once: '單次', week: '工作日至週五', month: '工作日至月底', add: '新增提醒', remove: '移除提醒', device: '使用裝置時區選擇時間：', recurrence: '重複提醒使用帳戶時區上午 09:00。每週起點在週末時，由下週一開始；每月提醒使用該月剩餘工作日。', replace: '修改清單會取代現有提醒，並重新產生重複提醒，包括先前已取消的次數。保持清單不變會保留原有狀態。', invalid: '請檢查提醒訊息及時間；時鐘重複時選擇 UTC 時刻。最多 50 筆提醒。' },
  'zh-CN': { title: '日记提醒', message: '提醒消息', time: '提醒时间', mode: '重复', once: '单次', week: '工作日至周五', month: '工作日至月底', add: '新增提醒', remove: '移除提醒', device: '使用设备时区选择时间：', recurrence: '重复提醒使用账户时区上午 09:00。每周起点在周末时，由下周一开始；每月提醒使用该月剩余工作日。', replace: '修改清单会替换现有提醒，并重新生成重复提醒，包括先前已取消的次数。保持清单不变会保留原有状态。', invalid: '请检查提醒消息及时间；时钟重复时选择 UTC 时刻。最多 50 条提醒。' },
};
export function AlertFields({ value, onChange, pending, editing }: { value: ReminderDraft[]; onChange: (rows: ReminderDraft[]) => void; pending: boolean; editing: boolean }) {
  const { locale } = useUi(), c = reminderCopy[locale];
  const update = (key: string, fields: Partial<ReminderDraft>) => onChange(value.map(row => row.key === key ? { ...row, ...fields } : row));
  return <fieldset className="original-fields" disabled={pending}><legend>{c.title}</legend><p className="muted">{c.device} {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>{editing && <p>{c.replace}</p>}
    {value.map((row, index) => <fieldset className="original-fields" key={row.key}><legend>{c.title} {index + 1}</legend><label>{c.message}<textarea aria-label={c.message} rows={2} required maxLength={500} value={row.message} onChange={event => update(row.key, { message: event.target.value })}/></label><label>{c.time}<input aria-label={c.time} type="datetime-local" required value={row.time} onChange={event => update(row.key, { time: event.target.value, instant: '' })}/></label>{localTradeChoices(row.time, row.instant).length > 1 && <label>UTC<select aria-label="UTC" required value={row.instant} onChange={event => update(row.key, { instant: event.target.value })}><option value="">—</option>{localTradeChoices(row.time, row.instant).map(instant => <option key={instant}>{instant}</option>)}</select></label>}<label>{c.mode}<select aria-label={c.mode} value={row.mode} onChange={event => update(row.key, { mode: event.target.value as ReminderDraft['mode'] })}><option value="">{c.once}</option><option value="WEEK">{c.week}</option><option value="MONTH">{c.month}</option></select></label>{row.mode && <p className="muted">{c.recurrence}</p>}<button className="secondary" type="button" onClick={() => onChange(value.filter(item => item.key !== row.key))}>{c.remove} {index + 1}</button></fieldset>)}
    <button type="button" className="secondary" disabled={value.length >= 50} onClick={() => onChange([...value, { key: crypto.randomUUID(), message: '', time: '', instant: '', mode: '' }])}>{c.add}</button>
  </fieldset>;
}
