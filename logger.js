"use strict";

var util = require('util');

function Logger(name) {
    this.name = name;
}

Logger.prototype.trace = function (msg) { util.log('[TRACE] ' + msg); }
Logger.prototype.debug = function (msg) { util.log('[DEBUG] ' + msg); }
Logger.prototype.info  = function (msg) { util.log('[INFO ] ' + msg); }
Logger.prototype.warn  = function (msg) { util.log('[WARN ] ' + msg); }
Logger.prototype.error = function (msg) { util.log('[ERROR] ' + msg); }

module.exports = function (name) { return new Logger(name); }
