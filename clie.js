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
    .option('-b, --base <path>', 'treat base as filesystem root')
    .option('-d, --debug', 'enable debugging')
    .option('-f, --config <path>', 'path to configuration file')
    .option('-o, --one-shot', 'run log synchronization in one shot mode')
    .parse(process.argv);

var CONFIG_PATH = '/etc/shaftlog-client-config.yaml';
var DEFAULT_SCAN_INTERVAL = 30000;

var path = require('path');
var fs = require('fs');
var yaml = require('js-yaml');

var logger = require('./logger');

var config_path = path.resolve('.', program.config || CONFIG_PATH);
var config;
try {
    var config_data = fs.readFileSync(config_path, 'utf-8');
    config = yaml.load(config_data, {filename: config_path,
                                     strict: true});
    if (!config.datadir) throw new Error('datadir must be specified in configuration');
    if (!config.logfile) throw new Error('logfile path must be specified in configuration');
    if (!config.scan_paths) throw new Error('scan paths must be specified in configuration (but may be empty)');
    if (!config.destinations) throw new Error('destinations must be specified in configuration (but may be empty)');
    
    // TODO: enforce that destination urls must end in slashes

    logger.initialize(config.logfile, program.debug ? 'DEBUG' : 'INFO');
} catch (e) {
    console.error('could not load config file: ' + e);
    process.exit(1);
    return;
}

var client = require('./client');
var sc = new client.SyncClient(config.datadir, config.destinations, config.scan_paths, config.scan_interval || DEFAULT_SCAN_INTERVAL);
sc.start();

process.on('SIGHUP', function () {
    logger.reopen();
});
process.on('SIGINT', function () {
    sc.close();
});
process.on('SIGTERM', function () {
    sc.close();
});
process.on('exit', function () {
    logger.close();
});
