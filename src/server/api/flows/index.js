import {config, dbService, triggersDBService, activitiesDBService, flowExport} from '../../config/app-config';
import {DBService} from '../../common/db.service';
import {isJSON, flogoIDEncode, flogoIDDecode, flogoGenTaskID, genNodeID} from '../../common/utils';
import {FLOGO_FLOW_DIAGRAM_NODE_TYPE, FLOGO_TASK_TYPE,FLOGO_TASK_ATTRIBUTE_TYPE} from '../../common/constants';
import _ from 'lodash';
import * as flowUtils from './flows.utils';
import { readFileSync } from 'fs';

let basePath = config.app.basePath;
let dbDefaultName = config.db;
let _dbService = dbService;
let FLOW = 'flows';
let DELIMITER = ":";
let DEFAULT_USER_ID = 'flogoweb-admin';

const ERROR_TRIGGER_NOT_FOUND  = 'TRIGGER_NOT_FOUND';
const ERROR_ACTIVITY_NOT_FOUND = 'ACTIVITY_NOT_FOUND';
const ERROR_FLOW_NOT_FOUND     = 'FLOW_NOT_FOUND';
const ERROR_MISSING_TRIGGER    = 'MISSING_TRIGGER';
const ERROR_WRITING_DATABASE   = 'ERROR_WRITING_DATABASE';
const ERROR_CODE_BADINPUT      = 400;
const ERROR_CODE_SERVERERROR   = 500;


function getAllFlows(){
  let options = {
    include_docs: true,
    startKey: `${FLOW}${DELIMITER}${DEFAULT_USER_ID}${DELIMITER}`,
    endKey: `${FLOW}${DELIMITER}${DEFAULT_USER_ID}${DELIMITER}\uffff`
  };

  return new Promise((resolve, reject)=>{
    _dbService.db.allDocs(options).then((response)=>{
      let allFlows = [];
      let rows = response&&response.rows||[];
      rows.forEach((item)=>{
        // if this item's tabel is FLOW
        if(item&&item.doc&&item.doc.$table === FLOW){
          allFlows.push(item.doc);
        }
      });
      resolve(allFlows);
      // console.log(allFlows);
      //this.body = allFlows;
    }).catch((err)=>{
      reject(err);
    });
  });
}

/**
 *
 * @param query {name: string}
 * @returns {*}
 */
function filterFlows(query){
  query = _.assign({}, query);

  let options = {
    include_docs: true,
    startKey: `${FLOW}${DELIMITER}${DEFAULT_USER_ID}${DELIMITER}`,
    endKey: `${FLOW}${DELIMITER}${DEFAULT_USER_ID}${DELIMITER}\uffff`,
    key: query.name
  };

  // TODO:  repplace with a persistent query: https://pouchdb.com/guides/queries.html
  return _dbService.db
    .query(function(doc, emit) { emit(doc.name); }, options)
    .then((response) => {
      let allFlows = [];
      let rows = response&&response.rows||[];
      rows.forEach((item)=>{
        // if this item's tabel is FLOW
        if(item&&item.doc&&item.doc.$table === FLOW){
          allFlows.push(item.doc);
        }
      });
      return allFlows;
    });
}

function getActivities() {
  return new Promise( (resolve, reject) => {
    activitiesDBService.allDocs({ include_docs: true })
      .then( (activities)=> {
        let all = activities.map((activity)=> {
          return  {
            name: activity._id,
            type: FLOGO_TASK_TYPE.TASK
          };
        });
        resolve(all);
      }).catch((err)=>{
          reject(err);
      });
  });
}

function getTriggers() {
  return new Promise( (resolve, reject) => {
    triggersDBService.allDocs({ include_docs: true })
      .then( (activities)=> {
        let all = activities.map((activity)=> {
          return  {
            name: activity._id,
            type: FLOGO_TASK_TYPE.TASK_ROOT
          };
        });
        resolve(all);
      }).catch((err)=>{
      reject(err);
    });
  });
}

function createFlow(flowObj){
  return new Promise((resolve, reject)=>{
    _dbService.create(flowObj).then((response)=>{
      resolve(response);
    }).catch((err)=>{
      reject(err);
    });
  });
}

function updateFlow(flowObj){
  return new Promise((resolve, reject)=>{
    _dbService.update(flowObj).then((response)=>{
      resolve(response);
    }).catch((err)=>{
      reject(err);
    });
  });
}

