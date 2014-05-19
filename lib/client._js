"use strict";

var fs = require('fs');
var path = require('path');
var http = require('http');
var url = require('url');
var EE = require('events').EventEmitter;
var util = require('util');
var os = require('os');

var glob = require('glob');
var minimatch = require('minimatch');
var backoff = require('backoff');
var ForeverAgent = require('forever-agent');

var logger = require('./logger');

var BLOCKSIZE = 1024*1024;
var REQUEST_TIMEOUT = 30000;
var BACKOFF_INITIAL_DELAY = 1000;
var BACKOFF_MAX_DELAY = 300000;

function format(str, col) {
    col = typeof col === 'object' ? col : Array.prototype.slice.call(arguments, 1);

    return str.replace(/\{\{|\}\}|\{(\w+)\}/g, function (m, n) {
        if (m == "{{") { return "{"; }
        if (m == "}}") { return "}"; }
        return col[n];
    });
};

function get_machine_id(datadir) {
    try {
        return fs.readFileSync('/etc/machine-id', {encoding: 'utf-8'}).trim();
    } catch (e) { }
    try {
        return fs.readFileSync('/var/lib/dbus/machine-id', {encoding: 'utf-8'}).trim();
    } catch (e) { }
    if (!fs.existsSync(path.join(datadir, '.machine-id'))) {
        try {
            var uuid = require('crypto').randomBytes(16);
            uuid[6] = (uuid[6] & 0x0f) | 0x40;
            uuid[8] = (uuid[8] & 0x3f) | 0x80;
            fs.writeFileSync(path.join(datadir, '.machine-id'), uuid.toString('hex') + '\n', {encoding: 'utf-8'});
        } catch (e) {}
    }
    try {
        return fs.readFileSync(path.join(datadir, '.machine-id'), {encoding: 'utf-8'}).trim();
    } catch (e) {}
    return '_unknown_';
}

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

function SyncClient(datadir, destinations, scan_paths, scan_interval, status_interval) {
    this.datadir = datadir;
    this.destinations = destinations;
    this.scan_paths = scan_paths;
    this.scan_interval = scan_interval;
    this.status_interval = status_interval;
    this.names = {};
    this.inodes = {};
    this.watches = {};
    this.targets = {};
    this.replacements = {
        hostname: os.hostname(),
        machine: get_machine_id(datadir)
    }
    this.log = logger('client');
    for (var k in this.destinations) {
        var dest = this.destinations[k];
        this.targets[k] = new HttpSyncTarget(format(dest.url, this.replacements), this.datadir);
    }
    var tmpfiles = glob.sync('**/.tmp.*', {cwd: this.datadir, nonull: false, silent: true});
    for (var i = 0; i < tmpfiles.length; i++) {
        this.log.debug('unlinking leftover temporary file: ' + path.join(this.datadir, tmpfiles[i]));
        fs.unlinkSync(path.join(this.datadir, tmpfiles[i]));
    }
    var files = glob.sync('**/*', {cwd: this.datadir, nonull: false, silent: true});
    for (var i = 0; i < files.length; i++) {
        var stat = fs.statSync(path.join(this.datadir, files[i]));
        if (!stat.isFile()) {
            continue;
        }
        this.names[files[i]] = true;
        this.inodes[stat.ino] = files[i];
        for (var k in this.targets) {
            this.targets[k].add_file(files[i]);
        }
    }
    this.scanner = new Scanner(this.datadir, this.has_file.bind(this), this.scan_paths, this.scan_interval);
    this.scanner.on('added', this.add_file.bind(this));
    this.statuslogger = new StatusLogger(this, this.status_interval);
}

SyncClient.prototype.has_file = function (fn, stat) {
    if (this.inodes[stat.ino]) return true;
    else return false;
}

SyncClient.prototype.start = function () {
    this.log.info('starting log synchronization');
    var self = this;
    for (var k in this.targets) {
        this.targets[k].start();
    }
    for (var k in this.names) {
        this.watches[k] = fs.watch(path.join(this.datadir, k), function (event, filename) {
            self.trigger_file(filename);
        });
    }
    this.scanner.start();
    this.statuslogger.start();
}

SyncClient.prototype.close = function () {
    if (this.statuslogger) {
        this.statuslogger.close();
        this.statuslogger = null;
    }
    if (this.scanner) {
        this.scanner.close();
        this.scanner = null;
    }
    for (var k in this.watches) {
        this.watches[k].close();
        delete this.watches[k];
    }
    for (var k in this.targets) {
        this.targets[k].close();
        delete this.targets[k];
    }
    this.log.info('stopping log synchronization');
}

