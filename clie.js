"use strict";

var fs = require('fs');
var http = require('http');
var url = require('url');

var ForeverAgent = require('forever-agent');
//var request = require('request');

var agent = new ForeverAgent();

function get_local_size(path, cb) {
    fs.stat(path, function (err, val) {
        if (err) cb(err);
        else cb(null, val.size);
    });
}

function get_remote_size(remote_url, cb) {
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
    req.setTimeout(30000, function () {
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

function send_piece(remote_url, path, offset, len, size, cb) {
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
                return cb(null, offset+len); // just assume it was all saved correctly
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
    req.setTimeout(30000, function () {
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

//get_remote_size('http://www.google.com/index.html', function (err, val) {
//    if (err) console.log('ERROR: ' + err);
//    else console.log('VALUE: ' + val);
//});

//send_piece('http://localhost/vmlinuz', '/boot/vmlinuz-3.2.0-3-amd64', 0, 5, 5, function (err, val) {
//    if (err) { console.log('ERROR: ' + err); console.log(err.stack); }
//    else { console.log('VALUE: ' + val); }
//});

exports.get_local_size = get_local_size;
exports.get_remote_size = get_remote_size;
exports.send_piece = send_piece;
