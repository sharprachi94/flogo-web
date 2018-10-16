import {get, cloneDeep, fromPairs, isArray, pick} from 'lodash';
import {flow as backendFlow, ItemActivityTask, ItemBranch, ItemTask, SchemaAttribute} from '../../../../core/index';
import {FLOGO_TASK_TYPE, ValueType} from '../../../../core/constants';

export class ItemFactory {

  static getDefaultTaskProperties(installed) {
    const defaults = {
      name: '',
      description: '',
      settings: {},
      ref: '',
    };
    return Object.assign({}, defaults, pick(installed, ['name', 'description', 'ref']));
  }

  static getDefaultTriggerProperties(installed) {
    const defaults = {
      name: '',
      version: '',
      homepage: '',
      description: '',
      installed: true,
      settings: {},
      outputs: [],
      ref: '',
      handler: { settings: [] },
      __props: {
        errors: [],
      },
      __status: {}
    };
    return Object.assign({}, defaults, pick(installed, ['name', 'version', 'homepage', 'description', 'ref']));
  }

  static makeTrigger(trigger: { installed: any, cli: any, handlerSetting: any, node: any }): any {
    // todo: what does cli means in this context??
    const { installed, cli, handlerSetting } = trigger;
    const item = Object.assign({}, this.getDefaultTriggerProperties(installed), { id: trigger.node.taskID }, {
      nodeId: trigger.node.taskID, type: FLOGO_TASK_TYPE.TASK_ROOT, triggerType: installed.name, settings: [],
    });

    const settings = get(cli, 'settings', {});
    const triggerSchemaSettings = isArray(installed.settings) ? installed.settings : [];
    item.settings = mergeAttributesWithSchema(settings, triggerSchemaSettings);

    const handlerSettings = get(installed, 'handler.settings', []);
    item.handler.settings = mergeAttributesWithSchema(handlerSetting.settings || {}, handlerSettings);

    const mapType = prop => ({
      name: prop.name,
      type: prop.type || ValueType.String,
    });
    // -----------------
    // set outputs
    const outputs = installed.outputs || [];
    item.outputs = outputs.map(mapType);

    const reply = installed.reply || [];
    item['reply'] = reply.map(mapType);

    return item;
  }

  static makeItem(activitySource: { activitySchema, taskInstance }): ItemTask {
    const {activitySchema, taskInstance} = activitySource;
    return {
      ...this.getDefaultTaskProperties(activitySchema),
      id: taskInstance.id,
      name: taskInstance.name,
      description: taskInstance.description,
      inputMappings: taskInstance.inputMappings || [],
      type: FLOGO_TASK_TYPE[taskInstance.type] ? FLOGO_TASK_TYPE[FLOGO_TASK_TYPE[taskInstance.type]] : FLOGO_TASK_TYPE.TASK,
      settings: taskInstance.settings || {},
      return: !!activitySchema.return,
      input: mergeConfigurationsWithSchema(taskInstance.testConfigurations, activitySchema.inputs),
    } as ItemActivityTask;
  }

  static makeBranch(branch): ItemBranch {
    return {
      id: branch.taskID, type: FLOGO_TASK_TYPE.TASK_BRANCH, condition: branch.condition,
    };
  }
}

function mergeAttributesWithSchema(properties: { [key: string]: any }, schemaAttributes: any[]) {
  return schemaAttributes.map(attribute => {
    const mappedAttribute = cloneDeep(attribute);
    if (properties[attribute.name]) {
      mappedAttribute.value = properties[attribute.name];
    }
    return mappedAttribute;
  });
}

function mergeConfigurationsWithSchema(configurations: backendFlow.TestConfig[] = [], schemaInputs: SchemaAttribute[] = []) {
  const configs = fromPairs(configurations.map(config => [config.name, config.value]));
  return fromPairs(schemaInputs.map(input => ({
    ...pick(input, ['name', 'value']),
    value: configs[input.name]
  })).map(input => [input.name, input.value]));
}
