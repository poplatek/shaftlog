"use strict";

require('streamline').register({
//    fibers: true,
    cache: true,
    verbose: false
});

var scanner = require('./scanner');

var conf = require('./config.json');

var sc = new scanner.Scanner(conf);
sc.scanloop(function (err, val) {
    console.log(err, val);
});
setTimeout(function () { sc.exit = true; }, 40000);
