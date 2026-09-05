import { useState, type ReactNode } from 'react';
import { useUi } from './ui';
import { performanceCopy } from './performance-copy';
export function PerformanceTable({ title, headers, rows }: { title: string; headers: string[]; rows: ReactNode[][] }) {
  const { locale } = useUi(), c = performanceCopy[locale], [requestedPage, setPage] = useState(0), count = Math.max(1, Math.ceil(rows.length / 50)), page = Math.min(requestedPage, count - 1);
  return <>{!rows.length ? <p>{c.none}</p> : <><div className="holdings-table"><table aria-label={title}><thead><tr>{headers.map((header, index) => <th key={index} scope="col">{header}</th>)}</tr></thead><tbody>{rows.slice(page * 50, page * 50 + 50).map((row, index) => <tr key={page * 50 + index}>{row.map((cell, index) => index === 0 ? <th scope="row" key={index}>{cell}</th> : <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div>{count > 1 && <nav className="performance-pages" aria-label={title}><button disabled={page === 0} onClick={() => setPage(page - 1)}>{c.previous}</button><span>{c.page} {page + 1} / {count}</span><button disabled={page === count - 1} onClick={() => setPage(page + 1)}>{c.next}</button></nav>}</>}</>;
}
