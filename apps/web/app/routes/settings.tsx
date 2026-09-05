import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, useUi } from '../ui';
import { apiFailure, FailureNotice, invalidField, type Failure } from '../api-error';
import { signInPath, useSessionState } from '../session';
import './settings.css';

const copy = {
  'zh-TW': { title:'偏好設定', intro:'設定日記使用的語言、日期時區與投資目標。', profile:'個人偏好', name:'名稱', language:'帳戶語言', timezone:'日期時區', deviceTimezone:'使用裝置時區', timezoneHint:'日記預設日期使用此時區，不會跟隨瀏覽器改變。例如 Asia/Taipei 或 America/New_York。', trades:'每月預期交易次數', profit:'預期獲利金額', holding:'預期平均持倉金額', targets:'投資目標', holidays:'統計時排除假日', holidaysHint:'保留這項統計偏好，供交易統計使用。', save:'儲存設定', saved:'設定已儲存。', login:'請先登入，再管理個人偏好。', exact:'金額會儲存至小數點後兩位。', security:'管理密碼與裝置' },
  'zh-CN': { title:'偏好设置', intro:'设置日记使用的语言、日期时区与投资目标。', profile:'个人偏好', name:'名称', language:'账户语言', timezone:'日期时区', deviceTimezone:'使用设备时区', timezoneHint:'日记默认日期使用此时区，不会跟随浏览器改变。例如 Asia/Taipei 或 America/New_York。', trades:'每月预期交易次数', profit:'预期盈利金额', holding:'预期平均持仓金额', targets:'投资目标', holidays:'统计时排除假日', holidaysHint:'保留这项统计偏好，供交易统计使用。', save:'保存设置', saved:'设置已保存。', login:'请先登录，再管理个人偏好。', exact:'金额会保存至小数点后两位。', security:'管理密码与设备' },
  en: { title:'Preferences', intro:'Choose your diary language, date timezone, and investment targets.', profile:'Personal preferences', name:'Name', language:'Account language', timezone:'Date timezone', deviceTimezone:'Use device timezone', timezoneHint:'New diary dates use this timezone, independently of your browser. For example, Asia/Taipei or America/New_York.', trades:'Expected monthly trades', profit:'Expected profit amount', holding:'Expected average holding amount', targets:'Investment targets', holidays:'Exclude holidays from statistics', holidaysHint:'Keep this preference for trading statistics.', save:'Save preferences', saved:'Preferences saved.', login:'Sign in to manage your preferences.', exact:'Amounts are saved to two decimal places.', security:'Manage password and devices' },
};
type FormValues = { name:string; locale:'zh-TW'|'zh-CN'|'en'; timezone:string; expectedMonthlyTrades:string; expectedProfit:string; expectedAvgHolding:string; excludeHolidaysInStats:boolean };

