#!/usr/bin/env python3
"""Validate frozen artifact integrity, exhaustive story/entry mapping and source drift."""
import hashlib,json,pathlib,tarfile,sys,subprocess
root=pathlib.Path(__file__).resolve().parents[2];folder=root/'docs/parity'
m=json.loads((folder/'source-manifest.json').read_text());i=json.loads((folder/'inventory.json').read_text())
archive=folder/'source-snapshot.tar.gz'
assert hashlib.sha256(archive.read_bytes()).hexdigest()==m['archiveSha256'],'Archive hash mismatch'
with tarfile.open(archive) as tar:
 members={x.name:x for x in tar.getmembers()}
 assert set(members)=={x['path'] for x in m['files']}
 for f in m['files']:
  assert hashlib.sha256(tar.extractfile(members[f['path']]).read()).hexdigest()==f['sha256'],f['path']
assert len(i['stories'])==114
assert {s['id'] for s in i['stories']}=={f'US-{n:03d}' for n in range(1,115)}
assert all(s['sourceReferences'] and s['tickets'] for s in i['stories'])
assert i['entryCounts']['page']==43 and i['entryCounts']['api']==124
assert all(e['tickets'] for e in i['entries'])
if '--runtime' in sys.argv:
 evidence=json.loads((folder/'legacy-runtime-evidence.json').read_text())
 fixtures=json.loads((root/'tests/parity/legacy-contract-fixtures.json').read_text())
 assert evidence['flow']==fixtures['diary']['flow']
 assert [{'length':p['length'],'status':p['status']} for p in evidence['knownDeltas']]==fixtures['diary']['knownLegacyBug']['probes']
 assert [{'term':p['term'],'total':p['total']} for p in evidence['search']]==fixtures['publicSearch']['queries']
 assert all(p['status']==200 for p in evidence['search'])
 assert (folder/'legacy-final-constraints.tsv').stat().st_size>0
if '--source' in sys.argv:
 source=pathlib.Path(sys.argv[sys.argv.index('--source')+1]).resolve()
 drift=[f['path'] for f in m['files'] if not (source/f['path']).is_file() or hashlib.sha256((source/f['path']).read_bytes()).hexdigest()!=f['sha256']]
 current=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
 assert current==m['head'] and not drift,f'Source drift: HEAD={current}; changed={drift}'
print('PASS: frozen source hashes; 43 pages / 124 APIs; all 114 stories have source and ticket mappings.')
