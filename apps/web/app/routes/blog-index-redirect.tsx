import { redirect } from 'react-router'

export function loader() { return redirect('/articles', 308) }

export default function BlogIndexRedirect() { return null }
