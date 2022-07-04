import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TimelineAddComponent } from './timeline-add.component';

describe('TimelineAddComponent', () => {
  let component: TimelineAddComponent;
  let fixture: ComponentFixture<TimelineAddComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TimelineAddComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TimelineAddComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
