import { useEffect,useRef,useState } from 'react';
import { Link,useLocation } from 'react-router';
import { QuickComposer,QuickSavedState } from './quick-composer';
import { useSessionState } from './session';
import { useUi } from './ui';
import { Icon } from './icons';
import type { CaptureContext } from './capture-context';

type Locale = 'zh-TW' | 'zh-CN' | 'en';
const captureCopy: Record<Locale, { more: string; write: string }> = {
 'zh-TW': { more: '其他記錄方式', write: '寫完整日記' },
 'zh-CN': { more: '其他记录方式', write: '写完整日记' },
 en: { more: 'More ways to record', write: 'Write a full diary' },
};

export function CaptureChoices({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
 const { locale, t } = useUi();
 const c = captureCopy[locale];
 const disclosure = useRef<HTMLDetailsElement>(null);
 function closeDisclosure(focus = false) {
  disclosure.current?.removeAttribute('open');
  if (focus) disclosure.current?.querySelector<HTMLElement>('summary')?.focus();
 }
 useEffect(() => {
  const onPointerDown = (event: PointerEvent) => {
   if (!disclosure.current?.contains(event.target as Node)) closeDisclosure();
  };
  document.addEventListener('pointerdown', onPointerDown);
  return () => document.removeEventListener('pointerdown', onPointerDown);
 }, []);
 const navigate = () => { closeDisclosure(); onNavigate?.(); };
 return <>
  <Link className="button quick-capture-primary" data-testid={mobile ? 'mobile-quick-entry' : 'quick-entry'} to="/diaries/quick" onClick={navigate}>{t('quick')}</Link>
  {!mobile && <details ref={disclosure} className="quick-capture-disclosure" onKeyDown={event => { if (event.key === 'Escape' && disclosure.current?.open) { event.preventDefault(); closeDisclosure(true); } }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeDisclosure(); }} onClick={event => { if (event.target instanceof Element && event.target.closest('a')) closeDisclosure(); }}>
    <summary aria-label={c.more}><Icon name="chevronDown" size={17} /></summary>
    <div className="quick-capture-options"><Link to="/diaries/new" onClick={navigate}><Icon name="pen" />{c.write}</Link></div>
  </details>}
 </>;
}

export function QuickEntry(){const {t}=useUi(),session=useSessionState(),location=useLocation();const [open,setOpen]=useState(false),[saved,setSaved]=useState<{id:string;captureContext:CaptureContext|null}|null>(null),[focusContent,setFocusContent]=useState(false),[reset,setReset]=useState(0);const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLElement|null>(null);
 function launch(keyboard=false){trigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setSaved(null);setFocusContent(keyboard);setReset(value=>value+1);setOpen(true);}
 useEffect(()=>{const key=(event:KeyboardEvent)=>{const target=event.target;if(event.defaultPrevented||event.isComposing||event.altKey||event.shiftKey||!session.authenticated||location.pathname==='/diaries/quick')return;if(target instanceof HTMLElement&&(target.isContentEditable||target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]')))return;if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='j'){event.preventDefault();launch(true);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[session.authenticated,location.pathname]);
 useEffect(()=>{if(open)dialog.current?.showModal();else{dialog.current?.close();trigger.current?.focus();}},[open]);
 useEffect(()=>{if(session.authenticated===false){setOpen(false);setSaved(null);}},[session.authenticated]);
 return <>{session.authenticated&&location.pathname!=='/diaries/quick'&&<div className="quick-entry-controls"><CaptureChoices/><span className="quick-entry-shortcut"><kbd>⌘ / Ctrl J</kbd></span></div>}<dialog ref={dialog} className="capture-dialog" aria-labelledby="global-quick-title" onCancel={event=>{event.preventDefault();setOpen(false);}}><header className="capture-dialog-header"><h2 id="global-quick-title">{t('quick')}</h2><button type="button" className="secondary" autoFocus onClick={()=>setOpen(false)}>{t('close')}</button></header>{open&&!saved&&<QuickComposer key={reset} autoFocusContent={focusContent} onNavigate={()=>setOpen(false)} onSaved={(id,captureContext)=>{setSaved({id,captureContext:captureContext??null});setFocusContent(false);}}/>}{open&&saved&&<QuickSavedState id={saved.id} captureContext={saved.captureContext} onNavigate={()=>setOpen(false)} onNew={()=>{setSaved(null);setFocusContent(false);setReset(value=>value+1);}}/>}</dialog></>;
}
