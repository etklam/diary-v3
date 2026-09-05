import { useEffect,useRef,useState } from 'react';
import { Link,useLocation } from 'react-router';
import { QuickComposer } from './quick-composer';
import { useSessionState } from './session';
import { useUi } from './ui';
export function QuickEntry(){const {t}=useUi(),session=useSessionState(),location=useLocation();const [open,setOpen]=useState(false),[saved,setSaved]=useState<string|null>(null);const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLElement|null>(null);
 function launch(){trigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setSaved(null);setOpen(true);}
 useEffect(()=>{const key=(event:KeyboardEvent)=>{const target=event.target;if(event.defaultPrevented||event.isComposing||event.altKey||event.shiftKey||!session.authenticated||location.pathname==='/diaries/quick')return;if(target instanceof HTMLElement&&(target.isContentEditable||target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]')))return;if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='j'){event.preventDefault();launch();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[session.authenticated,location.pathname]);
 useEffect(()=>{if(open)dialog.current?.showModal();else{dialog.current?.close();trigger.current?.focus();}},[open]);
 useEffect(()=>{if(session.authenticated===false){setOpen(false);setSaved(null);}},[session.authenticated]);
 return <>{session.authenticated&&location.pathname!=='/diaries/quick'&&<button className="secondary" type="button" data-testid="quick-entry" onClick={launch}>{t('quick')} <kbd>⌘ / Ctrl J</kbd></button>}{saved&&<p role="status"><Link reloadDocument to={`/diaries/${saved}`}>{t('saved')}</Link></p>}<dialog ref={dialog} className="capture-dialog" aria-labelledby="global-quick-title" onCancel={event=>{event.preventDefault();setOpen(false);}}><header className="capture-dialog-header"><h2 id="global-quick-title">{t('quick')}</h2><button type="button" className="secondary" autoFocus onClick={()=>setOpen(false)}>{t('close')}</button></header>{open&&<QuickComposer onSaved={id=>{setOpen(false);setSaved(id);}}/>}</dialog></>;
}
