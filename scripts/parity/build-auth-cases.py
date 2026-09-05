#!/usr/bin/env python3
"""Extract focused auth parity prior-art test cases from the frozen source."""
import pathlib,tarfile,re,json
root=pathlib.Path(__file__).resolve().parents[2]
files=['tests/integration/http/auth.contract.test.ts','tests/integration/auth-credential-resolution.test.ts','tests/integration/native-client/native-client.smoke.test.ts','tests/unit/server/native-auth-session.test.ts','tests/unit/server/auth.middleware.test.ts','tests/unit/server/csrf.middleware.test.ts','tests/unit/server/auth.cookies.test.ts','tests/unit/auth-client-regressions.test.ts']
cases=[]
with tarfile.open(root/'docs/parity/source-snapshot.tar.gz') as t:
 for path in files:
  for line,text in enumerate(t.extractfile(path).read().decode().splitlines(),1):
   match=re.search(r"\b(?:it|test)\(\s*(['\"])(.+?)\1",text)
   if match:cases.append({'source':path,'line':line,'case':match[2],'newImplementationVerification':'pending: reuse assertions against real Hono/PostgreSQL where applicable'})
(root/'tests/parity/auth-prior-art.json').write_text(json.dumps({'tickets':[4,5,6,39],'sourceHead':'47f8313bf29870b52582db97209bef2e1cbe41ce','cases':cases,'boundaryNotes':['Web refresh is deliberately stable for concurrent browser sessions; do not rotate as Native.','Native concurrent rotation must have one winner. Replaying A after A→B revokes that family, including B, while other device families survive.','Logout-one revokes refresh family but old access JWT may survive until expiry; logout-all/password changes increment tokenVersion and disconnect sockets.','Invalid explicit Bearer or API key, including on public routes, fails closed; never fallback to valid browser cookies. Multiple explicit credential sources are ambiguous.','Only verified Bearer/scoped API-key requests bypass CSRF. Cookie mutations require CSRF, including logout-all.','Standard fetch native refresh must coordinate one refresh request for concurrent protected401 responses, retry each once, and never recurse bootstrap endpoints.','Old native smoke test is prior art, not sufficient new acceptance: ticket05 must use actual Hono/PostgreSQL.']},ensure_ascii=False,indent=2)+'\n')
print(f'{len(cases)} focused auth prior-art cases extracted')
