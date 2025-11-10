import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PageInnerComponent } from './page-inner.component';

describe('PageInnerComponent', () => {
    let component: PageInnerComponent;
    let fixture: ComponentFixture<PageInnerComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [PageInnerComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(PageInnerComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
