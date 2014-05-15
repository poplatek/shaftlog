"use strict";

var fs = require('fs');
var path = require('path');
var url = require('url');
var EE = require('events').EventEmitter;
var util = require('util');

var logger = require('./logger');

function setprops(dest, src) {
    for (var k in src) {
        dest[k] = src[k];
    }
    return dest;
}

function make_parent_directories(filename, _) {
    var dir = path.dirname(filename);
    try {
        fs.mkdir(dir, _);
    } catch (e) {
        if (e.code === 'ENOENT') {
            make_parent_directories(dir, _);
            try {
                fs.mkdir(dir, _);
            } catch (e) {
                if (e.code == 'EEXIST') {
                    return; // We might get an async race here so this is needed
                } else {
                    throw e;
                }
            }
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

function SyncServer(destdir, debug_mode, validate_regex) {
    this.destdir = destdir;
    this.locks = {};
    this.debug_mode = debug_mode === true;
    this.validate_regex = new RegExp(validate_regex);
    this.log = logger('server');
}

SyncServer.prototype.start = function () {
    this.log.info('log synchronization server starting');
}

SyncServer.prototype.close = function () {
    this.log.info('log synchronization server stopping');
}

SyncServer.prototype.validate_path = function (uri) {
    return this.validate_regex.test(uri);
}

SyncServer.prototype.handle_raw_request = function (request, response) {
    var self = this;
    return this.handle_request(request, response, function (err, val) {
        if (err) {
            if (err.http_status) {
                var msg = self.debug_mode ? err.stack : String(err) + '\n';
                if (err.http_status !== 404) self.log.warn('CLIENT ERROR: ' + err); // XXX: make better
                response.writeHead(err.http_status || 500, {'Content-Type': 'text/plain',
                                                            'Content-Length': msg.length});
                if (request.method !== 'HEAD') response.write(msg);
                response.end();
            } else {
                var msg = 'internal error\n';
                self.log.error('INTERNAL ERROR: ' + err); // XXX: make better
                if (self.debug_mode) {
                    self.log.error(err.stack);
                    msg += err.stack + '\n';
                }
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
        throw setprops(new Error('only HEAD and PUT supported'), {http_status: 501});
    }
}

SyncServer.prototype.handle_head = function (request, response, _) {
    var uri = path.join('/', url.parse(request.url).pathname);
    if (!this.validate_path(uri)) throw setprops(new Error('request path not accepted'), {http_status: 400});
    var filename = path.join(this.destdir, uri);
    // no locking as any such errors will be caught at PUT stage anyway
    var local_size = get_file_size(filename, _);
    if (local_size !== null) {
        return [200, {'Content-Length': String(local_size)}];
    } else {
        throw setprops(new Error('file does not exist'), {http_status: 404});
    }
}

SyncServer.prototype.handle_put = function (request, response, _) {
    var uri = path.join('/', url.parse(request.url).pathname);
    if (!this.validate_path(uri)) throw setprops(new Error('request path not accepted'), {http_status: 400});
    var filename = path.join(this.destdir, uri);
    var cr = request.headers['content-range'];
    if (!cr) throw setprops(new Error('no content-range header'), {http_status: 400});
    var m = cr.match(/^bytes ((\d+)-(\d+)|\*)\/((\d+)|\*)$/);
    if (!m) throw setprops(new Error('invalid content-range header'), {http_status: 400});
    if (typeof m[2] === 'undefined') throw setprops(new Error('content-range must specify byte range'), {http_status: 400});
    if (typeof m[5] === 'undefined') throw setprops(new Error('content-range must specify instance length'), {http_status: 400});
    var start = +m[2], end = +m[3], len = end-start+1, size = +m[5];
    if (len < 1) throw setprops(new Error('content-range length must be greater than zero'), {http_status: 400});
    if (start+len > size) throw setprops(new Error('invalid instance length in content-range'), {http_status: 400});
    if (this.locks[filename]) throw setprops(new Error('concurrent operation on same file'), {http_status: 409});
    this.locks[filename] = true;
    try {
        var local_size = get_file_size(filename, _);
        if (local_size == null) {
            local_size = 0;
            make_parent_directories(filename, _);
        }
        if (local_size > size) throw setprops(new Error('file is larger than specified in instance length'), {http_status: 416});
        if (start !== local_size) throw setprops(new Error('only strict append is supported on file'), {http_status: 416});
        var ws = fs.createWriteStream(filename, {flags: 'a'});
        var success = pipe_request(request, ws, _);
        if (!success) throw setprops(new Error('request was not fully processed'), {http_status: 400});
        local_size = get_file_size(filename, _);
        return [204, {'Content-Length': '0'}]; // could be String(local_size), but atleast nodejs client does not treat 204 specially enough
    } finally {
        delete this.locks[filename];
    }
}

exports.SyncServer = SyncServer;
