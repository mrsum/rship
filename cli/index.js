'use strict';

// ======================
// Depends
// ======================
const program = require('commander');
const colors = require('colors');
const registry = require('./libs/registry');
const packageJson = require('../package');

/**
 * SHIP.CLI
 * @param  {[type]} __CWD  [description]
 * @param  {[type]} __ROOT [description]
 * @param  {[type]} config [description]
 * @return {[type]}        [description]
 */
module.exports = function(__CWD, __ROOT, config) {
  // get version and description from package.json file
  const { version, description } = packageJson;

  // define program
  program
    .version(colors.green(version))
    .description(colors.blue(description));

  // register commands
  return registry(program, config,
    [
      require('./commands/new'),
      require('./commands/setup'),
      require('./commands/run'),
      require('./commands/install'),
      require('./commands/remove')
    ]
  );
};