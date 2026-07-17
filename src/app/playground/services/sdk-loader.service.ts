// Dynamically loads `@tezos-x/octez.connect-dapp` at boot:
//  - Reads localStorage['octez.connect.version'] (default '4.8.6').
//  - Races a bundler-opaque dynamic import (`new Function('u','return import(u)')`)
//    against a 10-second timeout (per spec FR-052 + research §R1).
//  - On error or timeout, falls back to the statically bundled package and surfaces
//    a non-blocking toast (per FR-052 + research §R2).
//  - Caches the resolved module as a singleton per page-load.

import { Injectable } from '@angular/core'
import { ToastController } from '@ionic/angular'

const STORAGE_KEY = 'octez.connect.version'
const DEFAULT_VERSION = '4.8.6'
const CDN_TIMEOUT_MS = 10_000

export const SUPPORTED_VERSIONS: readonly string[] = [
  '5.0.0',
  '4.8.6',
  '4.8.5',
  '5.0.0-beta.6',
  '5.0.0-beta.5',
  '5.0.0-beta.4',
  '5.0.0-beta.3'
]

// Multi-network (one pairing spanning several networks) shipped on the 5.x
// line — see the v5 MIGRATION.md ("Multi-network support for Tezos X").
export function supportsMultiNetwork(version: string): boolean {
  const major = parseInt(version, 10)
  return Number.isFinite(major) && major >= 5
}

// The runtime surface we depend on. Per `contracts/sdk-module-surface.md`.
// Typed loosely — the playground uses string-literal kinds/signing-types so it
// stays version-agnostic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SdkModule = any

export type ActiveVersionSource = 'localStorage' | 'default' | 'fallback'

export interface ActiveVersion {
  version: string
  source: ActiveVersionSource
}

// Bundler-opaque dynamic import. The Function constructor body is a string
// at build time, so Angular/Webpack cannot rewrite the URL.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynImport: (u: string) => Promise<SdkModule> = new Function('u', 'return import(u)') as (
  u: string
) => Promise<SdkModule>

@Injectable({ providedIn: 'root' })
export class SdkLoaderService {
  private cached: SdkModule | null = null
  private active: ActiveVersion = { version: DEFAULT_VERSION, source: 'default' }

  constructor(private readonly toastController: ToastController) {}

  public getActiveVersion(): ActiveVersion {
    return this.active
  }

  public setVersion(version: string): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, version)
    } catch (err) {
      console.error('SdkLoaderService.setVersion: localStorage write failed', err)
    }
    window.location.reload()
  }

  public async load(): Promise<SdkModule> {
    if (this.cached) return this.cached

    const stored = this.readStoredVersion()
    const requested = stored ?? DEFAULT_VERSION
    this.active = { version: requested, source: stored ? 'localStorage' : 'default' }

    const url = `https://esm.sh/@tezos-x/octez.connect-dapp@${encodeURIComponent(requested)}`
    try {
      const mod = await this.raceTimeout(dynImport(url), CDN_TIMEOUT_MS)
      this.cached = mod
      return mod
    } catch (err) {
      console.warn(`SdkLoaderService: plain CDN load failed (${requested}); retrying with ?bundle-deps.`, err)
    }
    // Retry as a self-contained esm.sh bundle. The 5.x packages reference the
    // wallet-list JSON subpath (@tezos-x/octez.connect-ui/data/*.json) which
    // esm.sh fails to serve as a per-file module (404 on
    // .../es2022/data/tezos.json.mjs); the bundled build inlines it.
    try {
      const mod = await this.raceTimeout(dynImport(`${url}?bundle-deps`), CDN_TIMEOUT_MS)
      this.cached = mod
      return mod
    } catch (err) {
      console.warn(`SdkLoaderService: CDN load failed (${requested}); falling back to bundled package.`, err)
      const fallback = await import('@tezos-x/octez.connect-dapp')
      this.cached = fallback
      this.active = { version: this.detectBundledVersion(fallback), source: 'fallback' }
      this.surfaceFallbackToast(requested).catch(console.error)
      return fallback
    }
  }

  private readStoredVersion(): string | null {
    try {
      return window.localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  }

  private detectBundledVersion(mod: SdkModule): string {
    // Best-effort: the SDK package may export SDK_VERSION; otherwise fall back to a label.
    return (mod && (mod.SDK_VERSION as string)) || DEFAULT_VERSION
  }

  private async raceTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return await Promise.race<T>([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('cdn-timeout')), ms))])
  }

  private async surfaceFallbackToast(requested: string): Promise<void> {
    const toast = await this.toastController.create({
      message: `Could not load SDK ${requested} from CDN (offline or unreachable). Using bundled fallback.`,
      duration: 5000,
      position: 'bottom',
      color: 'warning'
    })
    await toast.present()
  }
}
