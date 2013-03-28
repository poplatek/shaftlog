"use strict";

var fs = require('fs');
var path = require('path');

var glob = require('glob');

function Scanner(config) {
    this.config = config;
    this.exit = false;
    this.inodes = {};
    var files = glob.sync(this.config.datadir + '/*', {nonull: false});
    for (var i = 0; i < files.length; i++) {
        var stats = fs.statSync(files[i]);
        if (!stats.isFile()) continue;
        this.inodes[stats.ino] = files[i];
    }
}

Scanner.prototype.scanloop = function (_) {
    do {
        console.log('STARTING SCAN');
        try {
            this.do_scans(_);
        } catch (e) {
            console.log('SCAN ERROR: ' + e);
        }
        setTimeout(_, this.config.scan_interval);
    } while (!this.exit)
}

Scanner.prototype.do_scans = function (_) {
    var statcache = {};
    for (var i = 0; i < this.config.logpaths.length; i++) {
        var logpath = this.config.logpaths[i];
        var files = glob(logpath.pattern, {nonull: false, statCache: statcache}, _);
        for (var j = 0; j < files.length; j++) {
            try {
                this.handle_file(files[j], logpath, _);
            } catch (e) {
                console.log('FILE ERROR: ' + e);
            }
        }
    }
}

Scanner.prototype.handle_file = function (path, logpath, _) {
    var stats = fs.stat(path, _);
    if (!stats.isFile() || typeof this.inodes[stats.ino] !== 'undefined') {
        return false;;
    }
    var tmppath = this.config.datadir + '/.tmp.' + stats.ino;
    fs.link(path, tmppath, _);
    if (fs.stat(tmppath, _).ino === stats.ino) {
        var realpath = this.config.datadir + '/' + logpath.name + '.' + stats.mtime.getTime();
        fs.link(tmppath, realpath, _);
        this.inodes[stats.ino] = realpath;
        fs.unlink(tmppath, _);
        console.log('DETECTED NEW FILE: ' + path + ' -> ' + realpath);
        return true;
    } else {
        fs.unlink(tmppath, _);
        return false;
    }
}

exports.Scanner = Scanner;
