import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DebugElement, NO_ERRORS_SCHEMA } from '@angular/core';
import { Http } from '@angular/http';

import { TranslateModule } from 'ng2-translate/ng2-translate';
import { Ng2Bs3ModalModule } from 'ng2-bs3-modal/ng2-bs3-modal';
import { Observable } from 'rxjs/Observable';

import { PostService } from '../../core/services/post.service';
import { APIFlowsService } from '../../core/services/restapi/v2/flows-api.service';
import { SharedModule as FlogoSharedModule } from '../../shared/shared.module';
import { CoreModule as FlogoCoreModule } from '../../core/core.module';
import { PUB_EVENTS } from './message';
import { FlogoNewFlowComponent } from './new-flow.component';

const EXISTING_FLOW_NAME = 'existing';
const flowsServiceStub = {

  findFlowsByName(name: string) {
    let flowArr = [];
    if (name === EXISTING_FLOW_NAME) {
      flowArr = [{ id: '123', name: EXISTING_FLOW_NAME }];
    }
    return Promise.resolve(flowArr);
  }

};

const postServiceStub = {

  publish(data: any) {
    this.published = data;
  }

};

describe('Component: FlogoFlowsAdd', () => {
  let comp: FlogoNewFlowComponent;
  let fixture: ComponentFixture<FlogoNewFlowComponent>;
  let elements: { submitBtn: DebugElement, nameInput: DebugElement, descriptionInput: DebugElement };

  let submitBtn: DebugElement;

  beforeAll(() => {
    // Monkey-patch Observable.debounceTime() since it is using
    // setInterval() internally which not allowed within async zone
    Observable.prototype.debounceTime = function () { return this; };
  });


  beforeEach((done) => {
    TestBed.configureTestingModule({
      imports: [
        Ng2Bs3ModalModule,
        TranslateModule.forRoot(),
        FlogoCoreModule,
        FlogoSharedModule
      ],
      declarations: [
        FlogoNewFlowComponent
      ], // declare the test component
      providers: [
        { provide: APIFlowsService, useValue: flowsServiceStub },
        { provide: PostService, useValue: postServiceStub }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    })
      .compileComponents()
      .then(() => done());

  });

  beforeEach(() => {

    fixture = TestBed.createComponent(FlogoNewFlowComponent);
    comp = fixture.componentInstance;

    const openModalBtnDe = fixture.debugElement.query(By.css('.js-open-modal'));
    openModalBtnDe.triggerEventHandler('click', null);

    fixture.detectChanges();

    elements = {
      submitBtn: fixture.debugElement.query(By.css('[type="submit"]')),
      nameInput: fixture.debugElement.query(By.css('#flowName')),
      descriptionInput: fixture.debugElement.query(By.css('#flowDescription')),
    };

    submitBtn = fixture.debugElement.query(By.css('[type="submit"]'));

  });

  it('Should not allow save when flow name is not provided', () => {
    fixture.detectChanges();
    expect(comp.flow.valid).toBe(false, 'form is valid');
    expect(submitBtn.nativeElement.disabled).toBe(true);
  });

  it('Should not allow to save when flow name already exists', () => {
    setValueAndDispatch(EXISTING_FLOW_NAME, elements.nameInput);
    fixture.detectChanges();
    expect(comp.flow.valid).toBe(false, 'form is valid');
    expect(submitBtn.nativeElement.disabled).toBeTruthy();
  });

  it('Should trigger an event with the flow info when the save button is clicked', fakeAsync(() => {

    const testFlow = {
      name: 'new flow name',
      description: 'new flow description'
    };

    setValueAndDispatch(testFlow.name, elements.nameInput);
    fixture.detectChanges();

    setValueAndDispatch(testFlow.description, elements.descriptionInput);
    tick();
    fixture.detectChanges();

    expect(comp.flow.valid).toBe(true, 'form is invalid');
    expect(submitBtn.nativeElement.disabled).toBeFalsy('Submit button is not enabled');
    submitBtn.nativeElement.click();

    // TODO: investigate why this happens, might be some modal timers
    // wait for all the timers to complete
    tick(500);
    fixture.detectChanges();

    const postService = fixture.debugElement.injector.get(PostService);

    expect(postService.published).toBeDefined('Published message is not defined');
    expect(postService.published.channel).toBe(PUB_EVENTS.addFlow.channel);
    expect(postService.published.topic).toBe(PUB_EVENTS.addFlow.topic);

    const messageData = postService.published.data;
    expect(messageData.name).toBe(testFlow.name);
    expect(messageData.description).toBe(testFlow.description);


  }));

  function setValueAndDispatch(value: any, de: DebugElement) {
    const nativeElement = de.nativeElement;
    nativeElement.value = value;
    nativeElement.dispatchEvent(new Event('input'));
  }


});
