"use strict"

const _ = require ("lodash");
const {machineIdSync} = require ("node-machine-id");

class Objectum {
	constructor (config) {
		config.rootDir = config.rootDir || `${__dirname}/..`;
		global.config = config;
		
		_.defaults (config, {
			stores: {},
			backlog: 10000,
			user: {
				secretKey: machineIdSync (true), // jwt
				accessTokenExpires: 15 * 60 * 1000,
				refreshTokenExpires: 48 * 60 * 60 * 1000,
				revisionExpires: 60 * 1000, // getNews
				transactionExpires: 60 * 1000, // idle transactions
				pollingInterval: 5000, // getNews
				pollingProgressInterval: 500, // getNews
				gcRefreshTokenInterval: 60 * 60 * 1000, // removeRefreshTokens
				gcStoreInterval: 60 * 1000 // store.gc
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
				path: config.rootDir + "/objectum.log"
			}]
		});
		this.config = config;
		this.common = require ("./common");
		this.server = require ("./server");
		this.project = require ("./project");
		this.db = require ("./db/client").db;

		if (!config.redis) {
			throw new Error ("config.redis not exist");
		}
	}
};

module.exports = {
	Objectum
};