export function flows(app, router){
  if(!app){
    console.error("[Error][api/activities/index.js]You must pass app");
  }

  router.get(basePath+"/flows", getFlows);
  router.post(basePath+"/flows", createFlows);
  router.delete(basePath+"/flows", deleteFlows);

  // {
  //   name: "tibco-mqtt"
  // }
  router.post(basePath+"/flows/triggers", addTrigger);
  router.post(basePath+"/flows/activities", addActivity);

  router.post(basePath+'/flows/json-file', importFlowFromJsonFile);
  router.post(basePath+'/flows/json', importFlowFromJson);
  router.get(basePath+'/flows/:id/json', exportFlowInJsonById);
}

function* getFlows(next){
  console.log("getFlows, next: ", next);
  //this.body = 'getFlows';

  let data = [];
  if (!_.isEmpty(this.query)) {
    data = yield filterFlows(this.query);
  } else {
    data = yield getAllFlows();
  }
  //yield next;
  console.log(data);
  this.body = data;
}

function* createFlows(next){
  console.log("createFlows");
  try{
    let data = this.request.body||{};
    if(typeof this.request.body == 'string'){
      if(isJSON(this.request.body)){
        data = JSON.parse(this.request.body);
      }
    }
    let flowObj = {};
    flowObj.name = data.name||"";
    flowObj.description = data.description || "";
    flowObj._id = _dbService.generateFlowID();
    flowObj.$table = _dbService.getIdentifier("FLOW");
    flowObj.paths = {};
    flowObj.items = {};
    console.log(flowObj);
    let res = yield createFlow(flowObj);
    this.body = res;
  }catch(err){
    var error = {
      code: 500,
      message: err.message
    };
    this.body = error;
  }
}

function* deleteFlows(next){
  console.log("deleteFlows");
  this.body = 'deleteFlows';
  yield next;
}

function * addTrigger(next){
  let response = {};
  console.log('ADDKING TRIGGER...........');
  //TODO validate this query is json
  var params = _.assign({},{name:'', flowId:''}, this.request.body || {}, this.query);

  let trigger = yield _getTriggerByName(params.name);
  if(!trigger) { this.throw(ERROR_CODE_BADINPUT,ERROR_TRIGGER_NOT_FOUND, { details: { type:ERROR_TRIGGER_NOT_FOUND, message:ERROR_TRIGGER_NOT_FOUND}} ); }

  let flow = yield _getFlowById(params.flowId);
  if(!flow) { this.throw(ERROR_CODE_BADINPUT, ERROR_FLOW_NOT_FOUND, { details:{ type:ERROR_FLOW_NOT_FOUND, message:ERROR_FLOW_NOT_FOUND}} ); }

  trigger = _activitySchemaToTrigger(trigger.schema);
  flow = flowUtils.addTriggerToFlow(flow, trigger);

  let res = yield updateFlow(flow);

  if(res&&res.ok && res.ok == true) {
     response.status = 200;
     response.id = res.id;
     response.name = flow.name || '';
  } else {
    this.throw(ERROR_CODE_SERVERERROR, ERROR_WRITING_DATABASE, {details:{ type:ERROR_WRITING_DATABASE, message:ERROR_WRITING_DATABASE}});
  }

  this.body = response;
}

function * addActivity(next){
  let response = {};
  var params = _.assign({},{name:'', flowId:''}, this.request.body || {}, this.query);

  let activity = yield _getActivityByName(params.name);
  if(!activity) { this.throw(ERROR_CODE_BADINPUT, ERROR_ACTIVITY_NOT_FOUND, { details: { type:ERROR_ACTIVITY_NOT_FOUND, message:ERROR_ACTIVITY_NOT_FOUND}} );};

  let flow = yield _getFlowById(params.flowId);
  if(!flow) { this.throw(ERROR_CODE_BADINPUT, ERROR_FLOW_NOT_FOUND, { details:{ type:ERROR_FLOW_NOT_FOUND, message:ERROR_FLOW_NOT_FOUND}} ); }



  activity = _activitySchemaToTask(activity.schema);
  if(!flowUtils.findNodeNotChildren(flow)) {
    this.throw(ERROR_CODE_BADINPUT, ERROR_MISSING_TRIGGER, { details:{ type:ERROR_MISSING_TRIGGER, message:ERROR_MISSING_TRIGGER}} );
  }
  flow = flowUtils.addActivityToFlow(flow, activity);

  let res = yield updateFlow(flow);

  if(res&&res.ok && res.ok == true) {
    response.status = 200;
    response.id = res.id;
    response.name = flow.name || '';
  }else {
    this.throw(ERROR_CODE_SERVERERROR, ERROR_WRITING_DATABASE, { details: { type:ERROR_WRITING_DATABASE, message:ERROR_WRITING_DATABASE} } );
  }

  this.body = response;
  yield next;
}

