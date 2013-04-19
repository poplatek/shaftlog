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

var CONFIG_PATH = '/etc/lognimbus-server-config.yaml';

var http = require('http');

var server = require('./server');

require('js-yaml')

var config = require(program.config || CONFIG_PATH);
var ss = new server.SyncServer(config.datadir);

http.createServer(ss.handle_raw_request.bind(ss)).on('connection', function(socket) {
  socket.setTimeout(config.idle_timeout);
}).listen(config.listen_port, config.bind_address);
