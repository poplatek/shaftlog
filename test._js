"use strict";

var fs = require('fs');

var syncer = require('./syncer');

//var path = '/home/naked/test.bin';
//var remote_url = 'http://localhost/test.bin';
//
//var sync = new syncer.FileSyncer(remote_url, path);
//sync.on('insync', function () { console.log('IN SYNC!'); });
//sync.on('sending', function () { console.log('SENDING!'); });
//sync.on('piece', function (start, end) { console.log('  PIECE: ' + start + '-' + end); });
//sync.on('error', function (err) { console.log('ERROR: ' + err); console.log(err.stack); });
//var trigger = function () {
//    sync.trigger_sync();
//    setTimeout(trigger, 5000);
//}
//trigger();
//setTimeout(function () { console.log('ABORTING'); sync.call.abort(); }, 30000);

//var base_path = '/home/naked/org/'
//var base_url = 'http://localhost/'
//
//var target = new syncer.HttpSyncTarget(base_url, base_path);
//var files = fs.readdirSync(base_path);
//for (var i = 0; i < files.length; i++) {
//    target.add_file(files[i]);
//}
//target.start_sync();

var config = require('./config.json');
var sh = new syncer.SyncHandler(config);
sh.start();
