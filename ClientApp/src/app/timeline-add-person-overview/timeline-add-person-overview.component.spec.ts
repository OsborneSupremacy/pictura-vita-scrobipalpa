import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TimelineAddPersonOverviewComponent } from './timeline-add-person-overview.component';

describe('TimelineAddPersonOverviewComponent', () => {
  let component: TimelineAddPersonOverviewComponent;
  let fixture: ComponentFixture<TimelineAddPersonOverviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TimelineAddPersonOverviewComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TimelineAddPersonOverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
