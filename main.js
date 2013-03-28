"use strict";

require('streamline').register({
//    fibers: true,
    cache: true,
    verbose: false
});

var scanner = require('./scanner');

var conf = require('./config.json');

console.log(conf);
