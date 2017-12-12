import cp from 'child_process';
import path from 'path';

import gulp from 'gulp';
import nodemon from 'gulp-nodemon';

import {CONFIG} from '../../config';

/**
 *
 */
gulp.task('prod.start', 'Starts server app and db in production mode', [], () => {

  // cp.spawn('npm', ['run', 'start-db'], {cwd: CONFIG.paths.dist.server, stdio: 'inherit'});
  nodemon({
    // DON'T use cwd here, it will change the whole gulp process cwd
    exec: `npm --prefix="${CONFIG.paths.dist.server}" run start-prod-server`,
    ingore: CONFIG.paths.serverWatchIgnore.map(watchPath => path.posix.join(CONFIG.paths.dist.server, watchPath))
  })
  .on('start', () => {
    process.env['FLOGO_SKIP_PKG_INSTALL'] = true;
  });

  process.title = 'flogoweb';
  process.on('SIGINT', function() {
    setTimeout(function() {
      process.exit(1);
    }, 500);
  });

});
