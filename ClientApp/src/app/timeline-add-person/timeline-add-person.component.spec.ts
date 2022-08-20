import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TimelineAddPersonComponent } from './timeline-add-person.component';

describe('TimelineAddPersonComponent', () => {
  let component: TimelineAddPersonComponent;
  let fixture: ComponentFixture<TimelineAddPersonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TimelineAddPersonComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TimelineAddPersonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
