// Playground module — lazy-loaded at `''`.
// No new top-level npm dependencies are added by this feature (T002):
//   - HttpClientModule + IonicStorageModule are already imported in app.module.ts;
//   - the global `Buffer` polyfill is already wired up at app boot;
//   - the bundled `@tezos-x/octez.connect-dapp@4.8.5` serves as the SDK fallback.

import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterModule, Routes } from '@angular/router'
import { IonicModule } from '@ionic/angular'

import { PlaygroundPage } from './playground.page'
import { ContractExplorerComponent } from './components/contract-explorer/contract-explorer.component'
import { RunHistoryComponent } from './components/run-history/run-history.component'
import { TestCardComponent } from './components/test-card/test-card.component'
import { WalletControlComponent } from './components/wallet-control/wallet-control.component'

const routes: Routes = [{ path: '', component: PlaygroundPage }]

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [
    PlaygroundPage,
    TestCardComponent,
    WalletControlComponent,
    RunHistoryComponent,
    ContractExplorerComponent
  ]
})
export class PlaygroundModule {}
