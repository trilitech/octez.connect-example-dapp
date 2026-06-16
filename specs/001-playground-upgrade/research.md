# Phase 0 — Research

Source spec: [spec.md](./spec.md). Plan: [plan.md](./plan.md). No `NEEDS CLARIFICATION` remained after `/speckit-clarify`. This document captures the technical decisions, the rationale, and the alternatives considered for each non-trivial integration / dependency point.

---

## R1. Runtime SDK loading via esm.sh

**Decision**: load `@tezos-x/octez.connect-dapp@<version>` from `https://esm.sh/@tezos-x/octez.connect-dapp@<version>` using a **bundler-opaque** dynamic import:

```ts
// In sdk-loader.service.ts (illustrative — not implementation)
const dynImport: (u: string) => Promise<unknown> = new Function('u', 'return import(u)') as any
const mod = await Promise.race([
  dynImport(`https://esm.sh/@tezos-x/octez.connect-dapp@${version}`),
  new Promise((_, rej) => setTimeout(() => rej(new Error('cdn-timeout')), 10_000)),
])
```

**Rationale**:
- Angular/Webpack rewrites bare-string `import()` URLs at build time. A `new Function('u', 'return import(u)')` constructor produces a function whose body the bundler cannot statically analyze, so the URL is preserved verbatim at runtime.
- esm.sh serves npm packages as ES modules and resolves the dependency tree at the edge (HTTP 200 verified during spec for versions `4.8.5`, `5.0.0-beta.3` → `5.0.0-beta.6`).
- The 10 s `Promise.race` honors Clarification Q2 — covers both explicit errors and hung CDN.

**Alternatives considered**:
- **Static `import()` with a `webpackIgnore: true` magic comment**: works on Webpack 5 but locks us to a specific bundler's escape hatch; the `Function` recipe is bundler-agnostic.
- **`<script type="module">` injection at runtime**: viable but requires marshalling the resulting module promise back into Angular's DI; the dynamic-import recipe is much shorter.
- **Self-hosting the SDK builds**: defeats the purpose of comparing against any published version.

---

## R2. Bundled-package fallback strategy

**Decision**: on CDN error or 10 s timeout, fall back to `import('@tezos-x/octez.connect-dapp')` (the package bundled at build time, currently `4.8.5`). Surface an Ionic `ToastController` notice describing the fallback.

**Rationale**:
- The bundled package is always present (`dependencies` in `package.json`). Falling back to it keeps the playground usable offline / behind firewalls / when esm.sh is degraded.
- Per FR-052 the fallback is required to be user-visible; a toast is cheap and non-blocking.

**Alternatives considered**:
- **Hard error / refuse to load**: rejected — UX hostile, especially since the dapp is meant to be approachable.
- **Retry the CDN with exponential backoff**: rejected — slow paths to user value; the user can manually pick a different version via the selector if needed.

---

## R3. Type-only static imports

**Decision**: keep `import type { DAppClient, AccountInfo, NetworkType, SigningType, BeaconEvent, … } from '@tezos-x/octez.connect-dapp'` at the top of files that need the types; obtain **runtime values** (`new DAppClient(...)`, enum values) exclusively from `SdkLoaderService.load()`. Use TS 4.9's `import type` syntax so the import is erased at build.

**Rationale**:
- TypeScript 4.9 (already in the project) fully supports `import type` erasure: `tsc` removes such imports from emitted JS, so no fixed-version runtime binding is created.
- This satisfies FR-053 / SC-014 while still giving us full IDE / type-checking against the SDK API.

**Alternatives considered**:
- **Hand-rolled type declarations**: rejected — duplicative; the bundled version IS the type source.
- **`typeof import(...)` patterns**: workable but harder to read than the explicit `import type` syntax.

---

## R4. Sign-payload micheline-pack framing

**Decision**: implement `buildSignPayload(message, signingType)` in `src/app/utils/sign-payload.ts`:

```text
MICHELINE / RAW:
  '05' + '01' + <4-byte big-endian length as 8 hex chars> + <utf8 hex of message>
