import { AuthForm } from '../auth-form';
import { publicPageMeta } from '../route-meta';

export const meta = publicPageMeta('/register');

export default function Register(){return <AuthForm register/>;}
