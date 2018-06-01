import { Component, EventEmitter, Input, OnDestroy, OnChanges, OnInit, Output, SimpleChange } from '@angular/core';
import { Mappings } from './models/mappings';
import { MapperContext } from './models/mapper-context';

import { Subject } from 'rxjs/Subject';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  distinctUntilKeyChanged,
  first,
  map,
  merge,
  share,
  takeUntil
} from 'rxjs/operators';

import { MonacoEditorLoaderService } from '../monaco-editor';
import { load as loadMonacoLangPlugin } from '../mapper-language/monaco-contribution';

import { SingleEmissionSubject } from './shared/single-emission-subject';

import { MapperService, MapperState } from './services/mapper.service';
import { EditorService } from './editor/editor.service';
import { DraggingService, TYPE_PARAM_FUNCTION, TYPE_PARAM_OUTPUT } from './services/dragging.service';
import { TYPE_ATTR_ASSIGNMENT } from './constants';
import { selectCurrentEditingExpression, selectCurrentNode, selectMappings } from '@flogo/flow/shared/mapper/services/selectors';
import { MapperTreeNode } from '@flogo/flow/shared/mapper/models/mapper-treenode.model';

@Component({
  selector: 'flogo-mapper',
  templateUrl: 'mapper.component.html',
  styleUrls: ['mapper.component.less'],
  providers: [MapperService, EditorService, DraggingService]
})
export class MapperComponent implements OnInit, OnChanges, OnDestroy {
  @Input() context: MapperContext;
  @Input() inputsSearchPlaceHolder = 'Search';
  @Input() outputsSearchPlaceHolder = 'Search';
  @Output() mappingsChange = new EventEmitter<Mappings>();
  @Input() isSingleInputMode = false;
  currentInput: MapperTreeNode = null;
  isDraggingOver = false;

  private dragOverEditor = new EventEmitter<Event>();
  private ngDestroy: SingleEmissionSubject = SingleEmissionSubject.create();
  private contextChanged = new Subject();
  private contextInUse: MapperContext;
  private hasInitted = false;

  constructor(private mapperService: MapperService,
              private editorService: EditorService,
              private draggingService: DraggingService,
              private monacoLoaderService: MonacoEditorLoaderService) {
    monacoLoaderService.isMonacoLoaded.subscribe(isLoaded => {
      if (isLoaded) {
        loadMonacoLangPlugin();
      }
    });
  }

  ngOnInit() {
    this.hasInitted = true;
    this.initContext();
  }

  ngOnChanges(changes: { [propKey: string]: SimpleChange }) {
    const contextChange = changes['context'];
    if (!contextChange || contextChange.currentValue === this.contextInUse) {
      return;
    }
    this.contextInUse = this.context;
    this.contextChanged.next();
    if (!contextChange.isFirstChange() && this.hasInitted) {
      this.initContext();
    }
  }

  ngOnDestroy() {
    this.ngDestroy.emitAndComplete();
    this.contextChanged.complete();
  }

  onDrop(event: DragEvent) {
    if (this.isDragAcceptable()) {
      const node = this.draggingService.getData();
      const type = this.draggingService.getType();
      let text = '';
      const position = { x: event.clientX, y: event.clientY };
      if (type === TYPE_PARAM_OUTPUT) {
        text = node.snippet;
      } else if (type === TYPE_PARAM_FUNCTION && node.data) {
        text = node.data.snippet;
      }
      this.editorService.insertText(text, position);
      this.onDragLeave();
      event.preventDefault();
      event.stopPropagation();
    }
  }

  onDragOver(event: DragEvent) {
    if (this.isDragAcceptable()) {
      this.dragOverEditor.emit(event);
      event.dataTransfer.dropEffect = 'copy';
      event.preventDefault();
    }
  }

  onOutputSelected(node: any) {
    this.editorService.insertText(node.snippet);
  }

  onDragEnter(event: DragEvent) {
    this.isDraggingOver = true;
  }

  onDragLeave(event?: DragEvent) {
    this.isDraggingOver = false;
  }

  private isDragAcceptable() {
    return this.draggingService.accepts(TYPE_PARAM_OUTPUT)
      || this.draggingService.accepts(TYPE_PARAM_FUNCTION);
  }

  private initContext() {
    this.mapperService.setContext(this.contextInUse);
    const stop$ = this.ngDestroy.pipe(
      merge(this.contextChanged),
      first(),
      share(),
    );

    const state$ = this.mapperService.state$
      .pipe(
        catchError(err => {
          console.error(err);
          throw err;
        }),
        takeUntil(stop$),
        share(),
      );

    state$
      .pipe(
        selectCurrentNode,
        takeUntil(stop$),
      )
      .subscribe((currentInputNode) => {
        this.currentInput = currentInputNode;
      });

    // state$
    //   .pipe(
    //     map((state: MapperState) => state.currentSelection ? state.currentSelection.errors : null),
    //     distinctUntilChanged(),
    //     takeUntil(stop$),
    //   )
    //   .subscribe((errors: any[]) => {
    //     if (this.currentInput) {
    //       this.editorService.validated(errors);
    //     }
    //   });

    state$
      .pipe(
        selectMappings,
        takeUntil(stop$)
      )
      .subscribe(change => this.mappingsChange.emit(change));

    this.editorService.outputExpression$
      .pipe(takeUntil(this.ngDestroy))
      .subscribe(({ mapKey, expression }) => this.mapperService.expressionChange(mapKey, expression));

    this.dragOverEditor
      .pipe(
        takeUntil(stop$),
        debounceTime(300),
        map((ev: DragEvent) => ({ x: ev.clientX, y: ev.clientY })),
        distinctUntilChanged((prev, next) => prev.x === next.x && prev.y === next.y),
      )
      .subscribe(position => this.editorService.dragOver(position));

    this.mapperService
      .state$.pipe(
        distinctUntilKeyChanged('context'),
        takeUntil(stop$),
        first(),
      )
      .subscribe((state: MapperState) => {
        const inputsData = state.inputs;
        // open first input by default
        if (inputsData.nodes && inputsData.nodes[0]) {
          this.mapperService.selectInput(inputsData.nodes[0]);
        }
      });
  }

}