OPERATION:
  ensure payload starts with '03' (forging prefix)
LENGTH:
  Buffer.from(message, 'utf8').length  ← UTF-8 byte length, NOT message.length
```

Default `signingType` is `'micheline'` (string literal, version-agnostic per FR-054).

**Rationale**:
- The `0x05` prefix is the Micheline "expression" tag; `0x01` is the "string" tag; the 4-byte length is the byte count of the payload that follows; the body is the UTF-8 hex of the message. Wallets (Beacon-compatible) accept and sign exactly this shape for MICHELINE-typed payloads.
- For OPERATION-typed payloads, the wallet expects a `0x03`-prefixed forged operation; we just defend against missing prefix here.
- Spec §FR-006 mandates UTF-8 byte length, not string length — required so non-ASCII messages frame correctly.

**Alternatives considered**:
- **Always force MICHELINE**: rejected — the playground exposes RAW and OPERATION-typed signing tests as distinct scenarios.
- **Use a Michelson-encoder library**: rejected — no new deps; the framing is 10 lines using the global `Buffer` polyfill.

---

## R5. RPC endpoints consumed

**Decision**: Angular `HttpClient` over `NetworkConfig.rpc`. Endpoints (paths only, base from active network):

| Use | Method + Path | Test(s) |
|---|---|---|
| Account balance read | `GET /chains/main/blocks/head/context/contracts/{addr}/balance` | view-data: Account balance |
| Block inspection | `GET /chains/main/blocks/{N}` | view-data: Block inspection |
| Contract events poll | `GET /chains/main/blocks/{N}/operations` | view-data: Contract events poll |
| Contract storage read | `GET /chains/main/blocks/head/context/contracts/{kt}/storage` | contracts: Read contract storage |
| Run view (script) | `POST /chains/main/blocks/head/helpers/scripts/run_script_view` (body: `{ contract, view, input, chain_id, source?, payer?, gas?, unparsing_mode }`) | contracts: Contract view execution |
| Entrypoints fallback | `GET /chains/main/blocks/head/context/contracts/{kt}/entrypoints` | dynamic-contract panel (when indexer unreachable) |

**Rationale**: all read-only, vanilla Tezos RPC; no signing, no broadcast. The `sample-contract` component already uses `HttpClient` directly with hardcoded URLs — `RpcService` generalizes that pattern with a centrally-configured base URL.

**Alternatives considered**:
- **Octez RPC client library**: not on npm in a build-friendly form; HttpClient + typed responses is enough.
- **Use the indexer instead for storage reads**: rejected — RPC is the authoritative read; indexer is only used for entrypoint schemas and operation-hash lookups for the report.

---

## R6. Indexer (TzKT) endpoints consumed

**Decision**: Angular `HttpClient` over `NetworkConfig.api`. Endpoints:

| Use | Method + Path | Test(s) / component |
|---|---|---|
| List entrypoints + JSON schemas | `GET /v1/contracts/{kt}/entrypoints` | dynamic-contract panel |
| Contract metadata (post-origination KT1 resolution) | `GET /v1/operations/originations?hash={hash}` | contracts: Deploy from Michelson JSON |
| Operation lookup (for report enrichment) | `GET /v1/operations/{hash}` | report-export service |
| Contract lookup (optional, for richer KT1 display) | `GET /v1/contracts/{kt}` | dynamic-contract panel (optional) |

Indexer base URLs: Mainnet `https://api.tzkt.io`, Shadownet `https://api.shadownet.tzkt.io`.

**Rationale**: TzKT is the canonical Tezos indexer; entrypoint listing with JSON schemas is the one capability we cannot easily synthesize from raw RPC (RPC returns Micheline types, not user-friendly JSON shapes). Indexer is used as the primary source with RPC fallback per FR-033 / FR-042 edge case.

**Alternatives considered**:
- **Querying raw indexer GraphQL**: rejected — no GraphQL surface on TzKT Shadownet; REST is the lowest common denominator.
- **Skip indexer, parse RPC entrypoints**: rejected — we lose JSON schemas, which makes the parameter textarea less useful.

