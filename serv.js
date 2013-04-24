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
    .option('-f, --config <path>', 'path to configuration file')
    .parse(process.argv);

var CONFIG_PATH = '/etc/shaftlog-server-config.yaml';
var DEFAULT_PORT = 10655;
var DEFAULT_ADDRESS = '0.0.0.0';

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

    logger.initialize(config.logfile, program.debug ? 'DEBUG' : 'INFO');
} catch (e) {
    console.error('could not load config file: ' + e);
    process.exit(1);
    return;
}

var http = require('http');
var server = require('./server');
var ss = new server.SyncServer(config.datadir, program.debug);
ss.start();

var srv = http.createServer(ss.handle_raw_request.bind(ss)).on('connection', function(socket) {
  socket.setTimeout(config.idle_timeout);
}).listen(config.listen_port || DEFAULT_PORT, config.bind_address || DEFAULT_ADDRESS);

process.on('SIGHUP', function () {
    logger.reopen();
});
process.on('SIGINT', function () {
    srv.close();
    ss.close();
});
process.on('SIGTERM', function () {
    srv.close();
    ss.close();
});
process.on('exit', function () {
    logger.close();
});
