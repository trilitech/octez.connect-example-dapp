import type { AccountInfo } from '@tezos-x/octez.connect-dapp'
import { Component, ViewChild } from '@angular/core'
import { Storage } from '@ionic/storage-angular'
import { Observable } from 'rxjs'

import { HomePage } from './pages/home/home.page'
import { BeaconService } from './services/beacon/beacon.service'
import { SdkLoaderService } from './playground/services/sdk-loader.service'

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss']
})
export class AppComponent {
  @ViewChild(HomePage, { read: HomePage }) public myContent!: HomePage

  public connectionStatus$: Observable<string>
  public activeAccount$: Observable<AccountInfo | undefined>
  // Sourced from the runtime-loaded SDK (SdkLoaderService) rather than a static
  // `SDK_VERSION` import, so the displayed version reflects the actually-loaded
  // SDK and no fixed-version runtime binding is created.
  public beaconSdkVersion: string

  constructor(
    private readonly beaconService: BeaconService,
    private readonly storage: Storage,
    private readonly sdkLoader: SdkLoaderService
  ) {
    this.beaconSdkVersion = this.sdkLoader.getActiveVersion().version
    this.connectionStatus$ = this.beaconService.connectionStatus$
    this.activeAccount$ = this.beaconService.activeAccount$
    // Refresh once the SDK has finished loading (version may resolve to the
    // bundled fallback or a CDN-loaded version).
    this.beaconService
      .whenReady()
      .then(() => {
        this.beaconSdkVersion = this.sdkLoader.getActiveVersion().version
      })
      .catch(() => undefined)
  }

  public async reset(): Promise<void> {
    await this.beaconService.whenReady()
    await this.beaconService.client.removeAllPeers()
    await this.storage.clear()
    location.reload()
  }
}
