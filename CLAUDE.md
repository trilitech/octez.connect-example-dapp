<!-- SPECKIT START -->
**Active feature**: `002-remove-taquito-ops` — remove the 7 read-only `rpc-read` operations (the `view-data` category + `contracts.read-storage`, `contracts.run-view`, `tokens.fa2-balance-read`) that octez.connect doesn't perform ("require taquito"); remove the now-empty "Run all (safe)" mode (retire `safeForRunAll`/`runType`, single Run-all remains); bump bundled+default SDK to octez.connect 4.8.6 and verify the 21 retained wallet/sign operations succeed on it.

**Plan**: `specs/002-remove-taquito-ops/plan.md`
**Spec**: `specs/002-remove-taquito-ops/spec.md`
**Research**: `specs/002-remove-taquito-ops/research.md`
**Data model**: `specs/002-remove-taquito-ops/data-model.md`
**Contracts**: `specs/002-remove-taquito-ops/contracts/` (test-registry-types, verification-matrix)
**Quickstart**: `specs/002-remove-taquito-ops/quickstart.md`

Prior feature: `001-playground-upgrade` (the playground itself). Read the 002 artifacts for the removal criterion, persisted-history compatibility rules, and the 4.8.6 verification recipe.
<!-- SPECKIT END -->
