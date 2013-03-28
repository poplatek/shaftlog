"use strict";

var sync = require('./sync');

var path = '/boot/vmlinuz-3.2.0-3-amd64';
var remote_url = 'http://localhost/vmlinuz';

var final_size = sync.sync_file_backoff(remote_url, path, _);
console.log('FINAL SIZE: ' + final_size);
