import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LDFlagSet } from 'launchdarkly-js-client-sdk';
import { BehaviorSubject, Subject } from 'rxjs';
import { TableComponent } from '../table/table.component';
import { PageInnerComponent } from '../page-inner/page-inner.component';

@Component({
    selector: 'app-page',
    imports: [CommonModule, TableComponent, PageInnerComponent],
    templateUrl: './page.component.html',
    styleUrl: './page.component.css',
})
export class PageComponent {
    @Input() featureFlags: LDFlagSet = {};
    @Input() maybeFeatureFlags: null | LDFlagSet = {};

    flagBehaviorSubject = new BehaviorSubject<LDFlagSet>({});
    flagSubject = new Subject<LDFlagSet>();

    featureFlags$ = this.flagBehaviorSubject.asObservable();

    flags = signal<LDFlagSet>({});

    maybeFlags = signal<(LDFlagSet & { myFlag: string }) | null>(null);

    onClick(_value: unknown): void {
        console.log(this.maybeFlags()?.['flag-union']);
    }
}
