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

var config_path = path.resolve('.', program.config || CONFIG_PATH);
var config;
try {
    var config_data = fs.readFileSync(config_path, 'utf-8');
    config = yaml.load(config_data, {filename: config_path,
                                     strict: true});
    // XXX: validate config
} catch (e) {
    console.error('could not load config file: ' + e);
    process.exit(1);
    return;
}

var http = require('http');
var server = require('./server');
var ss = new server.SyncServer(config.datadir, program.debug);

http.createServer(ss.handle_raw_request.bind(ss)).on('connection', function(socket) {
  socket.setTimeout(config.idle_timeout);
}).listen(config.listen_port || DEFAULT_PORT, config.bind_address || DEFAULT_ADDRESS);
