"use strict";

var syncer = require('./syncer');

var config = require('./config.json');
var sh = new syncer.SyncHandler(config);
sh.start();
