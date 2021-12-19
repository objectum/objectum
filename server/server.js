"use strict"

const fastify = require ("fastify") ();
const formidable = require ("formidable");
const redis = require ("redis");
const util = require ("util");
const jwt = require ("jsonwebtoken");
jwt.verifyAsync = util.promisify (jwt.verify);
const xmlss = require ("./report/xmlss");
const xlsx = require ("./report/xlsx");
const pdf = require ("./report/pdf");
const dbf = require ("./report/dbf");
const project = require ("./project");
const {statHandler, collectStat} = require ("./stat");

process.env.TZ = "UTC";
process.maxTickDepth = Infinity;

global.redisClient = redis.createClient (config.redis);
global.redisPub = redis.createClient (config.redis);
global.redisSub = redis.createClient (config.redis);

config.clock = new Date ().getTime ();
setInterval (() => config.clock = new Date ().getTime (), 1000);

async function setVars (req) {
	if (req.headers.authorization) {
		try {
			let data = await jwt.verifyAsync (req.headers.authorization.split (" ")[1], config.user.secretKey);

			if (data.expires > config.clock) {
				req.session = req.raw.session = data;
				await redisClient.hSet ("o-access", String (data.id), String (config.clock));
			}
		} catch (err) {
			console.error ("jwt.verify error", err);
		}
	}
	let urlTokens = req.raw.url.split ("/");
	req.code = urlTokens [2];
};

async function init () {
	await redisClient.connect ();
	await redisPub.connect ();
	await redisSub.connect ();

	if (config.redis.db) {
		await redisClient.select (config.redis.db);
		await redisPub.select (config.redis.db);
		await redisSub.select (config.redis.db);
	}
	fastify.addHook ("onRequest", async (req, res) => {
		await setVars (req, res);
		req.raw.query = req.query;
	});
	fastify.addHook ("onError", async (req, res, error) => {
		log.error ({fn: "fastify.onError", error});
	});
	fastify.addContentTypeParser ("application/x-www-form-urlencoded", {parseAs: "string"}, function (req, body, done) {
		done (null, body);
	});
	fastify.addContentTypeParser ("multipart/form-data", function (req, done) {
		let session = req.session;
		let store = session.store;
		
		if (config.stores [store.code].hasOwnProperty ("upload") && !config.stores [store.code].upload) {
			return done (new Error ("upload disabled"));
		}
		let form = new formidable.IncomingForm ();
		
		form.uploadDir = `${store.rootDir}/public/files`;
		
		form.parse (req, function (err, fields, files) {
			if (err) {
				return done (err);
			}
			done (null, {fields, files});
		});
	});
	fastify.get ("/", async (req, res) => {
		await statHandler ({req, res/*, sessions*/});
	});
	fastify.get ("/projects/:code/report", xmlss.report);
	fastify.get ("/projects/:code", (req, res) => {
		res.redirect (`/projects/${req.code}/`);
	});
	fastify.get ("/projects/:code/", project.getHandler);
	fastify.get ("/projects/:code/files/*", project.getHandler);
	fastify.get ("/projects/:code/resources/*", project.getHandler);
	//fastify.get ("/client/*", project.www);
	//fastify.get ("/third-party/*", project.www);
	fastify.get ("/public/*", project.wwwPublic);
	fastify.get ("/favicon.ico", (req, res) => {
		require ("fs").readFile (__dirname + "/server/favicon.ico", (err, data) => {
			res.send (data);
		});
	});
	fastify.post ("/projects/:code/upload", project.upload);
	fastify.post ("/projects/:code/report", (req, res) => {
		if (req.query.format == "xlsx" && !req.query.view) {
			xlsx.report (req.raw, res);
		} else
		if (req.query.format == "dbf") {
			dbf.report (req.raw, res);
		} else {
			xmlss.report (req.raw, res);
		}
	});
	fastify.post ("/projects/:code/pdf", pdf.report);
	
	let fnMap = {
		"getNews": project.getNews,
		"startTransaction": project.startTransaction,
		"commitTransaction": project.commitTransaction,
		"rollbackTransaction": project.rollbackTransaction,
		"getAll": project.getAll,
		"logout": project.logout,
		"getData": project.getData,
		"getDict": project.getDict,
		"getLog": project.getLog,
		"getRecords": project.getRecords
	};
	let rscMap = {
		"object": project.objectFn,
		"record": project.objectFn,
		"class": project.classFn,
		"model": project.classFn,
		"classAttr": project.classAttrFn,
		"property": project.classAttrFn,
		"view": project.viewFn,
		"query": project.viewFn,
		"viewAttr": project.viewAttrFn,
		"column": project.viewAttrFn,
		"action": project.actionFn
	};
	fastify.post ("/projects/:code/", async (req, res) => {
		try {
			req.args = req.body;
			
			let fn = req.args._fn;
			let rsc = req.args._rsc;
			
			res.startTime = new Date ();
			
			res.res.on ("finish", () => {
				collectStat ({
					rsc, fn, project: req.code,
					duration: new Date ().getTime () - res.startTime.getTime ()
				});
			});
			if (fn == "auth") {
				return await project.auth (req, res);
			}
			if (!req.session) {
				return {error: "401 Unauthenticated"};
			}
			let handler = fnMap [fn] || rscMap [rsc];
			
			if (handler) {
				return await handler (req, res);
			} else {
				throw new Error ("unknown request");
			}
		} catch (err) {
			let msg = err.message ? err.message : err;
			
			log.error ({cls: "server", fn: "init", error: msg, body: req.body, stack: err.stack});
			
			return {error: msg, stack: err.stack.split ("\n"), body: req.body};
		}
	});
	let startGC = function () {
		if (global.gc) {
			global.gc ();
			setTimeout (startGC, config.gcInterval || 5000);
		}
	};
	setTimeout (startGC, 5000);
	await project.init ();
};

async function start ({port}) {
	port = port || config.startPort;
	config.port = port;

	await init ();

	if (!config.createStoresOnDemand) {
		await project.createStores ();
	}
	if (port == config.startPort || process.env.mainWorker) {
		setInterval (() => project.removeRefreshTokens (), config.user.gcRefreshTokenInterval);

		redisClient.keys ("*-objects", function (err, result) {
			for (let i = 0; i < result.length; i ++) {
				redisClient.del (result [i]);
			}
		});
	}
	try {
		await fastify.listen (port);
		log.info (`objectum server has started at port: ${port}`);
	} catch (err) {
		if (err.code == "EADDRINUSE") {
			log.error ({fn: "server.start", error: `address (port) in use`});
			process.exit (1);
		} else {
			log.error ({fn: "server.start", error: `http server error: ${err}`});
		}
	}
};

module.exports = {
	start
};
