// Test entry (angular.json test.options.main). Spec files are discovered and
// bundled by the Angular karma builder itself, so this only has to load the
// zone testing patches (BEFORE @angular/core/testing) and init the TestBed.

// tslint:disable
import 'zone.js/testing'
import { getTestBed } from '@angular/core/testing'
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing'

getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting())
