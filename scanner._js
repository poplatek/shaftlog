"use strict";

var fs = require('fs');
var path = require('path');

var glob = require('glob');

function Scanner(destdir, basename, pattern) {
    this.destdir = destdir;
    this.basename = basename;
    this.pattern = pattern;
    this.linked = {};
}

Scanner.prototype.trigger_scan = function () {
    var self = this;
    if (this.g) return;
    this.g = new glob.Glob(this.pattern, {nonull: false});
    this.g.on('error', function (e) { self.g = null; });
    this.g.on('end', function () { self.g = null; });
    this.g.on('abort', function () { self.g = null; });
    this.g.on('match', function (fn) {
        self.handle_file(fn, function (err, val) {
            if (err) console.log('ERROR: ' + err);
            else console.log('VALUE: ' + val);
        });
    });
}

Scanner.prototype.handle_file = function (path, _) {
    var stats = fs.stat(path, _);
    if (!stats.isFile()) {
        return;
    }
    var tmppath = this.destdir + '/.tmp.' + stats.ino;
    fs.link(path, tmppath, _);
    if (fs.stat(tmppath, _).ino === stats.ino) {
        var realpath = this.destdir + '/' + this.basename + '.' + stats.mtime.getTime();
        fs.link(tmppath, realpath, _);
        this.linked[stats.ino] = true;
        console.log('adding linked: ' + stats.ino);
        fs.unlink(tmppath, _);
        console.log(realpath);
        // notify
    } else {
        fs.unlink(tmppath, _);
    }
}

function test() {
    var sc = new Scanner('/tmp', 'jpg', '/home/naked/*.jpg');
    sc.trigger_scan();
}

//test();

exports.Scanner = Scanner;
