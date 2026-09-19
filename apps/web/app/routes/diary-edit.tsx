import { useEffect,useState } from 'react';
import { Link,useLocation,useParams } from 'react-router';
import { api,useUi } from '../ui';
import { diaryCopy } from '../diary-copy';
import { DiaryEditor,type DiaryFields } from '../diary-editor';
import { apiFailure,FailureNotice,type Failure } from '../api-error';
import { safeReturnPath,signInPath } from '../session';
export default function EditDiary(){const {id}=useParams();const location=useLocation();const {t,locale}=useUi();const labels=diaryCopy[locale];const [entry,setEntry]=useState<DiaryFields|null>(null);const [error,setError]=useState<Failure|null>(null);const [accountId,setAccountId]=useState('');
 const rawReturnTo=new URLSearchParams(location.search).get('returnTo');const returnTo=rawReturnTo&&safeReturnPath(rawReturnTo)===rawReturnTo?rawReturnTo:null;const focusSchedule=location.hash==='#review-schedule';
 async function load(){setError(null);try{const response=await api.GET('/api/diaries/{id}',{params:{path:{id:id??''}}});if(response.response.ok&&response.data){const diary=response.data;setEntry({...diary,content:diary.content??'',thesis:diary.thesis??null,risk:diary.risk??null,execution:diary.execution??null});setAccountId(diary.userId);}else setError(apiFailure(response.error,t('failed')));}catch{setError(apiFailure(null,t('connection')));}}
 useEffect(()=>{void load();},[id]);
 const continuation=`/diaries/${id}/edit${returnTo?`?returnTo=${encodeURIComponent(returnTo)}`:''}${focusSchedule?'#review-schedule':''}`;
 return <section className="editor"><h1>{labels.edit}</h1>{error?<><FailureNotice failure={error}/><button onClick={()=>void load()}>{t('retry')}</button><Link className="inline-link" to={signInPath(continuation)}>{t('login')}</Link></>:entry?<DiaryEditor key={id} initial={entry} id={id} accountId={accountId||undefined} returnTo={returnTo} focusSchedule={focusSchedule}/>:<p role="status">{t('loading')}</p>}</section>;
}
