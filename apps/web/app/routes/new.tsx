import { calendarDateInTimezone } from '@diary/domain';
import { signInPath } from '../session';
import { useEffect,useState } from 'react';
import { diaryCopy } from '../diary-copy';
import { Link,useLocation } from 'react-router';
import { api,ErrorMessage,useUi } from '../ui';
import { DiaryEditor } from '../diary-editor';
export default function NewDiary({quick=false}:{quick?:boolean}={}){const {t,locale}=useUi();const location=useLocation();const [auth,setAuth]=useState<'loading'|'ready'|'unauthorized'|'error'>('loading');const [date,setDate]=useState('');const [accountId,setAccountId]=useState('');
 async function check(){setAuth('loading');try{const result=await api.GET('/api/auth/me');setAuth(result.response.ok?'ready':result.response.status===401?'unauthorized':'error');if(result.data){setDate(calendarDateInTimezone(new Date(),result.data.data.timezone));setAccountId(result.data.data.id);}}catch{setAuth('error');}}
 useEffect(()=>{void check();},[]);
 return <section className="editor">{location.state?.deleted&&<p role="status">{diaryCopy[locale].deleted}</p>}<header>{quick?<h2 id="quick-title">{t('quick')}</h2>:<h1>{t('newTitle')}</h1>}<p className="lede">{t('newHint')}</p></header>{auth==='loading'?<p role="status">{t('loading')}</p>:auth==='unauthorized'?<div><p>{t('loginRequired')}</p><Link className="button" to={signInPath(typeof window==='undefined'?'/diaries/new':window.location.pathname)}>{t('login')}</Link></div>:auth==='error'?<div><ErrorMessage message={t('connection')}/><button onClick={()=>void check()}>{t('retry')}</button></div>:<DiaryEditor quick={quick} accountId={accountId||undefined} initial={{date,title:'',content:'',tags:[],thesis:null,risk:null,execution:null}}/>}</section>;}
