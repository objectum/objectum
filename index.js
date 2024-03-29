"use strict"

const cluster = require ("cluster");
const {Objectum} = require ("./server/objectum");

function start (config) {
	global.objectum = new Objectum (config);
	objectum.server.start ({port: config.startPort});
};

function startMaster (config) {
	process.env.config = JSON.stringify (config);
	
	cluster.setupMaster ({
	    exec: __dirname + "/index.js"
	});
	let startWorker = function () {
		console.log ("startMaster: worker started");
	    cluster.fork (process.env);
	};
	startWorker ();
	
	cluster.on ("exit", function (worker, code, signal) {
		console.log (`startMaster: worker ${worker.process.pid} died (code: ${code}, signal: ${signal})`);
		startWorker ();
	});
};

async function startCluster (config) {
	global.objectum = new Objectum (config);
	
	cluster.setupMaster ({
	    exec: __dirname + "/cluster.js"
	});
	let startWorker = function (port, mainWorker) {
		process.env.config = JSON.stringify (config);
		process.env.port = port;
		
		if (mainWorker) {
			process.env.mainWorker = "1";
		};
		let p = cluster.fork (process.env);
		
	    p.port = port;
		
		p.on ("message", function (m) {
			for (let id in cluster.workers) {
				if (p != cluster.workers [id]) {
					cluster.workers [id].send (m);
				}
			}
		});
		console.log (`startCluster: worker pid: ${p.process.pid} (port: ${port}) started.`);
	};
	let start = function () {
		for (let i = 0; i < config.cluster.app.workers; i ++) {
			startWorker (config.startPort + i + 1, i == 0);
		}
		for (var i = 0; i < config.cluster.www.workers; i ++) {
			startWorker (config.startPort);
		}
		let startGC = function () {
			if (global.gc) {
				global.gc ();
				
				setTimeout (startGC, config.gcInterval || 5000);
			}
		};
		setTimeout (startGC, 5000);
	};
	cluster.on ("exit", function (worker, code, signal) {
		console.log (`startCluster: worker pid: ${worker.process.pid} (port: ${worker.port}, code: ${code}, signal: ${signal}) died.`);
		
		for (let id in cluster.workers) {
			if (worker.port != cluster.workers [id]) {
				cluster.workers [id].send (JSON.stringify ({restartPort: worker.port}));
			}
		}
		startWorker (worker.port, worker.port == config.startPort + 1);
	});
	if (!config.redis) {
		console.error ("startCluster: config.redis not found.");
		process.exit ();
	}
	if (config.cluster.app.workers < 2) {
		console.error ("startCluster: cluster.app.workers must be > 1.");
		process.exit ();
	}
	const redis = require ("redis");
	let redisClient = redis.createClient (config.redis);
	await redisClient.connect ();
	start ();
/*
	redisClient.get ("*", function (err) {
		if (err) {
			console.error (`startCluster: redis error: ${err}`);
			process.exit ();
		} else {
			start ();
		}
	});
*/
};

if (require.main === module) {
	start (require ("./config"));
} else {
	if (!cluster.isMaster) {
		start (JSON.parse (process.env.config));
	}
}

module.exports = {
	start,
	startMaster,
	startCluster,
	Objectum
};

