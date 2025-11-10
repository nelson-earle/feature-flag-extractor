import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LDFlagSet } from 'launchdarkly-js-client-sdk';

@Component({
    selector: 'app-page-inner',
    imports: [CommonModule],
    template: `<p>{{ flags()['flag-inner-a'] }}</p>`,
    styles: ``,
})
export class PageInnerComponent {
    flags = input<LDFlagSet>({});
}
