import isEmpty from 'lodash/isEmpty';
import { DEFAULT_APP_VERSION } from '../../common/constants';

import { normalizeName } from './utils/normalize-name';

export class Exporter {
  /**
   * @param {boolean} isFullExportMode - full export or flows export
   * @param {LegacyMicroServiceFormatter|DeviceFormatter} formatter
   * @param {Validator} validator
   * @param {UniqueIdAgent} uniqueIdAgent
   */
  constructor(isFullExportMode, formatter, validator, uniqueIdAgent) {
    this.isFullAppExportMode = isFullExportMode;
    this.formatter = formatter;
    this.validator = validator;
    this.uniqueIdAgent = uniqueIdAgent;
  }

  /**
   *
   * @param onlyFlows
   * @throws validation error
   * @return {*}
   */
  export(app, onlyFlows) {
    if (!this.isFullAppExportMode) {
      app.actions = this.selectActions(app.actions, onlyFlows);
    }
    app = this.formatter.preprocess(app);

    app = this.applyDefaultAppAttributes(app);

    const { actions, previousActionIdsLinker } = this.humanizeActionIds(app.actions);
    app.actions = actions;
    app.triggers = this.processTriggers(app.triggers, previousActionIdsLinker);
    app = this.formatter.format(app);

    this.validator.validate(app);
    app = this.postProcess(app);
    return app;
  }

  selectActions(actions, includeOnlyThisActionIds = []) {
    if (isEmpty(includeOnlyThisActionIds)) {
      return actions;
    }
    const flowSet = new Set(includeOnlyThisActionIds);
    // todo: deal with case if flow1 references flow2 via subflow task then subflow2 should also be exported
    return actions.filter(action => flowSet.has(action.id));
  }

  processTriggers(triggers, humanizedActions) {
    if (this.isFullAppExportMode) {
      const { triggers: humanizedTriggers, handlers } = this.humanizeTriggerNamesAndExtractHandlers(triggers);
      triggers = humanizedTriggers;
      this.reconcileHandlersAndActions(handlers, humanizedActions);
    } else {
      triggers = [];
    }
    return triggers;
  }

  postProcess(app) {
    if (!this.isFullAppExportMode) {
      app.type = 'flogo:actions';
      delete app.triggers;
    }
    return app;
  }

  applyDefaultAppAttributes(app) {
    if (!app.version) {
      app.version = DEFAULT_APP_VERSION;
    }
    return app;
  }

  humanizeActionIds(actions) {
    const previousActionIdsLinker = new Map();
    actions.forEach(action => {
      const oldId = action.id;
      action.id = this.uniqueIdAgent.generateUniqueId(action.name);
      previousActionIdsLinker.set(oldId, action);
    });
    return { actions, previousActionIdsLinker };
  }

  humanizeTriggerNamesAndExtractHandlers(triggers) {
    let handlers = [];
    triggers.forEach(t => {
      t.id = normalizeName(t.name);
      handlers = handlers.concat(t.handlers);
    });
    return { triggers, handlers };
  }

  reconcileHandlersAndActions(handlers, humanizedActions) {
    handlers.forEach(h => {
      const oldActionId = h.actionId;
      const action = humanizedActions.get(oldActionId);
      if (!action) {
        delete h.actionId;
        return;
      }
      h.actionId = action.id;
    });
  }

}