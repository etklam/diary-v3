import { useLoaderData } from 'react-router';
import { AuthForm } from '../auth-form';
import { publicPageMeta } from '../route-meta';
import { resolveAccountRecoverySupportUrl } from '../account-recovery-support.server';

export const meta = publicPageMeta('/login');

// The sign-in page offers recovery when either recovery path exists, and the
// support route is only knowable on the server.
export function loader() {
  return { supportUrl: resolveAccountRecoverySupportUrl(process.env.ACCOUNT_RECOVERY_SUPPORT_URL) };
}

export default function Login(){const{supportUrl}=useLoaderData<typeof loader>();return <AuthForm supportUrl={supportUrl}/>;}
