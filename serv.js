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

var http = require('http');

var server = require('./server');

require('js-yaml')

var config = require('./lognimbus-client-config.yaml');
var ss = new server.SyncServer(config.datadir);

// TODO: parse hostname and port

http.createServer(ss.handle_raw_request.bind(ss)).on('connection', function(socket) {
  socket.setTimeout(5000);
}).listen(8080);
