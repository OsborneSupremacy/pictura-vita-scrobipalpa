import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TimelineAddOrganizationComponent } from './timeline-add-organization.component';

describe('TimelineAddOrganizationComponent', () => {
  let component: TimelineAddOrganizationComponent;
  let fixture: ComponentFixture<TimelineAddOrganizationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TimelineAddOrganizationComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TimelineAddOrganizationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
