import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LDFlagSet } from 'launchdarkly-js-client-sdk';

@Component({
    selector: 'app-table',
    imports: [CommonModule],
    templateUrl: `./table.component.html`,
    styleUrl: './table.component.css',
})
export class TableComponent {
    featureFlags = input.required<LDFlagSet>();

    span = computed(() => (this.featureFlags()['flag-span'] ? 'a' : 'b'));

    onClick(): void {
        if (this.featureFlags()['ts-flag']) {
            console.log(this.featureFlags()['ts-value']);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    eat(_value: unknown): void {}
}