---

## R7. Originated KT1 resolution

**Decision**: after `requestOperation` returns a transaction hash for an origination, resolve the new KT1 as follows:
1. **Primary**: `GET https://api.<network>.tzkt.io/v1/operations/originations?hash=<hash>` — TzKT returns the originated contract address as `originatedContract.address`.
2. **Fallback**: poll `GET https://<network>-rpc/chains/main/blocks/head/operation_hashes` and scan recent blocks for the operation; if found, parse `metadata.operation_result.originated_contracts[0]`.
3. **Final fallback**: show the operation hash and tell the user to check the indexer manually (rare — usually one of the above resolves within 2–3 blocks).

**Rationale**: indexer-first is fast (a single GET); RPC fallback handles indexer outages; the manual fallback handles unprecedented cases.

**Alternatives considered**:
- **Wait for inclusion via beacon transport events**: rejected — Beacon doesn't surface inclusion events reliably across wallets.

---

## R8. Run-history persistence

**Decision**: persist `PlaygroundRun[]` as JSON in `localStorage['octez.connect.run-history']`. On boot, the `TestRunnerService` rehydrates the array. Mutations (new run, ✕ delete, Clear all) write back synchronously.

**Schema**: documented in `data-model.md`. A bounded write — caps at the last 50 runs (oldest dropped silently with a single `log()` note); each run is ~10–50 KB serialized.

**Rationale**:
- Run history is the user-facing artifact behind the cross-SDK-version compare use case (Clarification Q1) — must survive the page reload that an SDK switch triggers.
- `localStorage` is sync, available at boot before any service worker / IDB layer, and quota (~5–10 MB per origin) comfortably fits ~50 runs.
- No need for the project's already-installed `@ionic/storage-angular` (IDB-backed, async): the data fits in `localStorage` and async-init at boot adds nothing.

**Alternatives considered**:
- **`@ionic/storage-angular`**: rejected — async init adds steps to an already-async boot (SDK load); no quota benefit at this scale.
- **In-memory only**: rejected — would break the cross-SDK-version comparison story.
- **Server-side history**: out of scope — the dapp has no backend and is meant to ship as static assets to GitHub Pages.

---

## R9. Run-history quota & overflow handling

**Decision**: cap stored history at 50 numbered runs (most recent kept). On overflow, drop the oldest run with a single `console.info` log and continue. If a `localStorage` write throws `QuotaExceededError` even within cap, fall back to in-memory-only for the rest of the session and surface a toast notice.

**Rationale**: 50 × ~50 KB = 2.5 MB headroom inside the typical 5–10 MB localStorage quota per origin. Defensive overflow handling avoids ever crashing the playground on persistence.

**Alternatives considered**:
- **Unbounded growth**: rejected — eventual `QuotaExceededError` would surprise the user.
- **User-configurable cap**: rejected — premature; 50 is a reasonable default and Clear-all is always available.

---

## R10. Concurrency model: FIFO queue inside `TestRunnerService`

**Decision**: the runner exposes `run(testId, inputs)`, `runAllSafe()`, `runAllFull()`, and an internal `enqueueIndividual(testId, inputs)`. Internal state:

```text
inFlightRunAll: 'safe' | 'full' | null
queue: { testId, inputs }[]
```

- `runAllSafe()` / `runAllFull()` set `inFlightRunAll` and refuse to start if one is already in flight (the other Run-all button is disabled by the page reading this flag).
- While `inFlightRunAll !== null`, any UI call to `run(testId, inputs)` pushes onto `queue` and the test card sets a "queued" indicator (FR-066).
- When the run-all completes (success or after the last test), the runner drains `queue` sequentially: each queued item becomes an ordinary individual run (FR-062), updating the test card's last-result. Queued items do NOT join the just-completed numbered run.

**Rationale**: matches Clarification Q3 exactly. Single owner of the sequencing, no shared locks, easy to reason about.

