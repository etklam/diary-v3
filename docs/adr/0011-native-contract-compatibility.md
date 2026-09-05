# Native contract compatibility

Status: accepted. Date: 2026-09-06.

This rebuild establishes the first native-compatible API baseline. The checked-in OpenAPI document, runtime schemas and standard-fetch client define that baseline; there is no previously released diary-v3 native application to migrate. The existing native integration test composes the storage transport with the generated client and performs real Diary create/read against PostgreSQL.

Keep existing `/api` native behavior compatible after this release. Add optional request fields and additive response fields without changing existing ID, decimal-string, civil-date, pagination or error-envelope meanings. Do not rename/remove required fields, narrow accepted values, silently change refresh replay rules or introduce browser-cookie requirements into native requests.

A breaking change requires a separate explicitly versioned endpoint/contract and a documented deprecation period while the original contract remains available to older installed clients. Review OpenAPI changes against the release baseline; regenerating a client and passing drift checks alone does not establish backward compatibility. New API versions must retain a runnable previous-client fixture until that version's announced support window ends.

This is a compatibility decision for future releases, not a claim that an unbuilt React Native application has been tested. Push and offline writing remain deferred as the user approved.
