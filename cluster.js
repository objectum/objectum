const config = JSON.parse (process.env.config);
const $o = new (require ("./server/objectum").Objectum)(config);
const mimetypes = require ("./server/mimetypes");
const http = require ("http");
const fastify = require ("fastify") ();
const url = require ("url");
const fs = require ("fs");
const util = require ("util");
const fs_readFile = util.promisify (fs.readFile);
const fs_stat = util.promisify (fs.stat);
const redis = require ("redis");
const redisClient = redis.createClient (config.redis);
const startedPort = {};
const agent = new http.Agent ();

agent.maxSockets = config.maxSockets || 5000;

async function www (req, res) {
	let pathname = url.parse (req.raw.url).pathname;
	let filePath = config.wwwRoot + pathname;
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
		data = Buffer.from (result, "base64");
	}
	try {
		let ext = filePath.split (".");

		ext = ext [ext.length - 1];
		res.headers ({
			"ETag": mtime,
			"Content-Type": mimetypes.lookup (ext)
		});
		res.status (status).send (data);
	} catch (err) {
		console.error ("cluster.www error", err);
	}
};

function proxy (req, res) {
	let authId, portApp = config.startPort + 1;

	if (req.headers.authorization) {
		let data = $o.common.parseJwt (req.headers.authorization.split (" ") [1]);
		authId = data.id;
		portApp = data.port || (config.startPort + 2 + authId % (config.cluster.app.workers - 1));
	}
	if (!startedPort [portApp]) {
		throw new Error ("server starting");
	}
	req.headers ["x-real-ip"] = $o.common.getRemoteAddress (req);
	
	let proxyReq = http.request ({
		agent,
		host: config.host || "127.0.0.1",
		port: portApp,
		path: req.raw.url,
		method: req.raw.method,
		headers: req.headers
	}, function (proxyRes) {
		let data;

		res.headers (proxyRes.headers);
		res.code (proxyRes.statusCode);

		proxyRes.on ("data", d => {
			if (data) {
				data += d;
			} else {
				data = d;
			};
		});
		proxyRes.on ("end", () => {
			res.send (data);
		});
	});
	proxyReq.on ("error", function (err) {
		console.error ("cluster.proxy error", err);
	});
	proxyReq.end (typeof (req.body) == "object" ? JSON.stringify (req.body) : req.body);
};

async function start () {
	process.on ("message", function (m) {
		let o = eval ("(" + m + ")");

		if (o.restartPort) {
			startedPort [o.restartPort] = false;
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
	await redisClient.connect ();

	fastify.addHook ("onError", (req, res, error) => {
		console.error ("cluster.error", error);
	});
	fastify.get ("/public/*", www);
	fastify.all ("*", proxy);

	await fastify.listen (config.startPort, config.host, config.backlog);
};

if (process.env.port == config.startPort) {
	start ();
} else {
	(async () => {
		try {
			await $o.server.start ({port: process.env.port});
			process.send (JSON.stringify ({startedPort: process.env.port}));
		} catch (err) {
			console.error ("cluster.startAppWorker", err);
			process.exit ();
		}
	}) ();
};