function * exportFlowInJsonById( next ) {
  console.log( '[INFO] Export flow in JSON by ID' );

  let flowId = _.get( this, 'params.id' );
  let errMsg = {
    'INVALID_PARAMS' : 'Invalid flow id.',
    'FLOW_NOT_FOUND' : 'Cannot find flow [___FLOW_ID___].'
  };
  let filename = flowExport.filename || 'export.json';

  if ( _.isUndefined( flowId ) ) {

    // invalid parameters
    this.throw( 400, errMsg.INVALID_PARAMS );

  } else {

    let flowInfo = yield _getFlowById( flowId );

    if ( _.isNil( flowInfo ) || _.isObject( flowInfo ) && _.isEmpty( flowInfo ) ) {

      // cannot find the flow
      this.throw( 404, errMsg.FLOW_NOT_FOUND.replace( '___FLOW_ID___', flowId ) );

    } else {

      // export the flow information as a JSON file
      this.type = 'application/json;charset=UTF-8';
      this.attachment( filename );

      // processing the flow information to omit unwanted fields
      this.body = _.omitBy( flowInfo, ( propVal, propName ) => {

        if ( [ '_id', '_rev', '_conflicts', 'updated_at', 'created_at' ].indexOf( propName ) !== -1 ) {
          return true;
        }

        // remove the `__status` attribute from `paths.nodes`
        if ( propName === 'paths' ) {
          let nodes = _.get( propVal, 'nodes', {} );

          if ( !_.isEmpty( nodes ) ) {
            _.forIn( nodes, ( n )=> {
              _.unset( n, '__status' );
            } );
          }
        }

        // remove the `__status` and `__props` attributes from `items`
        if ( propName === 'items' ) {

          if ( !_.isEmpty( propVal ) ) {
            _.forIn( propVal, ( item )=> {
              _.each( [ '__status', '__props' ], ( path ) => {
                // If is not trigger, remove __props
                if(item.type !== FLOGO_TASK_TYPE.TASK_ROOT) {
                  _.unset( item, path );
                }
              } );
            } );
          }

        }

        return false;
      } );
    }
  }

  yield next;
}

function * createFlowFromJson(context,imported, next ) {
  let activities = yield getActivities();
  let triggers  = yield getTriggers();
  let validateErrors = [];

  try {
    validateErrors = validateTriggersAndActivities(imported, triggers, activities);
    console.log('validate errors is');
    console.log(validateErrors);
  }catch (err) {
    context.throw(err);
  }
  if(validateErrors.hasErrors) {
    let details = {
      type: 1,
      message: 'Flow could not be imported, missing triggers/activities',
      details: {
        activities: validateErrors.activities,
        triggers: validateErrors.triggers
      }
    };
    context.response.status = 400;
    context.body = details;
    //this.throw(400, details);
  } else {
    // create the flow with the parsed imported data
    let createFlowResult;
    try {
      createFlowResult = yield createFlow( imported );
    } catch ( err ) {
      console.error( '[ERROR]: ', err );
      this.throw( 500, 'Fail to create flow.', { expose : true } );
    }
    context.body = createFlowResult;
  }

  return next;
}
function * importFlowFromJson(next ) {
  console.log( '[INFO] Import flow from JSON' );

  let flow = _.get( this, 'request.body.flow' );

  if ( _.isObject( flow ) && !_.isEmpty( flow ) ) {
      let imported = flow;
    console.log('IMPORTED IS');
    console.log(imported);

    /*
      try {
        imported = JSON.parse( flow );
      } catch ( err ) {
        console.error( '[ERROR]: ', err );
        this.throw( 400, 'Invalid JSON data.' );
      }
      */
      yield createFlowFromJson(this,imported,next);

  } else {
    this.throw( 400, 'Flow is empty' );
  }

  yield next;
}