SyncClient.prototype.add_file = function (name) {
    var self = this;
    var stat = fs.statSync(path.join(this.datadir, name));
    this.names[name] = true;
    this.inodes[stat.ino] = name;
    for (var k in this.targets) {
        this.targets[k].add_file(name);
        this.targets[k].trigger_file(name);
    }
    this.watches[name] = fs.watch(path.join(this.datadir, name), function (event, filename) {
        self.trigger_file(filename);
    });
}

SyncClient.prototype.trigger_file = function (name) {
    for (var k in this.targets) {
        this.targets[k].trigger_file(name);
    }
}

function StatusLogger(client, log_interval) {
    this.client = client;
    this.log_interval = log_interval;
    this.stats = this.gather_stats();
    this.interval_id = null;
    this.log = logger('status');
}

StatusLogger.prototype.start = function () {
    this.interval_id = setInterval(this.status.bind(this), this.log_interval);
}

StatusLogger.prototype.close = function () {
    if (this.interval_id) {
        clearInterval(this.interval_id);
        this.interval_id = null;
    }
}

StatusLogger.prototype.gather_stats = function () {
    var now = new Date();
    var stats = {
        scanner: {
            new_file_count: this.client.scanner.new_file_count,
            error_count: this.client.scanner.error_count
        },
        targets: {}
    };
    for (var k in this.client.targets) {
        stats.targets[k] = {
            url: this.client.targets[k].base_url,
            bytes_sent: this.client.targets[k].bytes_sent,
            error_count: this.client.targets[k].error_count,
            in_sync: 0,
            sending: 0,
            transient_error: 0,
            persistent_error: 0
        }
        for (var s in this.client.targets[k].syncers) {
            var syncer = this.client.targets[k].syncers[s];
            if (syncer.state === 'INSYNC') {
                stats.targets[k].in_sync += 1;
            } else if (syncer.state === 'SENDING') {
                stats.targets[k].sending += 1;
            } else if (syncer.state === 'ERROR') {
                if (now.getTime() - syncer.err_start.getTime() > 5000) {
                    stats.targets[k].persistent_error += 1;
                } else {
                    stats.targets[k].transient_error += 1;
                }
            }
        }
    };
    return stats;
}

StatusLogger.prototype.status = function () {
    var olds = this.stats;
    var news = this.gather_stats();
    this.log.info(util.format('scanner: %d new files, %d file errors',
                              news.scanner.new_file_count - olds.scanner.new_file_count,
                              news.scanner.error_count - olds.scanner.error_count));
    for (var k in news.targets) {
        this.log.info(util.format('destination [%s]: %d bytes sent, %d sync errors, %d in sync, %d sending, %d transient error, %d persistent error',
                                  news.targets[k].url,
                                  news.targets[k].bytes_sent - olds.targets[k].bytes_sent,
                                  news.targets[k].error_count - olds.targets[k].error_count,
                                  news.targets[k].in_sync,
                                  news.targets[k].sending,
                                  news.targets[k].transient_error,
                                  news.targets[k].persistent_error));
    }
    this.stats = news;
}

function Scanner(destdir, tester, scan_paths, scan_interval) {
    EE.call(this);
    this.destdir = destdir;
    this.tester = tester;
    this.logpaths = scan_paths;
    this.scan_interval = scan_interval;
    this.interval_id = null;
    this.log = logger('scanner');
    this.new_file_count = 0;
    this.error_count = 0;
}
util.inherits(Scanner, EE);

Scanner.prototype.start = function () {
    this.interval_id = setInterval(this.run_scan.bind(this), this.scan_interval);
    setImmediate(this.run_scan.bind(this));
}

Scanner.prototype.close = function () {
    if (this.interval_id) {
        clearInterval(this.interval_id);
        this.interval_id = null;
    }
}

Scanner.prototype.run_scan = function () {
    var self = this;
    this.log.debug('scanning for new files');
    this.do_scans(function (err, val) {
        if (err) {
            self.log.error('new file scan failed, retrying later: ' + err);
        } else {
            self.log.debug('scan for new files finished');
        }
    });
}

