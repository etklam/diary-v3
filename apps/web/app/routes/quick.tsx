import { useSearchParams } from 'react-router';
import { QuickComposer,QuickSavedState } from '../quick-composer';
import { useState } from 'react';
import { useUi } from '../ui';
import { parseCaptureContext } from '../capture-context';
export default function QuickDiaryPage(){const {t}=useUi();const [params]=useSearchParams();const parsed=parseCaptureContext(params);const [saved,setSaved]=useState<{id:string;captureContext:typeof parsed.context}|null>(null),[reset,setReset]=useState(0);return <section className="editor"><h1>{t('quick')}</h1>{saved?<QuickSavedState id={saved.id} captureContext={saved.captureContext} onNew={()=>{setSaved(null);setReset(value=>value+1);}}/>:<QuickComposer key={reset} initialDate={parsed.date} captureContext={parsed.context} captureIssue={parsed.issue} onSaved={(id,captureContext)=>setSaved({id,captureContext: captureContext??null})}/>}</section>;}
