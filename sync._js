"use strict";

var clie = require('./clie');

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
