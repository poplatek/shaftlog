"use strict";

var http = require('http');

var server = require('./server');

var sw = new server.SyncWriter('/home/naked/github/lognimbus/servdir');

http.createServer(sw.handle_raw_request.bind(sw)).on('connection', function(socket) {
  socket.setTimeout(5000);
}).listen(8080);
