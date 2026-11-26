import type { AccountInfo, OperationResponseOutput } from '@tezos-x/octez.connect-dapp'
import { HttpClient } from '@angular/common/http'
import { Component } from '@angular/core'
import { Observable } from 'rxjs'
import { OctezConnectService } from 'src/app/services/octez-connect/octez-connect.service'
import { ToastController } from '@ionic/angular'

@Component({
  selector: 'app-sample-contract',
  templateUrl: './sample-contract.component.html',
  styleUrls: ['./sample-contract.component.scss']
})
export class SampleContractComponent {
  public activeAccount$: Observable<AccountInfo | undefined>
  public activeAccount: AccountInfo | undefined

  public newNumber: number = 0
  public newFlag: boolean = false

  public number: number | undefined
  public flag: boolean | undefined

  private readonly contractDestination: string = 'KT1RxKJyi48W3bZR8HErRiisXZQw19HwLGWj'

  constructor(
    private readonly http: HttpClient,
    private readonly octezConnectService: OctezConnectService,
    private readonly toastController: ToastController
  ) {
    this.activeAccount$ = this.octezConnectService.activeAccount$
    this.activeAccount$.subscribe((activeAccount: AccountInfo | undefined) => {
      this.activeAccount = activeAccount
    })

    this.getState().catch(console.error)
  }

  public async getState(): Promise<void> {
    const result: any = await this.http
      .get(
        `https://tezos-shadownet.octez.io/chains/main/blocks/head/context/contracts/${this.contractDestination}/storage`
      )
      .toPromise()

    this.number = result.args[0].int
    this.flag = result.args[1].prim

    const toast: HTMLIonToastElement = await this.toastController.create({
      message: 'State updated',
      position: 'bottom',
      duration: 1000,
      buttons: [
        {
          text: 'Done',
          role: 'cancel'
        }
      ]
    })
    toast.present()
  }

  public async setNumber(): Promise<void> {
    if (!this.activeAccount) {
      throw new Error('No active account set!')
    }

    await this.octezConnectService.whenReady()
    const response: OperationResponseOutput = await this.octezConnectService.client.requestOperation({
      operationDetails: [
        {
          kind: 'transaction',
          amount: '0',
          destination: this.contractDestination,
          parameters: {
            entrypoint: 'setNumber',
            value: {
              int: this.newNumber.toString()
            }
          }
        }
      ]
    } as any)
    console.log(response)
  }

  public async setFlag(): Promise<void> {
    if (!this.activeAccount) {
      throw new Error('No active account set!')
    }

    await this.octezConnectService.whenReady()
    const response: OperationResponseOutput = await this.octezConnectService.client.requestOperation({
      operationDetails: [
        {
          kind: 'transaction',
          amount: '0',
          destination: this.contractDestination,
          parameters: {
            entrypoint: 'toggleStatus',
            value: {
              prim: this.newFlag ? 'True' : 'False'
            }
          }
        }
      ]
    } as any)
    console.log(response)
  }
}
