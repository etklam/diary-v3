#!/usr/bin/env python3
"""Freeze a source-only worktree; never read env files, credentials or database dumps."""
import hashlib, json, pathlib, re, subprocess, sys, tarfile, io
source = pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '../diary-vue').resolve()
out = pathlib.Path(sys.argv[2] if len(sys.argv)>2 else 'docs/parity').resolve()
out.mkdir(parents=True, exist_ok=True)
def git(*args): return subprocess.check_output(['git','-C',str(source),*args])
files=sorted(set(git('ls-files','-z','--cached','--others','--exclude-standard').decode().split('\0'))-{''})
allowed_ext={'.ts','.tsx','.js','.mjs','.cjs','.vue','.json','.md','.css','.scss','.sql','.prisma','.sh','.yml','.yaml','.toml','.svg','.txt','.html'}
excluded=[]; manifest=[]
archive=out/'source-snapshot.tar.gz'
with tarfile.open(archive,'w:gz') as tar:
 for name in files:
  p=pathlib.Path(name)
  if name in {'lib/api-client/generated.ts','openapi/openapi.json'} or any(part in {'.git','node_modules','.nuxt','.output','coverage','test-results','playwright-report','backups','data','logs','.scratch'} for part in p.parts) or p.name.startswith('.env') or re.search(r'(secret|(?:^|/)credentials(?:[./]|$)|\.pem$|\.key$|\.dump$)',name,re.I) or (p.suffix not in allowed_ext and p.name not in {'Dockerfile','.dockerignore','.gitignore','captain-definition'}) or not (source/p).is_file():
   excluded.append(name); continue
  data=(source/p).read_bytes()
  # Fail closed on private key material and common live cloud-token formats.
  if re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}',data):
   excluded.append(name); continue
  entry={'path':name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'tracked':bool(git('ls-files','--',name).strip())}
  manifest.append(entry)
  info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o755 if p.suffix=='.sh' else 0o644;info.mtime=0;tar.addfile(info,io.BytesIO(data))
result={'head':git('rev-parse','HEAD').decode().strip(),'status':git('status','--porcelain').decode(),'files':manifest,'excluded':excluded,'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'policy':'Source-only allowlist, excludes env/secrets/data/dependencies/generated; files copied from worktree, not HEAD.'}
(out/'source-manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
# Diff only selected source paths; no excluded file can enter the patch.
(out/'source-worktree.patch').write_bytes(git('diff','HEAD','--',*[x['path'] for x in manifest if x['tracked']]))
print(json.dumps({'head':result['head'],'files':len(manifest),'excluded':len(excluded),'archive':str(archive),'status':result['status']}))
