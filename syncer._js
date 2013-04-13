"use strict";

var fs = require('fs');
var path = require('path');
var url = require('url');
var EE = require('events').EventEmitter;
var util = require('util');

var glob = require('glob');
var backoff = require('backoff');

var clie = require('./clie');

function Datadir(config) {
    EE.call(this);
    this.sizes = {};
    this.inodes = {};
    var files = glob.sync(this.config.datadir + '/*', {nonull: false});
    for (var i = 0; i < files.length; i++) {
        var stats = fs.statSync(files[i]);
        if (!stats.isFile()) continue;
        this.sizes[files[i]] = stats.size;
        this.inodes[stats.ino] = files[i];
        // XXX: emit?
    }
}
util.inherits(Datadir, EE);

Datadir.prototype.add_file = function (fn) {
    if (typeof this.sizes[fn] !== 'undefined') {
        return;
    }
    var stats = fs.statSync(fn);
    this.sizes[fn] = stats.size;
    this.inodes[stats.ino] = fn;
    // XXX: emit?
}

Datadir.prototype.has_inode = function (ino) {
    if (typeof this.inodes[ino] !== 'undefined') {
        return true;
    } else {
        return false;
    }
}

function SyncHandler(config) {
    this.config = config;
    this.datadir = this.config.datadir;
    this.names = {};
    this.inodes = {};
    this.watches = {};
    this.targets = {};
    for (var k in this.config.destinations) {
        var dest = this.config.destinations[k];
        this.targets[k] = new HttpSyncTarget(dest.url, this.datadir);
    }
    var files = fs.readdirSync(this.datadir);
    for (var i = 0; i < files.length; i++) {
        if (files[i].indexOf('.tmp.') === 0) {
            fs.unlinkSync(path.join(this.datadir, files[i]));
        } else {
            var stat = fs.statSync(path.join(this.datadir, files[i]));
            this.names[files[i]] = true;
            this.inodes[stat.ino] = files[i];
            for (var k in this.targets) {
                this.targets[k].add_file(files[i]);
            }
        }
    }
    this.scanner = new Scanner(this.datadir, this.has_file.bind(this), this.config);
    this.scanner.on('added', this.add_file.bind(this));
}

SyncHandler.prototype.has_file = function (fn, stat) {
    if (this.inodes[stat.ino]) return true;
    else return false;
}

SyncHandler.prototype.start = function () {
    var self = this;
    for (var k in this.targets) {
        this.targets[k].trigger_all();
    }
    for (var k in this.names) {
        this.watches[k] = fs.watch(path.join(this.datadir, k), function (event, filename) {
            console.log(event, filename);
            self.trigger_file(filename);
        });
    }    
    this.scanner.scanloop(function (err, val) {
        if (err) console.log('SCANLOOP ERR: ' + err);
        else console.log('SCANLOOP FINISHED!');
    });
}

SyncHandler.prototype.add_file = function (name) {
    var self = this;
    var stat = fs.statSync(path.join(this.datadir, name));
    this.names[name] = true;
    this.inodes[stat.ino] = name;
    for (var k in this.targets) {
        this.targets[k].add_file(name);
        this.targets[k].trigger_file(name);
    }
    this.watches[name] = fs.watch(path.join(this.datadir, name), function (event, filename) {
        console.log(event, filename);
        self.trigger_file(filename);
    });
}

SyncHandler.prototype.trigger_file = function (name) {
    for (var k in this.targets) {
        this.targets[k].trigger_file(name);
    }
}

function Scanner(destdir, tester, config) {
    EE.call(this);
    this.destdir = destdir;
    this.tester = tester;
    this.logpaths = config.logpaths || [];
    this.scan_interval = config.scan_interval || 30000;
}
util.inherits(Scanner, EE);

Scanner.prototype.scanloop = function (_) {
    do {
        console.log('STARTING SCAN');
        try {
            this.do_scans(_);
        } catch (e) {
            console.log('SCAN ERROR: ' + e);
        }
        setTimeout(_, this.scan_interval);
    } while (!this.exit)
}

