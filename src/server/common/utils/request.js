import { readFileSync } from 'fs';
import _ from 'lodash';
import { ErrorManager, ERROR_TYPES } from '../../common/errors';

import { isJSON } from '../../common/utils';

export function retrieveJsonFromRequest(ctx, fileName) {
  fileName = fileName || 'request.body.files.importFile';

  let data = ctx.request.body||{};
  if (ctx.headers['content-type'].startsWith('multipart/form-data')) {

    console.log( '[INFO] Retriving Json from request' );

    let importedFile = _.get(ctx, fileName);

    if ( _.isObject( importedFile ) && !_.isEmpty( importedFile ) ) {

      // only support `application/json`
      if ( importedFile.type !== 'application/json' ) {
        console.error( '[ERROR]: ', importedFile );
        throw ErrorManager.makeError('Unsupported file type',
          { type: ERROR_TYPES.COMMON.VALIDATION,
            details:{
              errors: [
                {
                  title: 'Unsupported file type',
                  detail: 'Support application/json only.'
                }
              ]
            }});
      } else {
        /* processing the imported file */

        let fileContent;
        // read file data into string
        try {
          // TODO remove synchronous method
          fileContent = readFileSync( importedFile.path, { encoding : 'utf-8' } );
        } catch ( err ) {
          console.error( '[ERROR]: ', err );
          ctx.throw( 500, 'Cannot read the uploaded file.', { expose : true } );
        }

        // parse file to object
        try {
          data = JSON.parse( fileContent );
        } catch ( err ) {
          console.error( '[ERROR]: ', err );

          throw ErrorManager.makeError('Invalid JSON data',
            { type: ERROR_TYPES.COMMON.VALIDATION,
              details:{
                errors: [
                  {
                    title: 'Invalid JSON data',
                    detail: 'Error parsing JSON file'
                  }
                ]
              }});
        }

      }
    } else {
      ctx.throw( 400, 'Invalid file.' );
    }

  } else if(typeof data == 'string' && isJSON(data)) {
    data = JSON.parse(data);
  }
  return data;
}