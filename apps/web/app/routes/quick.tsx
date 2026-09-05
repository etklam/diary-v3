import { useSearchParams } from 'react-router';
import { calendarDateSchema } from '@diary/contracts';
import { QuickComposer } from '../quick-composer';
import { useUi } from '../ui';
export default function QuickDiaryPage(){const {t}=useUi();const [params]=useSearchParams();const date=calendarDateSchema.safeParse(params.get('date'));return <section className="editor"><h1>{t('quick')}</h1><QuickComposer initialDate={date.success?date.data:undefined}/></section>;}