**Alternatives considered**:
- **Disable individual Run buttons**: rejected by user (Q3 answer).
- **Concurrent execution**: rejected — interleaves wallet popups and would muddy the numbered-run snapshot.

---

## R11. Mainnet "Run all (full)" confirmation mechanism

**Decision**: a single browser-native `window.confirm(message)` call before the sequence begins (per Clarification Q5). Message names the network, the wallet address, and how many mutating tests will be executed.

**Rationale**: blocking, zero UI work, hard to dismiss accidentally on Mainnet (one click → one click vs. auto-click of background scripts). Reasonable for a developer tool.

**Alternatives considered**: Ionic alert with typed phrase confirmation (Q5 option B) — user picked native.

---

## R12. tz5 (BLS) account detection

**Decision**: detect by address prefix — `account.address.startsWith('tz5')` is sufficient for "is this a BLS-key account". On the playground's `tz5 BLS signing` test, if the active account doesn't satisfy that check, surface an inline instructional message ("switch to a tz5 account in your wallet") and disable the Run button.

**Rationale**: Tezos address prefixes are unambiguous (`tz1`/`tz2`/`tz3`/`tz4`/`tz5` for the five key-curve families). No network gating is needed — protocol-U is on both Mainnet and Shadownet (per Clarification on tz5 / protocol-U).

**Alternatives considered**:
- **Query the wallet for supported key types**: unsupported across wallets via Beacon — the address itself is the source of truth.

---

## R13. Markdown report formatting

**Decision**: in-house formatter in `report-export.service.ts`. Layout:

