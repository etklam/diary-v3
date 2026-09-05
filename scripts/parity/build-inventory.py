#!/usr/bin/env python3
import pathlib,json,re,tarfile
root=pathlib.Path(__file__).resolve().parents[2]
manifest=json.loads((root/'docs/parity/source-manifest.json').read_text())
paths=[f['path'] for f in manifest['files']]
rules=[
('native-auth',r'auth/native|native-auth|native-refresh',[5,6]),('auth',r'auth/|auth\.ts|auth-session|jwt|csrf|bearer|password',[2,4,6]),
('settings',r'settings|Timezone|timezone|i18n|locales/',[7]),('api-keys',r'api-keys|api-key',[39]),('agent',r'agent/',[39,40]),
('review',r'diaries/.*/review|diary-review',[13]),('review-queue',r'reviews',[28]),('trade-plans',r'trade-plan',[14]),('quick-diary',r'quick|Quick',[9]),
('diary-activity',r'diaries/activity|investment-activity|timeline/index',[11,30]),('diary-calendar',r'calendar|diaries/summary|by-date|holidays',[12]),('diary',r'diar',[8,10,15,16,17]),
('partners',r'partners|timeline/compare',[37,38]),('thesis-review',r'thesis/reviews',[27]),('thesis',r'thesis',[26,27]),('evidence',r'evidence|stocks/.*/timeline|stocks/timeline',[25]),('notes',r'notes',[24]),('company',r'/hub\.|stocks/\[symbol\]\.vue',[29]),
('price-alerts',r'stocks/alerts|price-alert',[34]),('portfolio',r'portfolio|holdings|exposure|stocks/attention',[19,20]),('stocks-prices',r'stocks/prices',[18]),('stock-watchlist',r'stocks/watchlist|stocks/index',[23]),
('performance',r'stats/|strategy-performance|transactions/latest',[21,22]),('discipline-share',r'discipline/(export|import|share)|og/discipline',[36]),('discipline',r'discipline',[35]),('diary-alerts',r'alerts|alert-pusher|alert-scheduler',[31,32,33]),
('admin-market',r'admin/market|scripts/market-rotation',[43]),('admin-etf',r'admin/etf',[41]),('etf',r'etf/|etf-cache-cleaner',[42]),('market-state',r'market/state|market-state',[44]),('rotation',r'rotation',[43,45,46]),('market-data',r'market/|market-data',[18]),
('position-sizing',r'position-sizing',[47]),('financial-freedom',r'financial-freedom',[48]),('relative-value',r'relative-value',[49]),('seasonality',r'seasonality',[50]),('sec-documents',r'sec-filings.*(documents|package|accession)',[52]),('sec',r'sec-filings',[51]),
('admin-post-lifecycle',r'blog.*(publish|archive|delete)|blog/\[id\]\.delete',[55]),('admin-post',r'admin/blog|blog/(admin|index\.post|\[id\]\.put)',[54,55]),('public-post',r'blog|articles|sitemap',[56]),('admin-user',r'admin/users|admin/index|admin/stats',[57]),('health',r'health',[59]),('public-home',r'pages/(index|about|how-to-use)\.vue',[53]),('pwa',r'service-worker|sw\.|pwa',[58]),('websocket',r'websocket|socket',[33]),('deploy',r'Docker|docker|k8s|k3s|deploy|\.github',[59,60]),
]
issues={}
for p in (root/'.scratch/diary-v3-rebuild/issues').glob('*.md'):
 id=int(p.name[:2]); text=p.read_text(); line=re.search(r'User stories covered: (.+)',text)
 issues[id]={'file':str(p.relative_to(root)),'stories':re.findall(r'US-\d+',line[1]) if line else []}
entries=[]
for p in paths:
 kind='page' if p.startswith('pages/') and p.endswith('.vue') else 'api' if p.startswith('server/api/') and p.endswith('.ts') else 'job' if p.startswith(('server/schedulers/','scripts/market-','server/plugins/alert','server/plugins/etf-cache')) else 'sql-migration' if p.startswith('prisma/migrations/') and p.endswith('migration.sql') else None
 if not kind:continue
 group,ids='crosscutting',[1,61]
 for g,pattern,tickets in rules:
  if re.search(pattern,p):group,ids=g,tickets;break
 role='ADMIN' if '/admin/' in p or re.search(r'blog/(index.post|\[id\].(?:put|delete))',p) else 'scoped API key' if '/agent/' in p else 'guest (invalid explicit credentials still fail closed)' if group in {'public-home','public-post','market-data','sec','sec-documents','discipline-share','health'} else 'USER / job service' if kind in {'api','page'} else 'operator'
 stories=sorted(set(s for i in ids if i not in {1,61} for s in issues.get(i,{}).get('stories',[])))
 entries.append({'path':p,'kind':kind,'group':group,'roles':role,'tickets':ids,'stories':stories,'mappingStatus':'source entry inventory; behavior acceptance must be proven by owning ticket'})
prd=(root/'.scratch/diary-v3-rebuild/PRD.md').read_text()
stories=[]
shared={'98':['components/','layouts/','pages/'],'99':['assets/','nuxt.config.ts'],'100':['components/','layouts/'],'101':['nuxt.config.ts'],'102':['components/','composables/'],'103':['components/','pages/'],'104':['lib/api-client/','lib/contracts/'],'105':['lib/api-client/native-refresh.ts'],'106':['lib/contracts/'],'107':['scripts/openapi/'],'108':['lib/'],'109':['prisma/'],'110':['Dockerfile','k8s/'],'111':['lib/logger.ts','lib/observability.ts'],'112':['scripts/'],'113':['.github/','tests/'],'114':['CONTEXT.md','docs/WORKFLOWS.md']}
for number,text in re.findall(r'^(\d+)\. (作為.+)$',prd,re.M):
 sid=f'US-{int(number):03d}'; tids=[i for i,d in issues.items() if sid in d['stories']]; refs=[e['path'] for e in entries if sid in e['stories']]
 for prefix in shared.get(number,[]): refs.extend(p for p in paths if p.startswith(prefix))
 stories.append({'id':sid,'story':text,'tickets':sorted(tids),'sourceReferences':sorted(set(refs)),'verification':'pending owning-ticket acceptance'})
output={'sourceHead':manifest['head'],'entryCounts':{k:sum(e['kind']==k for e in entries) for k in ['page','api','job','sql-migration']},'entries':entries,'stories':stories,'notes':['Role labels are routing hints; middleware plus handler capability and ownership checks are authoritative.','SQL files include chronological ADD/DROP/remediation; legacy-final-constraints.tsv is the authoritative applied final state.','Some stories are crosscutting requirements introduced by the rebuild and intentionally reference source contracts or operations rather than one legacy page.']}
(root/'docs/parity/inventory.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'entries':output['entryCounts'],'stories':len(stories),'storiesWithoutSource':[s['id'] for s in stories if not s['sourceReferences']],'unclassifiedEntries':[e['path'] for e in entries if e['group']=='crosscutting' and e['kind']!='sql-migration']},ensure_ascii=False))
