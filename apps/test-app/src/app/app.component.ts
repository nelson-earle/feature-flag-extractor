import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
    imports: [RouterModule],
    selector: 'app-root',
    'template': `
        <h1>Test App</h1>
        <router-outlet></router-outlet>
    `,
    styleUrl: './app.component.css',
})
export class AppComponent {}
