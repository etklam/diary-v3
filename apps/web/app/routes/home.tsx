import { Link } from 'react-router';
import { useUi } from '../ui';
export function meta(){return [{title:'diary-v3 — 投資決策日記'}];}
export default function Home(){const {t}=useUi();return <section className="welcome"><h1>{t('title')}</h1><p className="lede">{t('intro')}</p><div className="actions"><Link className="button" to="/register">{t('register')}</Link><Link className="button secondary" to="/login">{t('login')}</Link></div><div className="welcome-note"><p>{t('private')}</p><Link to="/diaries/new">{t('write')}</Link></div></section>;}
