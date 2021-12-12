"use strict";

let config = JSON.parse (process.env.config);
let $o = new (require (__dirname + "/server/objectum").Objectum)(config);
let mimetypes = $o.mimetypes;
let http = require ("http");
let express = require ("express");
let url = require ("url");
let fs = require ("fs");
let util = require ("util");
const fs_readFile = util.promisify (fs.readFile);
const fs_stat = util.promisify (fs.stat);
let redis = require ("redis");
let VError = require ("verror");
let redisClient = redis.createClient (config.redis);
let sessions = {};
let startedPort = {};
let portNext;
let agent = new http.Agent ();

agent.maxSockets = config.maxSockets || 5000;

async function www ({req, res, next, filePath}) {
	try {
		let filePath = options.filePath;
		
		if (!filePath) {
			let pathname = url.parse (req.url).pathname;
			
			filePath = config.wwwRoot + pathname;
		}
		let mtime, status = 200, data;
		let mtimeRedis = await redisClient.hGet ("files-mtime", filePath);
		let stats = await fs_stat (filePath);
		
		mtime = new Date (stats.mtime).getTime ();
		
		if (mtimeRedis) {
			if (mtimeRedis != mtime) {
				mtimeRedis = null;
			} else {
				if (req.headers ["if-none-match"]) {
					let mtimeUser = req.headers ["if-none-match"];
					
					if (mtimeUser == mtimeRedis) {
						status = 304;
					}
				}
			}
		}
		if (!mtimeRedis) {
			data = await fs_readFile (filePath);
			await redisClient.hSet ("files", filePath, data.toString ("base64"));
			await redisClient.hSet ("files-mtime", filePath, String (mtime));
		}
		if (status != 304) {
			let result = await redisClient.hGet ("files", filePath);
			data = new Buffer (result, "base64");
		}
		try {
			let ext = filePath.split (".");
			
			ext = ext [ext.length - 1];
			res.set ("ETag", mtime);
			res.set ("Content-Type", $o.mimetypes.lookup (ext));
			
			if (status == 304) {
				res.sendStatus (status);
			} else {
				res.status (status).send (data);
			}
		} catch (e) {
		}
	} catch (err) {
		next (err);
	}
};

async function project (req, res, next) {
	let tokens = req.url.split ("/");
	
	if (req.method == "GET" && tokens.length == 3) {
		tokens.push ("");
		return res.redirect (tokens.join ("/"));
	}
	let storageCode = tokens [2];
	let pathname = "/" + tokens.slice (3).join ("/");
	
	if (pathname == "/") {
		pathname = "/index.html";
	}
	pathname = pathname.split ("?")[0];
	
	if (!config.storages [storageCode]) {
		next (new VError (`unknown url: ${req.url}, storageCode: ${storageCode}`));
	} else {
		try {
			let filePath = config.storages [storageCode].rootDir + pathname;
			
			if (pathname.substr (0, 6) == "/files") {
				let data = await fs_readFile (decodeURI (filePath));
				let ext = filePath.split (".");
				
				ext = ext [ext.length - 1];
				res.writeHead (200, {
					"Content-Type": mimetypes.lookup (ext)
				});
				res.end (data);
			} else if (pathname.substr (0, 10) == "/resources" || pathname.substr (0, 7) == "/locale" || pathname.substr (0, 11) == "/index.html") {
				www ({req, res, next, filePath});
			} else {
				next ();
			}
		} catch (err) {
			next (err);
		}
	}
};

function getNextPort () {
	let has = false;
	
	for (let port in server.startedPort) {
		if (server.startedPort [port]) {
			has = true;
		}
	};
	if (!has) {
		return 0;
	}
	portNext = portNext || config.startPort + 2;
	portNext ++;
	
	if (portNext > (config.startPort + config.cluster.app.workers)) {
		portNext = config.startPort + 2;
	}
	let portApp = portNext;
	
	if (startedPort [portApp]) {
		log.info (`port assigned: ${portApp}`);
		return portApp;
	} else {
		return getNextPort ();
	}
};

function proxy (req, res, next) {
	let sessionId = req.query.sessionId, portApp;
	
	if (!sessionId) {
		portApp = getNextPort ();
		
		if (!portApp) {
			return next (new VError ("Server starting"));
		}
	} else {
		if (!sessions [sessionId]) {
			return next (new VError (`unknown sessionId: ${sessionId}`));
		}
		portApp = sessions [sessionId].port;
	}
	req.headers ["x-real-ip"] = $o.common.getRemoteAddress (req);
	
	let req2 = http.request ({
		agent,
		host: config.host ? config.host : "127.0.0.1",
		port: portApp,
		path: req.url,
		method: req.method,
		headers: req.headers
	}, function (res2) {
		let data;
		
		res.set (res2.headers);
		res.status (res2.statusCode);
		res2.on ("data", function (d) {
			res.write (d);
			
			if (data) {
				data += d;
			} else {
				data = d;
			}
		});
		res2.on ("end", function () {
			if (req.query.authorize == 1 && data) {
				let sessionId;
				
				try {
					let opts = JSON.parse (data);
					
					sessionId = opts.sessionId;
				} catch (e) {
				};
				if (sessionId) {
					sessions [sessionId] = {
						port: portApp
					};
					process.send (JSON.stringify ({sessionId, port: portApp}));
				}
			}
			res.end ();
		});
	});
	req2.on ("error", function (err) {
		log.error ({err}, "www worker request error");
	});
	req.on ("data", function (d) {
		req2.write (d);
	});
	req.on ("end", function () {
		req2.end ();
	});
};

async function start () {
	await redisClient.connect ();

	let app = express ();
	
	app.use (function (req, res, next) {
		req.connection.setNoDelay (true);
		next ();
	});
	app.get ("/third-party/*", function (req, res, next) {
		www ({req, res, next});
	});
	app.get ("/client/*", function (req, res, next) {
		www ({req, res, next});
	});
	app.get ("/favicon.ico", function (req, res, next) {
		www ({req, res, next});
	});
	app.get ("/projects/*", project);
	app.all ("*", proxy);
	app.use (function (err, req, res) {
		log.error ({fn: "express.exception", err, stack: err.stack});
		res.status (500).send ({error: err.message, stack: JSON.stringify (err.stack)});
	});
	let http = http.createServer (app);
	
	http.listen (config.startPort, config.host, config.backlog);
	
	process.on ("message", function (m) {
		let o = eval ("(" + m + ")");
		
		if (o.port) {
			sessions [o.sessionId] = {
				port: o.port
			};
		}
		if (o.restartPort) {
			server.startedPort [o.restartPort] = false;
			
			_.each (sessions, function (o, sessionId) {
				if (o.port == o.restartPort) {
					delete sessions [sessionId];
				}
			});
		}
		if (o.startedPort) {
			startedPort [o.startedPort] = true;
		}
	});
	function startGC () {
		if (global.gc) {
			global.gc ();
			setTimeout (startGC, config.gcInterval || 5000);
		}
	};
	setTimeout (startGC, 5000);
};

if (process.env.port == config.startPort) {
	start ();
} else {
	(async () => {
		try {
			await $o.server.init ({objectum: $o});
			await $o.server.start ({port: process.env.port});

			process.send (JSON.stringify ({startedPort: process.env.port}));
		} catch (err) {
			log.error ({fn: "cluster.startAppWorker", err});
			process.exit (1);
		}
	}) ();
};
