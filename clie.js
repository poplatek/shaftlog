#!/usr/bin/node
"use strict";

require('streamline').register({
//    fibers: true,
    cache: true,
    verbose: false
});

var program = require('commander');
program
    .version('0.0.1')
    .option('-b, --base <path>', 'treat base as filesystem root')
    .option('-d, --debug', 'enable debugging')
    .option('-f, --config <path>', 'path to configuration file')
    .option('-o, --one-shot', 'run log synchronization in one shot mode')
    .parse(process.argv);

var CONFIG_PATH = '/etc/shaftlog-client-config.yaml';

var path = require('path');
var fs = require('fs');
var yaml = require('js-yaml');

var config_path = path.resolve('.', program.config || CONFIG_PATH);
var config;
try {
    var config_data = fs.readFileSync(config_path, 'utf-8');
    config = yaml.load(config_data, {filename: config_path,
                                     strict: true});
    // XXX: validate config
} catch (e) {
    console.error('could not load config file: ' + e);
    process.exit(1);
    return;
}

var client = require('./client');
var sc = new client.SyncClient(config);
sc.start();
