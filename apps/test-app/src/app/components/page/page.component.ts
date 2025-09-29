import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LDFlagSet } from 'launchdarkly-js-client-sdk';
import { BehaviorSubject } from 'rxjs';
import { TableComponent } from '../table/table.component';

@Component({
    selector: 'app-page',
    imports: [CommonModule, TableComponent],
    templateUrl: './page.component.html',
    styleUrl: './page.component.css',
})
export class PageComponent {
    flagSubject = new BehaviorSubject<LDFlagSet>({});

    featureFlags$ = this.flagSubject.asObservable();

    featureFlags: LDFlagSet = {};

    flags = signal<LDFlagSet>({});

    onClick(value: unknown): void {
        console.log(value);
    }
}
