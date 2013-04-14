"use strict";

var client = require('./client');

var config = require('./config.json');
var sh = new client.SyncHandler(config);
sh.start();