```markdown
# octez.connect Playground Report — RUN <N>

| Field | Value |
|-------|-------|
| Generated at | <ISO8601> |
| Network      | <Mainnet | Shadownet> |
| RPC URL      | <rpc>  |
| Indexer API  | <api>  |
| Wallet       | <addr> |
| SDK version  | <ver>  |
| dApp version | <pkg-version> |
| Total        | <pass>/<total> passed |

## <Category Name>

| Test | Status | Duration | Op hash / Result |
|------|--------|----------|------------------|
| <title> | success | <ms> ms | [hash](indexerUrl) |
| <title> | error   | <ms> ms | <one-line error> |

(Per failing test, a fenced ```json block of `{ request, response, error }` appears below the category table.)
```

**Rationale**: GitHub/GitLab/Notion all render GH-flavored Markdown identically, including links and tables. Zero deps.

**Alternatives considered**:
- **markdown-it / showdown**: rejected — no new deps.
- **PDF export**: rejected — Markdown is enough for shareable bug reports; PDF requires `jspdf` or similar.

---

## R14. Clipboard write + JSON download mechanics

**Decision**:
- Clipboard: `navigator.clipboard.writeText(content)`. On rejection (older Safari, insecure contexts), fall back to a hidden `<textarea>` + `document.execCommand('copy')` shim.
- Download: build a `Blob([content], { type: 'text/markdown' | 'application/json' })`, `URL.createObjectURL`, attach to a hidden `<a download="...">`, programmatically click, revoke the URL.

**Rationale**: both APIs are universal in supported browsers and require zero deps. The hidden-textarea fallback handles the small set of browsers where clipboard-write isn't permitted.

**Alternatives considered**: `file-saver` npm package — rejected, no new deps.

---

## R15. Routing change: legacy preservation

**Decision**: in `app-routing.module.ts`:

```ts
const routes: Routes = [
  { path: '', loadChildren: () => import('./playground/playground.module').then(m => m.PlaygroundModule) },
  { path: 'legacy', loadChildren: () => import('./pages/home/home.module').then(m => m.HomePageModule) },
  { path: '**', redirectTo: '/', pathMatch: 'full' },
]
```

**Rationale**: simple, both modules stay lazy, the `**` wildcard catches the case where `/legacy` accidentally gets `/legacy/foo` (sends to `/`, which is the playground).

**Alternatives considered**: full deletion of the home page — rejected, the user explicitly said "preserved, not deleted".

---

## R16. BeaconService async init shape

**Decision**: `BeaconService` exposes a `whenReady(): Promise<void>` that resolves once `this.client` is constructed via `await sdkLoader.load()`. All public methods (`connect`, `disconnect`, `requestPermissions`, `getRpcUrl`) await `whenReady()` first.

**Rationale**: page components can `await whenReady()` in `ngOnInit` to gate their controls (FR-055). The wait happens once per page-load; subsequent calls are sync.

**Alternatives considered**:
- **Synchronous null-checks scattered through methods**: rejected — more brittle.
- **APP_INITIALIZER**: workable but requires Angular DI tweaks; one async getter is cleaner.

---

## R17. Existing dependency: `@ionic/storage-angular`

**Decision**: leave the existing `IonicStorageModule.forRoot()` import in `app.module.ts` untouched — it's used by other (legacy/home) flows and removing it would be churn. The playground itself does not import `Storage` from this package.

**Rationale**: zero-change diff to legacy code; the dep is small.

**Alternatives considered**: remove the import — rejected, scope creep.

---

## R18. Sentry / error handler

**Decision**: existing `SentryErrorHandler` continues to globally catch unhandled errors. Per-test errors are caught explicitly inside `TestRunnerService.run()` and recorded as `TestResult.error` — they do NOT bubble to Sentry (otherwise every wallet rejection becomes a Sentry event).

**Rationale**: Sentry remains useful for real bugs; expected test errors (user rejected, contract not found, etc.) are first-class data, not exceptions.

**Alternatives considered**: pipe everything to Sentry — rejected, noisy.

---

## R19. Per-network contract defaults registry

**Decision**: a single `CONTRACT_DEFAULTS: Record<'mainnet' | 'shadownet', Record<ContractRole, string | null>>` table inside `network.config.ts`. `ContractRole` is one of `'counter' | 'fa2-transfer' | 'fa2-balance'`. Missing role on a network resolves to `null`, which test inputs interpret as "render empty with hint" per FR-023 / FR-042. Shadownet ships populated:

```text
shadownet:
  counter:        KT1S4JeGENf157Ag8RTyUfHujeUg2A32x4VA
  fa2-transfer:   null   (to be supplied per the user's existing Shadownet FA2, if any — else leave null)
  fa2-balance:    null
mainnet:
  counter:        null   (user will deploy themselves with my guidance — see memory `mainnet-counter-deploy`)
  fa2-transfer:   null   (open question: pick a Mainnet FA2 the user controls — see memory `mainnet-fa2-default-open`)
  fa2-balance:    null
```

**Rationale**: a single mutation point. Adding a future network or role is one edit. Empty defaults are first-class (input renders empty, Run-all skips with a clear error).

**Alternatives considered**:
- **One file per network**: rejected — fragmented.
- **Bake addresses into each test's metadata**: rejected — duplicates the address across roles and makes network toggle inconsistent.

---

## R20. Verification approach

**Decision**: rely on **manual verification** against the running app (live wallets, live RPC, live indexer) for the playground UX and on-chain tests. Add a small set of **Jasmine unit tests** for pure helpers and the runner queue:

| Unit test target | Why test |
|---|---|
| `buildSignPayload('test')` | Critical correctness — Bug A3 fix |
| `buildSignPayload(non-ASCII)` | UTF-8 length edge case (FR-006) |
| `network.config.ts` lookup with missing role | FR-023 contract behavior |
| `TestRunnerService` queue ordering | FR-064/FR-065 |
| `report-export` Markdown formatting (op-hash link rendering) | FR-045 |

The verification recipe (one manual check per Success Criterion) lives in `quickstart.md`.

**Rationale**: this is a developer tool whose value is end-to-end behavior against real wallets and chains — unit tests can't reproduce that. Manual checks are documented per SC so any engineer can re-run them.

**Alternatives considered**:
- **Cypress / Playwright e2e against a mock wallet**: rejected — engineering cost outweighs benefit for a small developer tool; mocking Beacon transport realistically is non-trivial.
