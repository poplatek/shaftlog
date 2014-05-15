"use strict";

var util = require('util');
var fs = require('fs');

var logpath = null;
var logstream = process.stderr;
var logino = null;
var loglevel = 2;

var levels = {
    TRACE: 0,
    DEBUG: 1,
    INFO: 2,
    WARN: 3,
    ERROR: 4
}

function rawlog(name, level, msg) {
    if (levels[level] < loglevel) return;
    logstream.write(new Date().toISOString() + ' ' + level + ' ' + name + ': ' + msg + '\n');
}

exports = module.exports = function (name) {
    return {
        trace: rawlog.bind(null, name, 'TRACE'),
        debug: rawlog.bind(null, name, 'DEBUG'),
        info: rawlog.bind(null, name, 'INFO'),
        warn: rawlog.bind(null, name, 'WARN'),
        error: rawlog.bind(null, name, 'ERROR')
    }
}

var log = exports('logger');

function initialize(path, level, stdout) {
    if (stdout) {
        logstream = process.stdout;
    } else {
        logpath = path;
        var fd = fs.openSync(logpath, 'a');
        var ino = fs.fstatSync(fd).ino;
        var ws = fs.createWriteStream(logpath, {fd: fd, encoding: 'utf8'});
        // XXX: add handler for listening 'error'
        logstream = ws;
        logino = ino;
    }
    loglevel = levels[level] || 0;
    log.info('log stream opened');
}

function reopen() {
    if (logpath == null) {
        return;
    }
    var fd = fs.openSync(logpath, 'a');
    var ino = fs.fstatSync(fd).ino;
    if (ino === logino) {
        fs.closeSync(fd);
        log.warn('logfile reopened but did not change');
        return;
    }
    log.info('log stream closed before reopen');
    logstream.end();
    var ws = fs.createWriteStream(logpath, {fd: fd, encoding: 'utf8'});
    logstream = ws;
    logino = ino;
    log.info('log stream opened after reopen');
}

function close() {
    log.info('log stream closed');
    if (logpath != null) {
        logstream.end();
    }
    logpath = null;
    logstream = process.stderr;
    logino = null;
}

exports.initialize = initialize;
exports.reopen = reopen;
exports.close = close;