Scanner.prototype.do_scans = function (_) {
    var statcache = {};
    for (var i = 0; i < this.logpaths.length; i++) {
        var logpath = this.logpaths[i];
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
    if (!stats.isFile() || stats.size < 1 || this.tester(fn, stats)) {
        return false;
    }
    var tmppath = path.join(this.destdir, '.tmp.' + stats.ino);
    fs.link(fn, tmppath, _);
    if (fs.stat(tmppath, _).ino === stats.ino) {
        var realname = logpath.name + '.' + stats.mtime.getTime();
        fs.link(tmppath, path.join(this.destdir, realname), _);
        fs.unlink(tmppath, _);
        this.emit('added', realname);
        return true;
    } else {
        fs.unlink(tmppath, _);
        console.log('FILE SWAPPED OUT FROM UNDERNEATH, UNLINKING: ' + path.basename(fn));
        // XXX: trigger rescan?
        return false;
    }
}

function HttpSyncTarget(base_url, source_dir) {
    this.base_url = base_url; // XXX: base url must end in slash
    this.source_dir = source_dir;
    this.syncers = {};
}

HttpSyncTarget.prototype.add_file = function (name) {
    if (this.syncers[name]) return;
    var sync = new FileSyncer(url.resolve(this.base_url, name), path.join(this.source_dir, name));
    sync.on('insync', function () { console.log('IN SYNC!'); });
    sync.on('sending', function () { console.log('SENDING!'); });
    sync.on('piece', function (start, end) { console.log('  PIECE: ' + start + '-' + end); });
    sync.on('error', function (err) { console.log('ERROR: ' + err); console.log(err.stack); });
    this.syncers[name] = sync;
}

HttpSyncTarget.prototype.trigger_all = function () {
    for (var k in this.syncers) {
        this.syncers[k].trigger_sync();
    }
}

HttpSyncTarget.prototype.trigger_file = function (name) {
    if (!this.syncers[name]) return;
    this.syncers[name].trigger_sync();
}

var BLOCKSIZE = 1024*1024;

function FileSyncer(target_url, source_path) {
    EE.call(this);
    this.target_url = target_url;
    this.source_path = source_path;
    this.local_size = null;
    this.remote_size = null;
    this.state = 'INIT';
    this.last_err = null;
    this.triggered = false;
    this.backoff_strategy = new backoff.FibonacciStrategy({
        randomizationFactor: 0.1,
        initialDelay: 1000,
        maxDelay: 300000,
    });
    this.call = null;
}
util.inherits(FileSyncer, EE);

FileSyncer.prototype.trigger_sync = function () {
    if (this.state === 'INSYNC' || this.state === 'INIT') {
        this.start_send_file();
    } else {
        this.triggered = true;
    }
}

FileSyncer.prototype.start_send_file = function () {
    var self = this;
    this.call = backoff.call(function (cb) {
        self.send_file(cb);
    }, function (err, val) {
        self.call = null;
        if (err) throw new Error('backoff call bailed out!');
        if (self.triggered) {
            self.triggered = false;
            return self.start_send_file(); // XXX: maybe delay?
        } else {
            self.state = 'INSYNC';
            self.emit('insync');
        }
    });
    this.call.on('call', function (args) {
        self.state = 'SENDING';
        self.emit('sending');
    });
    this.call.on('backoff', function (number, delay, err) {
        self.remote_size = null;
        self.last_err = err;
        self.state = 'ERROR';
        self.emit('error', self.last_err);
    });
    this.call.failAfter(99999999); // XXX: upstream bug not, default failAfter
    this.call.setStrategy(this.backoff_strategy);
    this.call.start();
}

FileSyncer.prototype.send_file = function (_) {
    if (this.remote_size == null) {
        this.remote_size = clie.get_remote_size(this.target_url, _);
    }
    this.local_size = clie.get_local_size(this.source_path, _);
    while (this.local_size > this.remote_size) {
        var len = Math.min(BLOCKSIZE, this.local_size-this.remote_size)
        this.emit('piece', this.remote_size, this.remote_size + len);
        this.remote_size = clie.send_piece(this.target_url, this.source_path, this.remote_size, len, this.local_size, _);
        this.local_size = clie.get_local_size(this.source_path, _);
    }
}

exports.Scanner = Scanner;
exports.SyncHandler = SyncHandler;
exports.HttpSyncTarget = HttpSyncTarget;
exports.FileSyncer = FileSyncer;
