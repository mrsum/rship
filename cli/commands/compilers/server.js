'use strict';

// ======================
// Depends
// ======================
const cluster   = require('cluster');
const path      = require('path');
const util      = require('util');
const MemoryFS  = require('memory-fs');
const colors    = require('colors');
const webpack   = require('webpack');
const utils     = require('../utils');

/**
 * Server Compiler
 * @param {[type]} config [description]
 */
const ServerCompiler = function(config) {
  this.config = config || {};
};

/**
 * Start
 * @return {[type]} [description]
 */
ServerCompiler.prototype.start = function(devScreen) {
  const config = this.config;
  const { dir, cwd } = config;

  // define mmemory fs
  let fs = new MemoryFS();

  // get webpack configs
  let serverConfig = require(config.webpack.server)(config);

  // push modules directories
  serverConfig.resolve.modulesDirectories.push(`${cwd}/node_modules`);

  // prepare separated webpack instances
  let serverCompiler = webpack(serverConfig);

  // server file
  let serverFile = path.join(config.build.server.path, config.build.server.file);

  // get avaliable screens from blessed container
  let { memoryBlock, cpuBlock, compilingBlock, activeProcessBlock, logsBlock, screen } = devScreen;

  // define workers object
  // all changes will execute at separated process
  let workers = {
    main: false,  // current working process
    temp: false   // temporary process
  };

  // check version
  utils.getLatestVersion((err, lastVersion) => {
    let currentVersion = this.config.details.version;
    if (err) {
      utils.log(logsBlock, 'SHIP: Can\'t check last verion', 'red');
    }

    if (lastVersion > currentVersion ) {
      utils.log(logsBlock, `SHIP: Is outdated, current version is: ${currentVersion}, last version is: ${lastVersion}`, 'red'); 
      utils.log(logsBlock, `SHIP: Please update @see https://rambler-digital-solutions.github.io/rship/en/parts/update.html`, 'red'); 
    }
  });

  // run the trap!
  utils.log(logsBlock, 'SHIP: Initialize', 'green');
  utils.log(logsBlock, 'SHIP: Run client compile', 'green');
  utils.log(logsBlock, 'SHIP: Run server compile', 'green');

  /**
   * Create worker, also will subscrbe on process messages
   * @param  {Function} cb [description]
   * @return {[type]}      [description]
   */
  let createWorker = function(cb = function() {}) {
    // processes content
    let worker = cluster.fork({
      NODE_ENV: 'development',
      NODE_PATH: `${dir}/node_modules`
    }).on('online', cb);

    cluster.workers[worker.id].on('message', (msg) => {
      switch (msg.type) {
        case 'error' : utils.log(logsBlock, `ERROR: ${util.inspect(msg.data, { showHidden: true, depth: 5 })}`, 'red'); break;
        case 'log' : utils.log(logsBlock,   `LOG: ${util.inspect(msg.data, { showHidden: true, depth: 5  })}`, 'yellow'); break;
        case 'warn' : utils.log(logsBlock,  `WARN: ${util.inspect(msg.data, { showHidden: true, depth: 5 })}`, 'magenta'); break;
        case 'info' : utils.log(logsBlock,  `INFO: ${util.inspect(msg.data, { showHidden: true, depth: 5 })}`, 'blue'); break;
        case 'active-worker-usage': {
          let memoryBoxContent = [
            `${colors.yellow('Heap Total')}: ${utils.toUnits(msg.data.memory.heapTotal)}`,
            `${colors.yellow('Heap Used')}: ${utils.toUnits(msg.data.memory.heapUsed)}`
          ].join('\n');

          let cpuBoxContent = [
            `${colors.yellow('Spent')}: ${(msg.data.cpu.user / 1024).toFixed(2)} ms`,
            `${colors.yellow('Usage')}: ${(msg.data.cpuPersents).toFixed(2)} %`
          ].join('\n');

          activeProcessBlock.setContent(`${colors.yellow('Real PID')}: ${msg.data.pid} \n${colors.yellow('Uptime')}: ${msg.data.uptime.toFixed(0)} sec`);

          // set memory block content
          memoryBlock.setContent(memoryBoxContent);

          // set CPU block content
          cpuBlock.setContent(cpuBoxContent);

          // re render screen window
          screen.render();
        } break;
        default: null;
      }
    });

    return worker;
  };

  // create worker main worjer
  workers.main = createWorker(() => {
    utils.log(logsBlock, 'SHIP: created main worker PID#' + workers.main.id, 'white');
  });

  // files will save at memory
  serverCompiler.outputFileSystem = fs;

  // start watching source
  serverCompiler.watch({ poll: true }, function(err, stats) {
    let statistic = stats.toJson();

    if (stats.hasErrors()) {
      statistic.errors.forEach(error => {
        utils.log(logsBlock, 'SHIP: Webpack->Server->Error: ' + error, 'red');
      });
      return false;
    }

    if (stats.hasWarnings()) {
      statistic.warnings.forEach(warn => {
        utils.log(logsBlock, 'SHIP: Webpack->Server->Warning: ' + warn, 'magenta');
      });
      return false;
    } else {
      utils.log(logsBlock, 'SHIP: Webpack->Server->Hash: ' + statistic.hash, 'green');
    }

    utils.log(logsBlock, 'SHIP: Server compiled', 'green');

    if (fs.statSync(serverFile).isFile()) {
      // get file source code
      let sourceCode = stats.compilation.assets[config.build.server.file].source();

      // @TODO: Make good choice and parse source map for debugging
      // let sourceMap = stats.compilation.assets[config.build.server.file + '.map'].source();
      if (workers.temp) {
        utils.log(logsBlock, 'SHIP: kill worker PID#' +  workers.main.id);
        workers.main.kill('SIGTERM');
        workers.main.disconnect();
        workers.main = false;
        workers.main = workers.temp;
      }

      if (workers.main && workers.main.isConnected()) {
        workers.main.send(sourceCode, () => {
          workers.temp = createWorker(() => {
            utils.log(logsBlock, 'SHIP: created temp worker PID#' + workers.temp.id, 'white');
          });
        });
      }
    }

    let boxContent = [
      `${colors.cyan('Server')}: ${stats.hash}`,
      `${colors.red('Errors')}: ${statistic.errors.length}`
    ].join('\n');

    compilingBlock.setContent(boxContent);

    screen.render();
    return true;
  });


};

module.exports = ServerCompiler;
