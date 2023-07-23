import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TimelineAddDoneComponent } from './timeline-add-done.component';

describe('TimelineAddDoneComponent', () => {
  let component: TimelineAddDoneComponent;
  let fixture: ComponentFixture<TimelineAddDoneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TimelineAddDoneComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TimelineAddDoneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
