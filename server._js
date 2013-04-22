"use strict";

var fs = require('fs');
var path = require('path');
var url = require('url');
var EE = require('events').EventEmitter;
var util = require('util');

var terr = require('tea-error');

var log = require('./logger')('server');

var HttpError = terr('HttpError');

function make_parent_directories(filename, _) {
    var dir = path.dirname(filename);
    try {
        fs.mkdir(dir, _);
    } catch (e) {
        if (e.code === 'ENOENT') {
            make_parent_directories(dir, _);
            fs.mkdir(dir, _);
        } else if (e.code == 'EEXIST') {
            return;
        } else {
            throw e;
        }
    }
}

function get_file_size(path, _) {
    try {
        var stat = fs.stat(path, _);
        return stat.size;
    } catch (e) {
        if (e.code === 'ENOENT') {
            return null;
        } else {
            throw e;
        }
    }
}

function pipe_request(request, stream, cb) {
    // XXX: maybe track success and last error or something?
    var done = false;
    stream.on('error', function (err) {
        if (done) return; done = true;
        cb(err);
    });
    stream.on('finish', function () {
        if (done) return; done = true;
        cb(null, true);
    });
    request.on('error', function (err) {
        if (done) return; done = true;
        cb(err);
    });
    request.on('close', function () {
        if (done) return; done = true;
        stream.end();
        cb(null, false);
    });
    request.pipe(stream);
    return;
}

function SyncServer(destdir, debug_mode) {
    this.destdir = destdir;
    this.locks = {};
    this.debug_mode = debug_mode === true;
}

SyncServer.prototype.validate_path = function (uri) {
    var m = uri.match(/^(\/([a-zA-Z0-9_-][a-zA-Z0-9._-]*)){1,}$/);
    if (!m) return false;
    return true;
}

SyncServer.prototype.handle_raw_request = function (request, response) {
    var self = this;
    return this.handle_request(request, response, function (err, val) {
        if (err) {
            if (err instanceof HttpError) {
                var msg = self.debug_mode ? err.stack : String(err) + '\n';
                if (err.http_status !== 404) log.warn('CLIENT ERROR: ' + err); // XXX: make better
                response.writeHead(err.http_status || 500, {'Content-Type': 'text/plain',
                                                            'Content-Length': msg.length});
                if (request.method !== 'HEAD') response.write(msg);
                response.end();
            } else {
                var msg = 'internal error\n';
                log.error('INTERNAL ERROR: ' + err); // XXX: make better
                if (self.debug_mode) msg += err.stack + '\n';
                response.writeHead(500, {'Content-Type': 'text/plain',
                                         'Content-Length': msg.length});
                if (request.method !== 'HEAD') response.write(msg);
                response.end();
            }
        } else {
            response.writeHead(val[0], val[1]);
            response.end();
        }
    });
}

SyncServer.prototype.handle_request = function (request, response, _) {
    if (request.method === 'HEAD') {
        return this.handle_head(request, response, _);
    } else if (request.method === 'PUT') {
        return this.handle_put(request, response, _);
    } else {
        throw new HttpError('only HEAD and PUT supported', {http_status: 501});
    }
}

SyncServer.prototype.handle_head = function (request, response, _) {
    var uri = url.parse(request.url).pathname
    if (!this.validate_path(uri)) throw new HttpError('request path not accepted', {http_status: 400});
    var filename = path.join(this.destdir, uri);
    // no locking as any such errors will be caught at PUT stage anyway
    var local_size = get_file_size(filename, _);
    if (local_size !== null) {
        return [200, {'Content-Length': String(local_size)}];
    } else {
        throw new HttpError('file does not exist', {http_status: 404});
    }
}

SyncServer.prototype.handle_put = function (request, response, _) {
    var uri = url.parse(request.url).pathname
    if (!this.validate_path(uri)) throw new HttpError('request path not accepted', {http_status: 400});
    var filename = path.join(this.destdir, uri);
    var cr = request.headers['content-range'];
    if (!cr) throw new HttpError('no content-range header', {http_status: 400});
    var m = cr.match(/^bytes ((\d+)-(\d+)|\*)\/((\d+)|\*)$/);
    if (!m) throw new HttpError('invalid content-range header', {http_status: 400});
    if (typeof m[2] === 'undefined') throw new HttpError('content-range must specify byte range', {http_status: 400});
    if (typeof m[5] === 'undefined') throw new HttpError('content-range must specify instance length', {http_status: 400});
    var start = +m[2], end = +m[3], len = end-start+1, size = +m[5];
    if (len < 1) throw new HttpError('content-range length must be greater than zero', {http_status: 400});
    if (start+len > size) throw new HttpError('invalid instance length in content-range', {http_status: 400});
    if (this.locks[filename]) throw new HttpError('concurrent operation on same file', {http_status: 409});
    this.locks[filename] = true;
    try {
        var local_size = get_file_size(filename, _);
        if (local_size == null) {
            local_size = 0;
            make_parent_directories(filename, _);
        }
        if (local_size > size) throw new HttpError('file is larger than specified in instance length', {http_status: 416});
        if (start !== local_size) throw new HttpError('only strict append is supported on file', {http_status: 416});
        var ws = fs.createWriteStream(filename, {flags: 'a'});
        var success = pipe_request(request, ws, _);
        if (!success) throw new HttpError('request was not fully processed', {http_status: 400});
        local_size = get_file_size(filename, _);
        return [204, {'Content-Length': '0'}]; // could be String(local_size), but atleast nodejs client does not treat 204 specially enough
    } finally {
        delete this.locks[filename];
    }
}

exports.SyncServer = SyncServer;
