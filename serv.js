"use strict";

var http = require('http');
var url = require('url');
var path = require('path');

var terr = require('tea-error');

var HttpError = terr('HttpError');

function write_response(response, status_code, status_message, body) {
    if (status_message) {
        response.writeHead(status_code, status_message, {'Content-Type': 'text/plain'});
    } else {
        response.writeHead(status_code, {'Content-Type': 'text/plain'});
    }
    if (body) {
        response.write(body);
    }
    response.end();
}

function run_handler(handler, request, response) {
    return handler(request, function (err, val) {
        if (err) {
            if (err.http_error) {
                if (err.http_message) {
                    response.writeHead(err.http_error, err.http_message, {'Content-Type': 'text/plain'});
                } else {
                    response.writeHead(err.http_error, {'Content-Type': 'text/plain'});
                }
                if (err.http_body) {
                    response.write(err.http_body);
                }
            } else {
                response.writeHead(500, {'Content-Type': 'text/plain'});
                response.write(err.stack); // XXX: remove when disabling debug
                response.end();
            }
        } else {
            
        }
        response.end();
    });
}

function handle_head(request, response) {
    var uri = url.parse(request.url).pathname
    var filename = path.join(process.cwd(), uri);

    console.log(uri);
    console.log(filename);
    response.writeHead(200, {'Content-Type': 'text/plain',
                             'Content-Length': 123,
                             'Last-Modified': 'XXX'});
    response.end();
    return;

    response.writeHead(404, {'Content-Type': 'text/plain'});
    response.end();
    return;
}

function handle_put(request, response) {
    
    response.writeHead(204, {'Content-Type': 'text/plain',
                             'Content-Length': 123,
                             'Last-Modified': 'XXX'});
    response.end();
    return;
}

http.createServer(function (request, response) {
    if (request.method === 'HEAD') {
        handle_head(request, response);
    } else if (request.method === 'GET') {
        response.statusCode = 404;
        response.setHeader('Content-Type', 'text/plain');
        response.write('wadafaka\n');
        response.end();
        return;
        //handle_put(request, response);
    } else {
        response.writeHead(501, {'Content-Type': 'text/plain'});
        response.end();
        return;
    }
}).on('connection', function(socket) {
  socket.setTimeout(5000);
}).listen(8080);
