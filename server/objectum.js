"use strict"

const _ = require ("lodash");

class Objectum {
	constructor (config) {
		let me = this;

		config.rootDir = config.rootDir || `${__dirname}/..`;
		global.config = config;
		
		_.defaults (config, {
			stores: {},
			auth: {multi: true},
			backlog: 10000,
			admin: {ip: ["127.0.0.1"]},
			session: {
				timeoutInterval: 120 * 1000,
				gcInterval: 300 * 1000
			},
			news: {
				pollingInterval: 5000,
				pollingProgressInterval: 500,
				gcInterval: 300000
			}
		});
		
		config.log = config.log || {};
		config.log.level = config.log.level || "info";
		config.wwwRoot = __dirname + "/../www";
		
		let bunyan = require ("bunyan");
		
		global.log = bunyan.createLogger ({
			name: "objectum",
			level: config.log.level,
			streams: [{
				stream: process.stdout
			}, {
				path: config.rootDir + "/objectum-bunyan.log"
			}]
		});
		
		if (config.redis) {
			global.redis = require ("redis-promisify");
		} else {
			global.redis = {
				createClient: function () {
					return require ("./redisEmulator");
				}
			};
		}
		global.redisClient = redis.createClient (config.redis.port, config.redis.host);
		global.redisPub = redis.createClient (config.redis.port, config.redis.host);
		global.redisSub = redis.createClient (config.redis.port, config.redis.host);

		me.config = config;
		me.common = require ("./common");
		me.server = require ("./server");
		me.project = require ("./project");
		me.db = require ("./db/client").db;
	}
};

module.exports = {
	Objectum
};