function * importFlowFromJsonFile( next ) {
  console.log( '[INFO] Import flow from JSON File' );

  let importedFile = _.get( this, 'request.body.files.importFile' );

  if ( _.isObject( importedFile ) && !_.isEmpty( importedFile ) ) {

    // only support `application/json`
    if ( importedFile.type !== 'application/json' ) {
      console.error( '[ERROR]: ', importedFile );
      this.throw( 400, 'Unsupported file type: ' + importedFile.type + '; Support application/json only.' );
    } else {
      /* processing the imported file */
      let imported;

      // read file data into string
      try {
        imported = readFileSync( importedFile.path, { encoding : 'utf-8' } );
      } catch ( err ) {
        console.error( '[ERROR]: ', err );
        this.throw( 500, 'Cannot read the uploaded file.', { expose : true } );
      }

      // parse file date to object
      try {
        imported = JSON.parse( imported );
      } catch ( err ) {
        console.error( '[ERROR]: ', err );
        this.throw( 400, 'Invalid JSON data.' );
      }

      yield createFlowFromJson(this,imported,next);

    }
  } else {
    console.log( this.request.body.files );
    this.throw( 400, 'Invalid file.' );
  }

  yield next;
}

function validateTriggersAndActivities (flow, triggers, activities) {
  let validate = { activities: [], triggers: [], hasErrors: false};

  try {
    console.log('triggers are');
    console.log(triggers);

    console.log('activities');
    console.log(activities);

    let installedTiles = triggers.concat(activities);
    let tilesMainFlow = getTilesFromFlow(_.get(flow, 'items', []));
    let tilesErrorFlow = getTilesFromFlow(_.get(flow, 'errorHandler.items', []));
    let allTilesFlow = _.uniqBy(tilesMainFlow.concat(tilesErrorFlow), (elem) => {
      return elem.name + elem.type;
    });
    console.log('All tiles flow');
    console.log(allTilesFlow);

    allTilesFlow.forEach( (tile) => {
      let index = installedTiles.findIndex((installed)=> {
        return installed.name == tile.name && installed.type == tile.type;
      });

      if(index == -1) {
        validate.hasErrors = true;
        if(tile.type == FLOGO_TASK_TYPE.TASK_ROOT) {
          validate.triggers.push(tile.name);
        } else {
          validate.activities.push(tile.name);
        }
      }
    });
  } catch(err) {
    this.throw(err);
  }

  return validate;
}

function getTilesFromFlow(items) {
    let tiles = [];

    for(var key in items)  {
      let item = items[key];

      if(item.type == FLOGO_TASK_TYPE.TASK_ROOT || item.type == FLOGO_TASK_TYPE.TASK) {
        if(item.triggerType&&item.triggerType=='__error-trigger') {
          console.log('Ignoring error trigger')
        }else {
          let tile = {
              type: item.type,
              name: item.triggerType || item.activityType,
              homepage: item.homepage || ''
          };
          let index = tiles.findIndex((obj)=> {
            return tile.type == obj.type && tile.name == obj.name;
          });
          if(index == -1) {
            tiles.push(tile);
          }
        }

      }
    }

  return tiles;

}

/**
 *
 * @param triggerName: string
 * @returns {*}
 */
function _getTriggerByName(triggerName) {
  let _dbTrigger = triggersDBService;
  let trigger = triggerName;

  return new Promise(function (resolve, reject) {
    _dbTrigger.db
      .query(function(doc, emit) {emit(doc._id);}, {key:trigger, include_docs:true})
      .then(function (response) {
        let rows = response&&response.rows||[];
        let doc = rows.length > 0 ? rows[0].doc : null;
        resolve(doc);

      }).catch(function (err) {
      reject(err);
    });
  });
}


/**
 *
 * @param activityName: string
 * @returns {*}
 */
function _getActivityByName(activityName) {
  let _dbActivities = activitiesDBService;
  let activity = activityName;

  return new Promise(function (resolve, reject) {
    _dbActivities.db
      .query(function(doc, emit) {emit(doc._id);}, {key:activity, include_docs:true})
      .then(function (response) {
        let rows = response&&response.rows||[];
        let doc = rows.length > 0 ? rows[0].doc : null;
        resolve(doc);

      }).catch(function (err) {
      reject(err);
    });
  });
}


