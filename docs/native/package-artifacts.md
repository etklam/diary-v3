# Native Shared Package Artifacts

The contracts, API client, and pure domain packages keep their workspace source
exports for repository development. `npm run native:packages:pack` builds a
separate staging tree, emits ESM and declarations for every public export, and
packs versioned tarballs under `dist/native-packages/artifacts` without editing
the source package manifests.

## Current artifact controls (2026-09-27)

The packer accepts `--out-dir <path>` for an explicit staging root and records
whether the source tree was dirty. It embeds the source commit, source-tree
hash, packer hash, OpenAPI hash and build metadata in each `PROVENANCE.json`,
and versions development artifacts from those inputs. The verifier accepts
`--packages-dir <path>` to validate an existing set; without it, the verifier
builds a temporary set before installing a fresh offline consumer. The output
is a local development artifact and is not a native release package.

The [2026-09-27 project cleanup audit](../audits/project-cleanup-2026-09-27.md)
records the current dependency and package-boundary evidence. It does not
claim an iOS/Android binary or simulator/device runtime.

Each staged version contains the source commit and a package source hash. The
staged API client and domain manifests pin the exact staged contracts version.
The contracts artifact declares its direct OpenAPI runtime dependency, which is
provided by the root workspace during source development. Every tarball embeds
`PROVENANCE.json`; the adjacent manifest records the tarball SHA-256 values and
the OpenAPI SHA-256 value.

The repository does not currently declare a license or contain a license file.
The artifact metadata records this as `null` and does not invent a package
license. Add an actual project license before distributing these packages
outside an authorized development context.

Run `npm run native:packages:test` for the package acceptance check. It creates
a fresh temporary consumer, installs the three real tarballs in offline mode,
imports every runtime export, and typechecks every export with NodeNext module
resolution. Offline installation depends on the external dependency versions
already being present in the npm cache; a missing cache entry is an environment
limitation rather than permission to resolve an internal `@diary/*` dependency
from a registry.

These artifacts prove package installation, ESM execution, declaration
resolution, and the shared source boundary. They do not prove React Native
networking, Keychain/Keystore behavior, process death restoration, or an iOS or
Android binary. Those claims still require a simulator or physical device.
