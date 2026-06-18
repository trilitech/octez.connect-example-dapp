import { Component, OnInit } from '@angular/core'

import { BeaconService } from '../services/beacon/beacon.service'
import { SdkLoaderService } from './services/sdk-loader.service'
import { TestRunnerService } from './services/test-runner.service'
import { CATEGORY_META, CATEGORY_ORDER, TESTS_BY_CATEGORY } from './tests'
import { TestCategory, TestDefinition } from './tests/test-types'

@Component({
  selector: 'app-playground',
  templateUrl: './playground.page.html',
  styleUrls: ['./playground.page.scss']
})
export class PlaygroundPage implements OnInit {
  public ready = false
  public sdkVersion = ''
  public sdkSource: 'localStorage' | 'default' | 'fallback' = 'default'

  public readonly categoryOrder = CATEGORY_ORDER
  public readonly categoryMeta = CATEGORY_META
  public readonly testsByCategory = TESTS_BY_CATEGORY
  public readonly runProgress$ = this.testRunner.runProgress$

  constructor(
    private readonly beaconService: BeaconService,
    private readonly sdkLoader: SdkLoaderService,
    private readonly testRunner: TestRunnerService
  ) {}

  public async ngOnInit(): Promise<void> {
    try {
      await this.beaconService.whenReady()
    } catch (err) {
      console.error('Playground: BeaconService failed to initialize', err)
    }
    const active = this.sdkLoader.getActiveVersion()
    this.sdkVersion = active.version
    this.sdkSource = active.source
    this.ready = true
  }

  public testsIn(category: TestCategory): TestDefinition[] {
    return this.testsByCategory[category] || []
  }

  public trackById(_i: number, t: TestDefinition): string {
    return t.id
  }
}