function _activitySchemaToTrigger(schema) {
  let trigger = {
    type: FLOGO_TASK_TYPE.TASK_ROOT,
    triggerType: _.get(schema, 'name', ''),
    name: _.get(schema, 'name', ''),
    version: _.get(schema, 'version', ''),
    title: _.get(schema, 'title', ''),
    description: _.get(schema, 'description', ''),
    settings: _.get(schema, 'settings', ''),
    outputs: _.get(schema, 'outputs', ''),
    endpoint: { settings: _.get(schema, 'endpoint.settings', '') }
  };

  _.each(
    trigger.outputs, (output) => {
      // convert to task enumeration and provision default types
      _.assign( output, portAttribute( output ) );
    }
  );

  return trigger;
}

function _isRequiredConfiguration(schema) {
  var inputs = _.get(schema, 'inputs', []);
  var index =  _.findIndex(inputs, function (input) {return input.required == true; } );

  return (index !== -1);
}

// mapping from schema.json of activity to the task can be used in flow.json
function _activitySchemaToTask(schema) {

  let task = {
    type: FLOGO_TASK_TYPE.TASK,
    activityType: _.get(schema, 'name', ''),
    name: _.get(schema, 'title', _.get(schema, 'name', 'Activity')),
    version: _.get(schema, 'version', ''),
    title: _.get(schema, 'title', ''),
    description: _.get(schema, 'description', ''),
    attributes: {
      inputs: _.get(schema, 'inputs', []),
      outputs: _.get(schema, 'outputs', [])
    },
    __props: {
      warnings:[]
    }
  };

  if(_isRequiredConfiguration(schema)) {
    task.__props.warnings.push({msg:"Configure Required"});
  }

  _.each(
    task.attributes.inputs, (input) => {
      // convert to task enumeration and provision default types
      _.assign( input, portAttribute( input, true ) );
    }
  );

  _.each(
    task.attributes.outputs, (output) => {
      // convert to task enumeration and provision default types
      _.assign( output, portAttribute( output ) );
    }
  );

  return task;
}

function portAttribute(inAttr, withDefault) {
  if (withDefault === void 0) { withDefault = false; }
  var outAttr = _.assign({}, inAttr);

  outAttr.type =  FLOGO_TASK_ATTRIBUTE_TYPE[_.get(outAttr, 'type', 'STRING').toUpperCase()];

  if (withDefault && _.isUndefined(outAttr.value)) {
    outAttr.value = getDefaultValue(outAttr.type);
  }
  return outAttr;
}

// get default value of a given type
function getDefaultValue(type) {
  let defaultValues = [];

  defaultValues[FLOGO_TASK_ATTRIBUTE_TYPE.STRING] = '';
  defaultValues[FLOGO_TASK_ATTRIBUTE_TYPE.INTEGER] = 0;
  defaultValues[FLOGO_TASK_ATTRIBUTE_TYPE.NUMBER] = 0.0;
  defaultValues[FLOGO_TASK_ATTRIBUTE_TYPE.BOOLEAN] = false;
  defaultValues[FLOGO_TASK_ATTRIBUTE_TYPE.OBJECT] = null;
  defaultValues[FLOGO_TASK_ATTRIBUTE_TYPE.ARRAY] = [];
  defaultValues[FLOGO_TASK_ATTRIBUTE_TYPE.PARAMS] = null;

  return defaultValues[ type ];
}


/**
 *
 * @param id: string
 * @returns {*}
 */
function _getFlowById(id) {

  let options = {
    include_docs: true,
    startKey: `${FLOW}${DELIMITER}${DEFAULT_USER_ID}${DELIMITER}`,
    endKey: `${FLOW}${DELIMITER}${DEFAULT_USER_ID}${DELIMITER}\uffff`
  };

  // TODO:  replace with a persistent query: https://pouchdb.com/guides/queries.html
  return _dbService.db
    .query(function(doc, emit) { emit(doc.name);  }, options)
    .then((response) => {
      let flow = null;
      let rows = response&&response.rows||[];

      rows.forEach((item)=>{
        // if this item's tabel is FLOW
        if(item&&item.doc&&item.doc.$table === FLOW && item.doc._id === id){
          flow = item.doc;
        }
      });

      return flow;
    });
}
