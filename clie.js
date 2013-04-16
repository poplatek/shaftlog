#!/usr/bin/node
"use strict";

require('streamline').register({
//    fibers: true,
    cache: true,
    verbose: false
});

var program = require('commander');

program
    .version('0.0.1')
    .option('-d, --debug', 'enable debugging')
    .option('-o, --one-shot', 'run log synchronization in one shot mode')
    .option('-f, --config <path>', 'path to configuration file')
    .option('-b, --base <path>', 'treat base as filesystem root')
    .parse(process.argv);

var client = require('./client');

var config = require('./config.json');
var sh = new client.SyncHandler(config);
sh.start();
