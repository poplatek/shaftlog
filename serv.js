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

var config = require('./lognimbux-client-config.yaml');
var sw = new server.SyncWriter(config.datadir);

// XXX: parse hostname and port

http.createServer(sw.handle_raw_request.bind(sw)).on('connection', function(socket) {
  socket.setTimeout(5000);
}).listen(8080);
