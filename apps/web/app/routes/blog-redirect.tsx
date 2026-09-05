import { redirect, type LoaderFunctionArgs } from 'react-router'

export function loader({ params }: LoaderFunctionArgs) {
  return redirect(params.slug ? `/articles/${encodeURIComponent(params.slug)}` : '/articles', 308)
}

export default function BlogRedirect() { return null }
