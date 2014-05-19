"use strict";

var program = require('commander');
program
    .version('0.0.1')
    .option('-d, --debug', 'enable debugging')
    .option('-s, --stdout', 'write log messages to stdout')
    .option('-f, --config <path>', 'path to configuration file')
    // UNIMPLEMENTED: .option('-o, --one-shot', 'run log synchronization in one shot mode')
    // UNIMPLEMENTED: .option('-b, --base <path>', 'treat base as filesystem root')
    .parse(process.argv);

var CONFIG_PATH = '/etc/shaftlog-client-config.yaml';
var DEFAULT_LOGFILE = '/var/log/shaftlog-client.log';
var DEFAULT_DATADIR = '/var/log/shaftlog-client';
var DEFAULT_SCAN_INTERVAL = 30000;
var DEFAULT_STATUS_INTERVAL = 300000;

var path = require('path');
var fs = require('fs');
var yaml = require('js-yaml');

var logger = require('./logger');

var config_path = path.resolve('.', program.config || CONFIG_PATH);
var config;
try {
    var config_data = fs.readFileSync(config_path, 'utf-8');
    config = yaml.load(config_data, {filename: config_path, strict: true});

    logger.initialize(config.logfile || DEFAULT_LOGFILE, program.debug ? 'DEBUG' : 'INFO', program.stdout);
} catch (e) {
    console.error('could not load config file: ' + e);
    process.exit(1);
    return;
}

var client = require('./client');
var sc = new client.SyncClient(config.datadir || DEFAULT_DATADIR, config.destinations || [], config.scan_paths || [],
                               config.scan_interval || DEFAULT_SCAN_INTERVAL, config.status_interval || DEFAULT_STATUS_INTERVAL);
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