Scanner.prototype.do_scans = function (_) {
    var statcache = {};
    for (var i = 0; i < this.logpaths.length; i++) {
        var logpath = this.logpaths[i];
        var files = glob(logpath.pattern, {nonull: false, statCache: statcache, silent: true}, _);
        for (var j = 0; j < files.length; j++) {
            if (logpath.exclude && minimatch(files[j], logpath.exclude, {nonull: true, matchBase: true})) {
                continue;
            }
            try {
                this.handle_file(files[j], logpath, _);
            } catch (e) {
                this.log.warn('handling file "' + files[j] + '" failed: ' + e);
                this.error_count += 1;
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
        var realname = this.get_dest_name(fn, logpath, stats, _);
        try {
            fs.link(tmppath, path.join(this.destdir, realname), _);
        } catch (e) {
            if (e.code === 'ENOENT') {
                make_parent_directories(path.join(this.destdir, realname), _);
                fs.link(tmppath, path.join(this.destdir, realname), _);
            } else {
                throw e;
            }
        }
        fs.unlink(tmppath, _);
        this.new_file_count += 1;
        this.emit('added', realname);
        return true;
    } else {
        fs.unlink(tmppath, _);
        this.log.warn('race condition when linking file, unlinking: ' + fn);
        // XXX: trigger rescan?
        return false;
    }
}

Scanner.prototype.get_dest_name = function (fn, logpath, stats, _) {
    var replacements = {
        name: logpath.name,
        time: new Date().getTime(),
        atime: stats.atime.getTime(),
        mtime: stats.mtime.getTime(),
        ctime: stats.ctime.getTime(),
        ino: stats.ino,
        dev: stats.dev
    };
    var destname;
    if (logpath.regex_from) {
        destname = fn.replace(new RegExp(logpath.regex_from), logpath.regex_to);
    } else if (logpath.rename) {
        destname = logpath.rename;
    } else {
        destname = '{name}.{mtime}';
    }
    return format(destname, replacements);
}

function HttpSyncTarget(base_url, source_dir) {
    this.base_url = base_url.substr(-1) == '/' ? base_url : base_url + '/';
    this.source_dir = source_dir;
    this.syncers = {};
    this.agent = new ForeverAgent();
    this.log = logger('target');
    this.bytes_sent = 0;
    this.error_count = 0;
}

HttpSyncTarget.prototype.add_file = function (name) {
    var self = this;
    if (this.syncers[name]) return;
    var sync = new HttpFileSyncer(url.resolve(this.base_url, name), path.join(this.source_dir, name), this.agent);
    sync.on('insync', function () { self.log.trace('file "' + name + '" in sync at "' + self.base_url + '"'); });
    sync.on('sending', function () { self.log.trace('file "' + name + '" being sent to "' + self.base_url + '"'); });
    sync.on('piece', function (start, end) {
        self.log.trace('file "' + name + '" bytes ' + start + '-' + end + ' sent to "' + self.base_url + '"');
        self.bytes_sent += end-start+1;
    });
    sync.on('error', function (err) {
        self.log.debug('file "' + name + '" error at "' + self.base_url + '": ' + err);
        self.error_count += 1;
    });
    this.syncers[name] = sync;
}

HttpSyncTarget.prototype.start = function () {
    for (var k in this.syncers) {
        this.syncers[k].start();
    }
}

HttpSyncTarget.prototype.close = function () {
    for (var k in this.syncers) {
        this.syncers[k].close();
    }
    // XXX: not the cleanest
    for (var k in this.agent.sockets) {
        for (var i = 0; i < this.agent.sockets[k].length; i++) {
            this.agent.sockets[k][i].end();
        }
    }
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

function HttpFileSyncer(target_url, source_path, agent) {
    EE.call(this);
    this.target_url = target_url;
    this.source_path = source_path;
    this.agent = agent;
    this.local_size = null;
    this.remote_size = null;
    this.state = 'INIT';
    this.last_err = null;
    this.err_start = null;
    this.triggered = false;
    this.backoff_strategy = new backoff.FibonacciStrategy({
        randomizationFactor: 0.1,
        initialDelay: BACKOFF_INITIAL_DELAY,
        maxDelay: BACKOFF_MAX_DELAY,
    });
    this.call = null;
    this.log = logger('syncer');
}
util.inherits(HttpFileSyncer, EE);

HttpFileSyncer.prototype.start = function () {
    this.trigger_sync();
}

HttpFileSyncer.prototype.close = function () {
    if (this.call) {
        this.call.abort();
        this.call = null;
    }
    // XXX: mark closed
}

HttpFileSyncer.prototype.trigger_sync = function () {
    if (this.state === 'INSYNC' || this.state === 'INIT') {
        this.start_send_file();
    } else {
        this.triggered = true;
    }
}

HttpFileSyncer.prototype.start_send_file = function () {
    var self = this;
    this.call = backoff.call(function (cb) {
        self.send_file(cb);
    }, function (err, val) {
        self.call = null;
        if (err) throw new Error('backoff gave up, should not happen!');
        if (self.triggered) {
            self.triggered = false;
            return self.start_send_file(); // XXX: maybe delay?
        } else {
            self.err_start = null;
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
        if (self.err_start === null) {
            self.err_start = new Date();
        }
        self.state = 'ERROR';
        self.emit('error', self.last_err);
    });
    this.call.setStrategy(this.backoff_strategy);
    this.call.start();
}

HttpFileSyncer.prototype.send_file = function (_) {
    if (this.remote_size == null) {
        this.remote_size = get_remote_size(this.agent, this.target_url, _);
    }
    this.local_size = get_local_size(this.source_path, _);
    if (this.local_size < this.remote_size) {
        throw new Error('file shrank, should not happen, retrying via normal backoff');
    }
    while (this.local_size > this.remote_size) {
        var len = Math.min(BLOCKSIZE, this.local_size-this.remote_size)
        this.emit('piece', this.remote_size, this.remote_size + len);
        this.remote_size = send_piece(this.agent, this.target_url, this.source_path, this.remote_size, len, this.local_size, _);
        this.local_size = get_local_size(this.source_path, _);
    }
}

function get_local_size(path, cb) {
    fs.stat(path, function (err, val) {
        if (err) cb(err);
        else cb(null, val.size);
    });
}

function get_remote_size(agent, remote_url, cb) {
    var done = false;
    var options = url.parse(remote_url);
    options.method = 'HEAD';
    options.agent = agent;
    var req = http.request(options, function (res) {
        res.on('end', function () {
            if (done) return;
            done = true;
            switch (res.statusCode) {
            case 200:
                var cl = parseInt(res.headers['content-length'], 10);
                if (isNaN(cl)) {
                    cb(new Error('Content-Length header missing or invalid in HEAD response'));
                } else {
                    cb(null, cl);
                }
                break;
            case 404:
                cb(null, 0);
                break;
            default:
                cb(new Error('HEAD response with status code: ' + res.statusCode));
                break;
            }
        });
        res.on('close', function () {
            if (done) return;
            done = true;
            cb(new Error('response was cut off'));
        });
        res.resume();
    });
    req.setTimeout(REQUEST_TIMEOUT, function () {
        if (done) return;
        done = true;
        cb(new Error('timeout'));
        req.abort();
    });
    req.on('error', function (err) {
        if (done) return;
        done = true;
        cb(err);
    });
    req.end();
}

function send_piece(agent, remote_url, path, offset, len, size, cb) {
    var done = false;
    var options = url.parse(remote_url);
    options.method = 'PUT';
    options.headers = {
        'Content-Range': 'bytes ' + offset + '-' + (offset+len-1) + '/' + size,
        'Content-Length': len
    };
    options.agent = agent;
    var req = http.request(options, function (res) {
        res.on('end', function () {
            if (done) return; done = true;
            switch (res.statusCode) {
            case 200: case 201: case 204:
                return cb(null, offset+len);
            default:
                return cb(new Error('PUT response with status code: ' + res.statusCode));
            }
        });
        res.on('close', function () {
            if (done) return; done = true;
            return cb(new Error('response was cut off'));
        });
        res.resume();
    });
    req.setTimeout(REQUEST_TIMEOUT, function () {
        if (done) return; done = true;
        req.abort();
        return cb(new Error('timeout'));
    });
    req.on('error', function (err) {
        if (done) return; done = true;
        return cb(err);
    });
    var read = fs.createReadStream(path, {start: offset, end: offset+len-1});
    read.on('error', function (err) {
        if (done) return; done = true;
        req.abort();
        return cb(err);
    });
    read.pipe(req);
}

exports.SyncClient = SyncClient;
exports.Scanner = Scanner;
exports.HttpSyncTarget = HttpSyncTarget;
exports.HttpFileSyncer = HttpFileSyncer;
