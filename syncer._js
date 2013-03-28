"use strict";

var fs = require('fs');
var path = require('path');

var glob = require('glob');

var clie = require('./clie');

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

Scanner.prototype.handle_file = function (fn, logpath, _) {
    var stats = fs.stat(fn, _);
    if (!stats.isFile() || typeof this.inodes[stats.ino] !== 'undefined') {
        return false;
    }
    var tmppath = this.config.datadir + '/.tmp.' + stats.ino;
    fs.link(fn, tmppath, _);
    if (fs.stat(tmppath, _).ino === stats.ino) {
        var realpath = this.config.datadir + '/' + logpath.name + '.' + stats.mtime.getTime();
        fs.link(tmppath, realpath, _);
        this.inodes[stats.ino] = realpath;
        fs.unlink(tmppath, _);
        console.log('DETECTED NEW FILE: ' + path.basename(fn) + ' -> ' + path.basename(realpath));
        return true;
    } else {
        fs.unlink(tmppath, _);
        console.log('FILE SWAPPED OUT FROM UNDERNEATH, UNLINKING: ' + path.basename(fn));
        // XXX: trigger rescan?
        return false;
    }
}

var BLOCKSIZE = 1024*1024;

function Syncer(target_url, source_path) {
    this.target_url = target_url;
    this.source_path = source_path;
    this.local_size = null;
    this.remote_size = null;
}

function trigger_sync() {
}

function sync_file(_) {
    if (this.state !== 'INSYNC') {
        this.state = 'HEAD';
        this.remote_size = clie.get_remote_size(this.target_url, _);
    }
    this.state = 'SENDING';
    this.local_size = clie.get_local_size(this.source_path, _);
    while (this.local_size > this.remote_size) {
        this.remote_size = clie.send_piece(this.target_url, this.source_path, this.remote_size, Math.min(BLOCKSIZE, this.local_size-this.remote_size), this.local_size, _);
        this.local_size = clie.get_local_size(this.source_path, _);
    }
    this.state = 'INSYNC';
}

function sync_file_backoff(_) {
    while (true) {
        try {
            return this.sync_file(_);
        } catch (e) {
            this.state = 'ERROR';
            console.log('GOT ERROR, RETRYING: ' + e);
            // XXX: wait backoff
        }
    }
}

function SyncTarget(target_baseurl, source_dir) {
    this.target_baseurl = target_baseurl;
    this.source_dir = source_dir;
    this.states
}

exports.sync_file = sync_file;
exports.sync_file_backoff = sync_file_backoff;
exports.Scanner = Scanner;