export default function Settings() {
  const { locale, t, applyLocale } = useUi();
  const text = copy[locale];
  const session = useSessionState();
  const [isAdmin,setIsAdmin] = useState(false);
  useEffect(()=>{const controller=new AbortController();api.GET('/api/auth/me',{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setIsAdmin(result.data?.data.role==='ADMIN');}).catch(()=>{});return()=>controller.abort();},[]);
  const [form,setForm] = useState<FormValues|null>(null);
  const [auth,setAuth] = useState<'loading'|'ready'|'unauthorized'|'error'>('loading');
  const [failure,setFailure] = useState<Failure|null>(null);
  const [pending,setPending] = useState(false);
  const [saved,setSaved] = useState(false);
  async function load() {
    setAuth('loading');
    try {
      const result = await api.GET('/api/user/settings');
      if (result.response.ok && result.data) {
        const settings = result.data.settings;
        setForm({ ...settings, name:settings.name??'', expectedMonthlyTrades:String(settings.expectedMonthlyTrades) });
        setAuth('ready');
      } else setAuth(result.response.status===401?'unauthorized':'error');
    } catch { setAuth('error'); }
  }
  useEffect(()=>{void load();},[]);
  function update<K extends keyof FormValues>(key:K,value:FormValues[K]) {
    setForm(current=>current?{...current,[key]:value}:current); setSaved(false);
  }
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(!form) return;
    setPending(true);setFailure(null);setSaved(false);
    try {
      const result=await api.PUT('/api/user/settings',{body:{...form,expectedMonthlyTrades:Number(form.expectedMonthlyTrades)}});
      if(result.response.ok&&result.data){const settings=result.data.settings;setForm({...settings,name:settings.name??'',expectedMonthlyTrades:String(settings.expectedMonthlyTrades)});applyLocale(settings.locale);setSaved(true);}
      else setFailure(apiFailure(result.error,t('failed')));
    } catch {setFailure(apiFailure(null,t('connection')));}
    finally {setPending(false);}
  }
  return <section className="settings-page"><h1>{text.title}</h1><p className="lede">{text.intro}</p>
    {session.authenticated===false||auth==='unauthorized'?<><p>{text.login}</p><Link className="button" to={signInPath('/settings')}>{t('login')}</Link></>
      :auth==='loading'?<p role="status">{t('loading')}</p>:auth==='error'?<><p role="alert">{t('connection')}</p><button onClick={()=>void load()}>{t('retry')}</button></>
        :form&&<form onSubmit={save} aria-busy={pending}>
          <fieldset disabled={pending}><legend>{text.profile}</legend>
            <label>{text.name}<input name="name" autoComplete="name" maxLength={100} value={form.name} onChange={e=>update('name',e.target.value)} aria-invalid={invalidField(failure,'name')} aria-describedby={failure?'settings-error':undefined}/></label>
            <label>{text.language}<select name="locale" value={form.locale} onChange={e=>update('locale',e.target.value as FormValues['locale'])}><option value="zh-TW">繁體中文</option><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>
            <label>{text.timezone}<input name="timezone" list="timezone-options" required maxLength={50} value={form.timezone} onChange={e=>update('timezone',e.target.value)} aria-invalid={invalidField(failure,'timezone')} aria-describedby={`timezone-hint${failure?' settings-error':''}`}/></label>
            <datalist id="timezone-options">{['Asia/Taipei','Asia/Hong_Kong','Asia/Shanghai','Asia/Tokyo','America/New_York','America/Los_Angeles','Europe/London','UTC'].map(zone=><option key={zone} value={zone}/>)}</datalist>
            <button type="button" className="secondary device-timezone" onClick={()=>update('timezone',Intl.DateTimeFormat().resolvedOptions().timeZone)}>{text.deviceTimezone}</button>
            <p className="muted" id="timezone-hint">{text.timezoneHint}</p>
          </fieldset>
          <fieldset disabled={pending}><legend>{text.targets}</legend>
            <label>{text.trades}<input name="expectedMonthlyTrades" type="number" min={0} max={2147483647} step={1} required value={form.expectedMonthlyTrades} onChange={e=>update('expectedMonthlyTrades',e.target.value)} aria-invalid={invalidField(failure,'expectedMonthlyTrades')} aria-describedby={failure?'settings-error':undefined}/></label>
            <label>{text.profit}<input name="expectedProfit" inputMode="decimal" required value={form.expectedProfit} onChange={e=>update('expectedProfit',e.target.value)} aria-invalid={invalidField(failure,'expectedProfit')} aria-describedby={`amount-hint${failure?' settings-error':''}`}/></label>
            <label>{text.holding}<input name="expectedAvgHolding" inputMode="decimal" required value={form.expectedAvgHolding} onChange={e=>update('expectedAvgHolding',e.target.value)} aria-invalid={invalidField(failure,'expectedAvgHolding')} aria-describedby={`amount-hint${failure?' settings-error':''}`}/></label>
            <p className="muted" id="amount-hint">{text.exact}</p>
            <label className="holiday-option"><input name="excludeHolidaysInStats" type="checkbox" checked={form.excludeHolidaysInStats} onChange={e=>update('excludeHolidaysInStats',e.target.checked)} aria-describedby="holiday-hint"/>{text.holidays}</label><p className="muted" id="holiday-hint">{text.holidaysHint}</p>
          </fieldset>
          <FailureNotice failure={failure} id="settings-error"/><div className="settings-actions"><button type="submit" disabled={pending}>{pending?t('pending'):text.save}</button><p role="status">{saved?text.saved:pending?t('pending'):''}</p></div>
        </form>}
    <p className="settings-security">{isAdmin&&<><Link to="/admin/etf">{locale==='en'?'Manage ETF catalog':locale==='zh-CN'?'管理 ETF 目录':'管理 ETF 目錄'}</Link> · </>}<Link to="/settings/api-keys">{locale==='en'?'Manage API keys':locale==='zh-CN'?'管理 API 密钥':'管理 API 金鑰'}</Link> · <Link to="/settings/security">{text.security}</Link></p>
  </section>;
}
