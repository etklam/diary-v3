import { AuthForm } from '../auth-form';
import { publicPageMeta } from '../route-meta';

export const meta = publicPageMeta('/login');

export default function Login(){return <AuthForm/>;}
