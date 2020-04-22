"use strict"

const fastify = require ("fastify") ();
const formidable = require ("formidable");
const xmlss = require ("./report/xmlss");
const xlsx = require ("./report/xlsx");
const pdf = require ("./report/pdf");
const dbf = require ("./report/dbf");
const common = require ("./common");
const project = require ("./project");
const legacy = require ("./legacy");
const {statHandler, collectStat} = require ("./stat");
const {sessions} = project;

process.env.TZ = "UTC";
process.maxTickDepth = Infinity;

let memoryUsage = {rss: 0, heapTotal: 0, heapUsed: 0};

// Количество секунд прошедших с 1 января 1970 года (UnixTime)
config.clock = parseInt (new Date ().getTime () / 1000);

function setVars (req) {
	req.session = req.raw.session = sessions [req.query.sessionId || req.query.sid];
	
	let urlTokens = req.raw.url.split ("/");
	
	req.code = urlTokens [2];

	if (req.query.sessionId) {
		redisClient.hset ("sessions", req.query.sessionId + "-clock", config.clock);
	}
};

function updateMemoryUsage () {
	let pmu = process.memoryUsage ();
	pmu.rss = (pmu.rss / (1024 * 1024)).toFixed (3);
	pmu.heapTotal = (pmu.heapTotal / (1024 * 1024)).toFixed (3);
	pmu.heapUsed = (pmu.heapUsed / (1024 * 1024)).toFixed (3);

	if (memoryUsage.rss < pmu.rss) {
		memoryUsage.rss = pmu.rss;
	}
	if (memoryUsage.heapTotal < pmu.heapTotal) {
		memoryUsage.heapTotal = pmu.heapTotal;
	}
	if (memoryUsage.heapUsed < pmu.heapUsed) {
		memoryUsage.heapUsed = pmu.heapUsed;
	}
	redisClient.hset ("server-memoryusage", process.pid, JSON.stringify ({
		port: config.port,
		current: {
			rss: pmu.rss,
			heapTotal: pmu.heapTotal,
			heapUsed: pmu.heapUsed
		},
		max: {
			rss: memoryUsage.rss,
			heapTotal: memoryUsage.heapTotal,
			heapUsed: memoryUsage.heapUsed
		}
	}));
};

async function init () {
	fastify.addHook ("onRequest", async (req, res) => {
		setVars (req, res);
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
		await statHandler ({req, res, sessions});
	});
	fastify.get ("/projects/:code/report", xmlss.report);
	fastify.get ("/projects/:code/copy_file", legacy.copyFile);
	fastify.get ("/projects/:code/plugins/", legacy.processProjectPlugins);
	fastify.get ("/projects/:code", (req, res) => {
		res.redirect (`/projects/${req.code}/`);
	});
	fastify.get ("/projects/:code/", project.getHandler);
	fastify.get ("/projects/:code/files/*", project.getHandler);
	fastify.get ("/projects/:code/resources/*", project.getHandler);
	fastify.get ("/client/*", project.www);
	fastify.get ("/third-party/*", project.www);
	fastify.get ("/public/*", project.wwwPublic);
	fastify.get ("/favicon.ico", (req, res) => {
		require ("fs").readFile (config.rootDir + "/server/favicon.ico", (err, data) => {
			res.send (data);
		});
	});
	fastify.post ("/projects/:code/upload", project.upload);
	fastify.post ("/projects/:code/sendmail", legacy.sendmail);
	fastify.post ("/projects/:code/save_to_file", legacy.saveToFile);
	fastify.post ("/projects/:code/plugins/", legacy.processProjectPlugins);
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
		"execute": legacy.projectExecute,
		"selectRow": legacy.projectSelectRow,
		"getContent": legacy.projectGetContent,
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
			if (req.session && project.sessions [req.session.id]) {
				req.session = project.sessions [req.session.id];
				req.session.activity.clock = config.clock;
				redisClient.hset ("sessions", req.session.id + "-clock", config.clock);
			} else {
				throw new Error ("401 Unauthenticated");
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
	await legacy.startPlugins ();

	let startGC = function () {
		if (global.gc) {
			global.gc ();
			setTimeout (startGC, config.gcInterval || 5000);
		}
	};
	setTimeout (startGC, 5000);

	setInterval (function () {
		config.clock = parseInt (new Date ().getTime () / 1000);
		updateMemoryUsage ();
	}, 1000);
	
	legacy.init ();
	await project.init ();
};

async function start ({port}) {
	port = port || config.startPort;
	config.port = port;

	await init ();

	if (!config.createStoresOnDemand) {
		await project.createStores ();
		console.log ("stores created.");
		project.newsGC ();
	}
	if (port == config.startPort || process.env.mainWorker) {
		setInterval (function () {
			project.removeTimeoutSessions ();
		},
			config.session.gcInterval
		);
		redisClient.del ("sessions");
		redisClient.del ("server-memoryusage");

		redisClient.keys ("log-*", function (err, result) {
			for (let i = 0; i < result.length; i ++) {
				redisClient.del (result [i]);
			}
		});
		redisClient.keys ("*-objects", function (err, result) {
			for (let i = 0; i < result.length; i ++) {
				redisClient.del (result [i]);
			}
		});
		await legacy.startWSDL ();
	}
	redisClient.hset ("server-started", process.pid, common.currentUTCTimestamp ());
	
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
