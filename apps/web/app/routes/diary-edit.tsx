import { useEffect,useState } from 'react';
import { Link,useParams } from 'react-router';
import { api,useUi } from '../ui';
import { diaryCopy } from '../diary-copy';
import { DiaryEditor,type DiaryFields } from '../diary-editor';
import { apiFailure,FailureNotice,type Failure } from '../api-error';
import { signInPath } from '../session';
export default function EditDiary(){const {id}=useParams();const {t,locale}=useUi();const labels=diaryCopy[locale];const [entry,setEntry]=useState<DiaryFields|null>(null);const [error,setError]=useState<Failure|null>(null);
 async function load(){setError(null);try{const response=await api.GET('/api/diaries/{id}',{params:{path:{id:id??''}}});if(response.response.ok&&response.data){const diary=response.data;setEntry({...diary,content:diary.content??'',thesis:diary.thesis??null,risk:diary.risk??null,execution:diary.execution??null});}else setError(apiFailure(response.error,t('failed')));}catch{setError(apiFailure(null,t('connection')));}}
 useEffect(()=>{void load();},[id]);
 return <section className="editor"><h1>{labels.edit}</h1>{error?<><FailureNotice failure={error}/><button onClick={()=>void load()}>{t('retry')}</button><Link className="inline-link" to={signInPath(`/diaries/${id}/edit`)}>{t('login')}</Link></>:entry?<DiaryEditor key={id} initial={entry} id={id}/>:<p role="status">{t('loading')}</p>}</section>;
}
