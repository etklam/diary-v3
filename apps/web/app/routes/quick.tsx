import { useSearchParams } from 'react-router';
import { QuickComposer } from '../quick-composer';
import { useUi } from '../ui';
import { parseCaptureContext } from '../capture-context';
export default function QuickDiaryPage(){const {t}=useUi();const [params]=useSearchParams();const parsed=parseCaptureContext(params);return <section className="editor"><h1>{t('quick')}</h1><QuickComposer initialDate={parsed.date} captureContext={parsed.context} captureIssue={parsed.issue}/></section>;}
