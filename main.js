"use strict";

require('streamline').register({
//    fibers: true,
    cache: true,
    verbose: false
});

var syncer = require('./syncer');

var conf = require('./config.json');

var sc = new syncer.Scanner(conf);
sc.scanloop(function (err, val) {
    console.log(err, val);
});
setTimeout(function () { sc.exit = true; }, 40000);
