"use strict"

const _ = require ("lodash");
const fs = require ("fs");
const util = require ("util");
const fs_readFile = util.promisify (fs.readFile);
const storePool = {};
const sessions = {};
const common = require ("./common");
const { Store } = require ("./store");
//const { clients } = require ("./db/postgres");
const { Class, ClassAttr, View, ViewAttr, Action, Object } = require ("./model");
const legacy = require ("./legacy");
const mimetypes = require ("./mimetypes");
const data = require ("./data");

if (config.legacy) {
	require ("objectum-extjs4-legacy");
	
	config.wwwRoot = require ("path").dirname (require.resolve ("objectum-extjs4-legacy")) + "/www";
}
//const message = {};

async function init () {
	if (config.redis.db) {
		await redisClient.selectAsync (config.redis.db);
		await redisPub.select (config.redis.db);
		await redisSub.select (config.redis.db);
	}
	redisSub.on ("message", function (channel, message) {
		if (channel == config.redis.db + "-stores") {
			let r = JSON.parse (message);
			
			if (r.free && storePool) {
				storePool [r.free].end ();
				delete storePool [r.free];
			}
		}
		if (channel == config.redis.db + "-cluster") {
			if (message == "restart") {
				process.exit (1);
			}
		}
		if (channel == config.redis.db + "-sessions") {
			let r = JSON.parse (message);
			let session = sessions [r.removed];
			
			if (session && session.store) {
				session.store.rollbackTransaction ({session});
			}
			if (r.removed && sessions [r.removed]) {
				delete sessions [r.removed];
			}
		}
/*
		if (channel == config.redis.db + "-connections") {
			let r = JSON.parse (message);
			
			if (r.terminate) {
				for (let storeCode in storePool) {
					let store = storePool [storeCode];
					let has = 0;
					
					for (let sid in store.clientPool) {
						let client = store.clientPool [sid];
						
						if (client.pid == r.terminate) {
							log.info ({cls: "connections"}, "connections disconnect " + r.terminate);
							
							has = 1;
							store.rollbackTransaction ({session: sessions [sid]});
						}
					}
					if (!has && clients && clients [r.terminate]) {
						log.info ({cls: "connections"}, "connections disconnect db.Postgres " + r.terminate);
						
						clients [r.terminate].disconnect ();
					}
				}
			}
		}
*/
	});
	redisSub.subscribe (config.redis.db + "-stores");
	redisSub.subscribe (config.redis.db + "-sessions");
	redisSub.subscribe (config.redis.db + "-connections");
	redisSub.subscribe (config.redis.db + "-cluster");
};

async function loadConfig ({code}) {
	if (!config.stores [code]) {
		if (config.projectsDir) {
			let data = await fs_readFile (`${config.projectsDir}/${code}/config.json`, "utf8");

			config.stores [code] = JSON.parse (data);
		} else {
			throw new Error ("config.projectsDir undefined");
		}
	}
};

async function www (req, res) {
	let path = req.raw.url.split ("?")[0];
	let filePath = config.wwwRoot + path;
	let data = await fs_readFile (decodeURI (filePath));
	let ext = filePath.split (".");
	
	ext = ext [ext.length - 1];
	res.header ("Content-Type", mimetypes.lookup (ext));

	return data;
};

async function wwwPublic (req, res) {
	let path = req.raw.url.split ("?")[0];
//	let filePath = config.rootDir + path;
	let filePath = `${__dirname}/../${path}`;
	let data = await fs_readFile (decodeURI (filePath));
	let ext = filePath.split (".");
	
	ext = ext [ext.length - 1];
	res.header ("Content-Type", mimetypes.lookup (ext));
	
	return data;
};

async function getHandler (req, res) {
	let tokens = req.raw.url.split ("/");
	let path = "/" + tokens.slice (3).join ("/");
	
	if (path == "/") {
		path = "/index.html";
	}
	path = path.split ("?")[0];
	
	await loadConfig ({code: req.code});
	
	let filePath = config.stores [req.code].rootDir + path;
	let data = await fs_readFile (decodeURI (filePath));
	let ext = filePath.split (".");
	
	ext = ext [ext.length - 1];
	res.header ("Content-Type", mimetypes.lookup (ext));
	
	return data;
};

async function getStore ({code}) {
	log.debug ({fn: "project.getStore", code});
	
	let store = storePool [code];
	
	if (store) {
		return store;
	}
	if (config.port == config.startPort || process.env.mainWorker) {
		redisClient.del (`${code}-requests`);
		redisClient.del (`${code}-objects`);
		redisClient.del (`${code}-sequences`);
		redisClient.del (`${code}-vars`);
		
		let result = redisClient.keysAsync (`${code}-objects*`);
		
		for (let i = 0; i < result.length; i ++) {
			redisClient.del (result [i]);
		}
	}
	await loadConfig ({code});
	
	store = new Store ({code, connection: config.stores [code]});
	storePool [code] = store;

	await store.init ();

	store.config = config.stores [code];
	store.rootDir = config.stores [code].rootDir;
	store.visualObjectum = config.stores [code].visualObjectum || {};
	
	await legacy.startProjectPlugins ({store});
	
	return store;
};

function saveSession (session) {
	let hdata = {
		[`${session.id}-id`]: session.id,
		[`${session.id}-username`]: session.username,
		[`${session.id}-clock`]: String (session.activity.clock),
		[`${session.id}-storeCode`]: session.store.code,
		[`${session.id}-newsRevision`]: String (session.news.revision),
		[`${session.id}-port`]: String (config.port)
	};
	
	if (session.userId) {
		hdata [`${session.id}-userId`] = String (session.userId);
	}
	if (session.logined) {
		hdata [`${session.id}-logined`] = String (session.logined);
	}
	if (session.ip) {
		hdata [`${session.id}-ip`] = String (session.ip);
	}
	redisClient.hmset ("sessions", hdata);
};

function tryLogin ({store, session}) {
	let sessionId = session.id;
	
	sessions [sessionId] = session;
	saveSession (session);
	
	let roleId = null;
	let roleCode = null;
	let menuId = null;
	
	if (store.auth.user [session.userId]) {
		roleId = store.auth.user [session.userId].role;
		roleCode = store.auth.user [session.userId].roleCode;
		menuId = store.auth.user [session.userId].menu;
	}
	return {
		sessionId,
		userId: session.userId,
		roleId,
		roleCode,
		menuId,
		code: store.code
	};
};
/*
	Пользователю в поля lastTry, tryNum записывает
*/
async function logLastTry (store, login, accessGranted) {
	if (!store.auth.user [login] || !store.auth.user [login].hasTryAttrs) {
		return;
	}
	let userId = store.auth.user [login].objectId;
	let session = {
		id: "logLastTry-" + login,
		username: userId,
		userId
	};
	let o = await store.getObject ({session, id: userId});

	await store.startTransaction ({session, description: "logLastTry-" + login});

	if (accessGranted) {
		o.set ("lastLogin", common.currentUTCTimestamp ());
		store.auth.user [login].tryNum = null;
		store.auth.user [login].lastTry = null;
	} else {
		o.set ("lastTry", common.currentUTCTimestamp ());
		store.auth.user [login].tryNum = (store.auth.user [login].tryNum || 0) + 1;
		store.auth.user [login].lastTry = config.clock;
	}
	await o.sync ({session});
	await store.commitTransaction ({session});
};

function authAdmin ({store, login, password, req}) {
	if (login == "admin" && password == config.stores [store.code].adminPassword) {
		let sessionId = require ("crypto").createHash ("sha1").update (common.getRemoteAddress (req) + new Date ().getTime () + Math.random ()).digest ("hex").toUpperCase ();
		
		sessions [sessionId] = {
			id: sessionId,
			username: "admin",
			userId: null,
			activity: {
				clock: config.clock
			},
			store,
			news: {
				revision: 0
			},
			transaction: {
				active: false
			},
			logined: common.currentUTCTimestamp (),
			ip: common.getRemoteAddress (req)
		};
		saveSession (sessions [sessionId]);
		
		return {
			sessionId,
			userId: null,
			roleId: store.auth.adminRoleId,
			roleCode: "admin",
			menuId: store.auth.adminMenuId,
			code: store.code
		};
	}
};

function authAutologin ({store, login, req}) {
	if (login == "autologin" && config.stores [store.code].autologin) {
		let sessionId = require ("crypto").createHash ("sha1").update (common.getRemoteAddress (req) + new Date ().getTime () + Math.random ()).digest ("hex").toUpperCase ()
		
		sessions [sessionId] = {
			id: sessionId,
			username: "autologin",
			userId: null,
			activity: {
				clock: config.clock
			},
			store,
			news: {
				revision: 0
			},
			transaction: {
				active: false
			},
			logined: common.currentUTCTimestamp (),
			ip: common.getRemoteAddress (req)
		};
		saveSession (sessions [sessionId]);
		
		return {
			sessionId,
			userId: null,
			roleId: "autologin",
			roleCode: "autologin",
			menuId: "autologin",
			code: store.code
		};
	}
};

function authUser ({store, login, password, req}) {
	let userId, sessionId, session;
	
	if (store.auth.user [login] && store.auth.user [login].tryNum >= 3 && config.clock - store.auth.user [login].lastTry < 600) {
		return {
			wait: (600 - (config.clock - store.auth.user [login].lastTry))
		};
	}
	if (store.auth.user [login] && store.auth.user [login].password == password) {
		sessionId = require ("crypto").createHash ("sha1").update (common.getRemoteAddress (req) + new Date ().getTime () + Math.random ()).digest ("hex").toUpperCase ()
		userId = store.auth.user [login].id;
		session = {
			id: sessionId,
			username: login,
			userId,
			activity: {
				clock: config.clock
			},
			store,
			news: {
				revision: 0
			},
			transaction: {
				active: false
			},
			logined: common.currentUTCTimestamp (),
			ip: common.getRemoteAddress (req)
		};
	}
	if (sessionId) {
		logLastTry (store, login, true);
		return tryLogin ({store, session});
	} else {
		logLastTry (store, login, false);
	}
};

async function auth (req, res, next) {
	let login = req.args.username;
	let password = req.args.password;
	let store = await getStore ({code: req.code});
 
	let result =
		authAdmin ({store, login, password, req}) ||
		authAutologin ({store, login, password, req}) ||
		authUser ({store, login, password, req}) ||
		{error: "401 Unauthenticated"}
	;
	// todo: fix store.auth.user.roleCode update
	if (result.roleId && !result.roleCode && result.userId) {
		await store.readAuthInfo ();
		result.roleCode = store.auth.user [result.userId].roleCode;
	}
	return result;
};

async function startTransaction (req) {
	log.debug ({fn: "project.startTransaction", session: req.session.id, description: req.args.description});
	
	if (req.session.username == "autologin" && request.session.userId == null) {
		throw new Error ("project.startTransaction: forbidden");
	}
	let store = await getStore ({code: req.code});
	
	// todo: throw new Error ("transaction in progress")
	if (_.get (sessions [req.session.id], "transaction.active")) {
		await store.commitTransaction ({session: req.session});
		sessions [req.session.id].transaction.active = false;
	}
	let revision = await store.startTransaction ({
		session: req.session,
		remoteAddr: common.getRemoteAddress (req),
		description: req.args.description
	});
	sessions [req.session.id].transaction.active = true;
	
	return {revision};
};

async function commitTransaction (req) {
	log.debug ({fn: "project.commitTransaction", session: req.session.id});
	
	if (!_.get (sessions [req.session.id], "transaction.active")) {
		throw new Error ("project.commitTransaction: Transaction not active");
	}
	let store = await getStore ({code: req.code});
	let revision = await store.commitTransaction ({session: req.session});

	sessions [req.session.id].transaction.active = false;

	return {revision};
};

async function rollbackTransaction (req) {
	log.debug ({fn: "project.rollbackTransaction", session: req.session.id});
	
	if (!_.get (sessions [req.session.id], "transaction.active")) {
		throw new Error ("project.rollbackTransaction: Transaction not active");
	}
	let store = await getStore ({code: req.code});
	let revision = await store.rollbackTransaction ({session: req.session});

	sessions [req.session.id].transaction.active = false;
	
	return {revision};
};

async function classFn (req) {
	if (_.has (req.args, "query")) {
		req.args ["view"] = req.args ["query"];
		delete req.args ["query"];
	}
	log.debug ({fn: "project.classFn", session: req.session.id, args: req.args});
	
	if (req.session.username == "autologin" && request.session.userId == null) {
		throw new Error ("project.modelFn: forbidden");
	}
	let store = await getStore ({code: req.code});
	let o;
	
	if (req.args._fn == "remove") {
		o = store.getClass (req.args.id || req.args.code);
		o.remove ();
		await o.sync ({session: req.session});
		
		return {id: o.get ("id")};
	}
	if (req.args._fn == "create") {
		delete req.args.id;
		o = new Class ({store, rec: req.args});
		await o.sync ({session: req.session});
	} else
	if (req.args._fn == "get") {
//		o = store.getClass (req.args.id || req.args.code);
		o = store.getClass (req.args.id);
	} else
	if (req.args._fn == "set") {
//		o = store.getClass (req.args.id || req.args.code);
		o = store.getClass (req.args.id);
		delete req.args.id;
		
		_.each (req.args, function (v, a) {
			if (a [0] != "_") {
				o.set (a, v);
			}
		});
		await o.sync ({session: req.session});
	} else {
		throw new Error ("project.modelFn: unknown fn: " + req.args._fn);
	}
	o.data ["query"] = o.data ["view"];
	//delete o.data ["view"];

	return o.data;
};

async function classAttrFn (req) {
	if (_.has (req.args, "model")) {
		req.args ["class"] = req.args ["model"];
		delete req.args ["model"];
	}
	log.debug ({fn: "project.classAttrFn", session: req.session.id, args: req.args});
	
	if (req.session.username == "autologin" && request.session.userId == null) {
		throw new Error ("project.propertyFn: forbidden");
	}
	let store = await getStore ({code: req.code});
	let o;
	
	if (req.args._fn == "remove") {
		o = store.getClassAttr (req.args.id);
		o.remove ();
		await o.sync ({session: req.session});
		
		return {id: o.get ("id")};
	}
	if (req.args._fn == "create") {
		delete req.args.id;
		o = new ClassAttr ({store, rec: req.args});
		await o.sync ({session: req.session});
	} else
	if (req.args._fn == "get") {
		o = store.getClassAttr (req.args.id);
	} else
	if (req.args._fn == "set") {
		o = store.getClassAttr (req.args.id);
		delete req.args.id;
		
		_.each (req.args, function (v, a) {
			if (a [0] != "_") {
				o.set (a, v);
			}
		});
		await o.sync ({session: req.session});
	} else {
		throw new Error ("project.propertyFn: unknown fn: " + req.args._fn);
	}
	o.data ["model"] = o.data ["class"];
	//delete o.data ["class"];
	
	return o.data;
};

async function viewFn (req) {
	if (_.has (req.args, "model")) {
		req.args ["class"] = req.args ["model"];
		delete req.args ["model"];
	}
	log.debug ({fn: "project.viewFn", session: req.session.id, args: req.args});
	
	if (req.session.username == "autologin" && request.session.userId == null) {
		throw new Error ("project.queryFn: forbidden");
	}
	let store = await getStore ({code: req.code});
	let o;
	
	if (req.args._fn == "remove") {
		o = store.getView (req.args.id);
		o.remove ();
		await o.sync ({session: req.session});
		
		return {id: o.get ("id")};
	}
	if (req.args._fn == "create") {
		delete req.args.id;
		o = new View ({store, rec: req.args});
		await o.sync ({session: req.session});
	} else
	if (req.args._fn == "get") {
		o = store.getView (req.args.id);
	} else
	if (req.args._fn == "set") {
		o = store.getView (req.args.id);
		delete req.args.id;
		
		_.each (req.args, function (v, a) {
			if (a [0] != "_") {
				o.set (a, v);
			}
		});
		await o.sync ({session: req.session});
	} else {
		throw new Error ("project.queryFn: unknown fn: " + req.args._fn);
	}
	o.data ["model"] = o.data ["class"];
	//delete o.data ["class"];
	
	return o.data;
};

async function viewAttrFn (req) {
	if (_.has (req.args, "query")) {
		req.args ["view"] = req.args ["query"];
		delete req.args ["query"];
	}
	log.debug ({fn: "project.viewAttrFn", session: req.session.id, args: req.args});
	
	if (req.session.username == "autologin" && request.session.userId == null) {
		throw new Error ("project.columnFn: forbidden");
	}
	let store = await getStore ({code: req.code});
	let o;
	
	if (req.args._fn == "remove") {
		o = store.getViewAttr (req.args.id);
		o.remove ();
		await o.sync ({session: req.session});
		
		return {id: o.get ("id")};
	}
	if (req.args._fn == "create") {
		delete req.args.id;
		o = new ViewAttr ({store, rec: req.args});
		await o.sync ({session: req.session});
	} else
	if (req.args._fn == "get") {
		o = store.getViewAttr (req.args.id);
	} else
	if (req.args._fn == "set") {
		o = store.getViewAttr (req.args.id);
		delete req.args.id;
		
		_.each (req.args, function (v, a) {
			if (a [0] != "_") {
				o.set (a, v);
			}
		});
		await o.sync ({session: req.session});
	} else {
		throw new Error ("project.columnFn: unknown fn: " + req.args._fn);
	}
	o.data ["query"] = o.data ["view"];
	//delete o.data ["view"];
	
	return o.data;
};

async function actionFn (req) {
	if (_.has (req.args, "model")) {
		req.args ["class"] = req.args ["model"];
		delete req.args ["model"];
	}
	log.debug ({fn: "project.actionFn", session: req.session.id, args: req.args});
	
	if (req.session.username == "autologin" && request.session.userId == null) {
		throw new Error ("project.actionFn: forbidden");
	}
	let store = await getStore ({code: req.code});
	let o;
	
	if (req.args._fn == "remove") {
		o = await store.getAction ({session: req.session, id: req.args.id});
		o.remove ();
		await o.sync ({session: req.session});
		
		return {id: o.get ("id")};
	}
	if (req.args._fn == "create") {
		delete req.args.id;
		o = new Action ({store, rec: req.args});
		await o.sync ({session: req.session});
	} else
	if (req.args._fn == "get") {
		o = await store.getAction ({session: req.session, id: req.args.id});
	} else
	if (req.args._fn == "set") {
		o = await store.getAction ({session: req.session, id: req.args.id});
		delete req.args.id;
		
		_.each (req.args, function (v, a) {
			if (a [0] != "_") {
				o.set (a, v);
			}
		});
		await o.sync ({session: req.session});
	} else {
		throw new Error ("project.actionFn: unknown fn: " + req.args._fn);
	}
	o.data ["model"] = o.data ["class"];
	//delete o.data ["class"];
	
	return o.data;
};

async function objectFn (req) {
	if (_.has (req.args, "_model")) {
		req.args ["_class"] = req.args ["_model"];
		delete req.args ["_model"];
	}
	log.debug ({fn: "project.recordFn", session: req.session.id, args: req.args});
	
	if (req.args._trace) {
		req.args._trace.push (["server-start", new Date ().getTime ()]);
	}
	let store = await getStore ({code: req.code});
	let o;
	
	if (req.args._fn == "remove") {
		o = await store.getObject ({session: req.session, id: req.args.id});
		o.remove ();
		await o.sync ({session: req.session});
		
		let result = {id: o.get ("id")};
		
		if (req.args._trace) {
			req.args._trace.push (["server-start", new Date ().getTime ()]);
			result._trace = req.args._trace;
		}
		return result;
	}
	if (req.args._fn == "create") {
		delete req.args.id;
		o = new Object ({store, rec: req.args});
		await o.sync ({session: req.session});
	} else
	if (req.args._fn == "get") {
		o = await store.getObject ({session: req.session, id: req.args.id, _trace: req.args._trace});
	} else
	if (req.args._fn == "set") {
		o = await store.getObject ({session: req.session, id: req.args.id});
		delete req.args.id;
		
		_.each (req.args, function (v, a) {
			if (a [0] != "_") {
				o.set (a, v);
			}
		});
		await o.sync ({session: req.session});
	} else {
		throw new Error ("project.recordFn: unknown fn: " + req.args._fn);
	}
	o.data ["_model"] = o.data ["_class"];
	//delete o.data ["_class"];
	
	if (req.args._trace) {
		if (o.data._trace) {
			req.args._trace = [...req.args._trace, ...o.data._trace];
		}
		req.args._trace.push (["server-end", new Date ().getTime ()]);
		o.data._trace = req.args._trace;
	}
	return o.data;
};

async function getNews (req) {
	if (req.args && req.args.progress) {
		await common.delay (config.news.pollingProgressInterval);
	} else {
		await common.delay (config.news.pollingInterval);
	}
	if (!_.has (req.args, "revision")) {
		throw new Error ("project.getNews: revision not exist");
	}
	let clientRevision = req.args.revision;
	let store = await getStore ({code: req.code});
	let data;

	if (clientRevision == 0 || clientRevision == store.lastRevision) {
		// first call
		data = {revision: store.lastRevision, records: []/*, message*/};
	} else {
		// send changed objects id from revision to lastRevision
		let r = [], metaChanged = false;
		
		//for (let revision in store.revisions) {
		for (let i = clientRevision + 1; i <= store.lastRevision; i ++) {
			let revision = store.revisions [i];
			
			if (revision) {
				r = [...r, ...revision.object.changed, ...revision.object.removed];
				
				if (revision.metaChanged) {
					metaChanged = true;
				}
			}
		}
		data = {revision: store.lastRevision, metaChanged, records: r/*, message*/};
	}
	sessions [req.session.id].news.revision = store.lastRevision;
	
	return data;
};

function newsGC () {
	_.each (storePool, function (store, code) {
		let minRevision;
		
		_.each (sessions, function (session, id) {
			let news = session.news;
			
			if (session.store == store && (!minRevision || news.revision < minRevision)) {
				minRevision = news.revision;
			}
		});
		_.each (store.revisions, function (revision, revisionId) {
			if (revisionId < minRevision) {
				delete store.revisions [revisionId];
				log.debug ({fn: "project.newsGC"}, `revision ${revisionId} removed`);
			}
		});
	});
	setTimeout (newsGC, config.news.gcInterval);
}

function removeSession (sessionId) {
	redisClient.hdel ("sessions",
		`${sessionId}-id`, `${sessionId}-username`, `${sessionId}-clock`, `${sessionId}-storeCode`,
		`${sessionId}-newsRevision`, `${sessionId}-port`, `${sessionId}-userId`, `${sessionId}-logined`, `${sessionId}-ip`
	);
	redisPub.publish (`${config.redis.db}-sessions`, `{"removed":"${sessionId}"}`);
	log.debug ({fn: "project.removeSession"}, `session ${sessionId} removed`);
};

async function removeTimeoutSessions () {
	log.debug ({fn: "project.removeTimeoutSessions"});
	
	let timeoutInterval = config.session.timeoutInterval / 1000;
	
	let result = await redisClient.hgetallAsync ("sessions");
	let timeout = [];
	
	_.each (result, function (v, a) {
		if (!_.endsWith (a, "-clock")) {
			return;
		}
		let clock = Number (v);
		
		if (config.clock > clock && config.clock - clock > timeoutInterval * 2) {
			let sessionId = a.substr (0, a.length - 6);
			
			timeout.push (sessionId);
			log.info ({fn: "project.removeTimeoutSessions"}, `session removing: ${sessionId} ${config.clock} ${v} ${timeoutInterval * 2}`);
		}
	});
	for (let i = 0; i < timeout.length; i ++) {
		let sessionId = timeout [i];
		let session = sessions [sessionId];
		
		if (session && session.store) {
			await session.store.rollbackTransaction ({session});
		}
		removeSession (sessionId);
		log.info ({fn: "project.removeTimeoutSessions"}, `session removed: ${sessionId} ${config.clock} ${result [sessionId + "-clock"]} ${timeoutInterval}`);
	}
};

async function createStores () {
	let codes = _.keys (config.stores);
	
	for (let i = 0; i < codes.length; i ++) {
		let code = codes [i];
		await getStore ({code});
	}
	if (codes.length) {
		console.log ("stores created.");
	}
};

async function getTableRecords ({session, store, table, fields}) {
	let filter = "";
	
/*
	if (table == "tview") {
		filter = " and (fsystem is null or (fsystem is not null and fclass_id is not null))";
	}
*/
	if (table == "tclass_attr") {
		filter = " and fclass_id in (select fid from tclass where fend_id = 0)";
	}
	if (table == "tview_attr") {
//		filter = " and fview_id in (select fid from tview where fend_id = 0 and (fsystem is null or (fsystem is not null and fclass_id is not null)))";
		filter = " and fview_id in (select fid from tview where fend_id = 0)";
	}
	let rows = await store.query ({session, sql: `
		select
			${fields.join (",")}
		from
			${table}
		where
			fend_id = 0 ${filter}
		order by
			fid
	`});
	let r = [];
	
	_.each (rows, function (row) {
		let a = _.map (fields, function (f) {
			return row [f];
		});
		if (table == "tview") {
			a.push (0);
		}
		r.push (a);
	});
	return r;
};

async function getAll (req) {
	log.debug ({fn: "project.getAll"});

	let session = req.session;
	let store = await getStore ({code: req.code});
	let result = await redisClient.hgetAsync (store.code + "-requests", "all");
 
	if (!result) {
		const {getFields} = require ("./map");
	 
		result = {
			"model": await getTableRecords ({session, store, table: "tclass", fields: getFields ("class")}),
			"property": await getTableRecords ({session, store, table: "tclass_attr", fields: getFields ("classAttr")}),
			"query": await getTableRecords ({session, store, table: "tview", fields: getFields ("view")}),
			"column": await getTableRecords ({session, store, table: "tview_attr", fields: getFields ("viewAttr")}),
			"visualObjectum": store.visualObjectum
		};
		_.each (result ["model"], rec => {
			rec ["query"] = rec ["view"];
			delete rec ["view"];
		});
		_.each (result ["property"], rec => {
			rec ["model"] = rec ["class"];
			delete rec ["class"];
		});
		_.each (result ["query"], rec => {
			rec ["model"] = rec ["class"];
			delete rec ["class"];
		});
		_.each (result ["column"], rec => {
			rec ["query"] = rec ["view"];
			delete rec ["view"];
			rec ["property"] = rec ["classAttr"];
			delete rec ["classAttr"];
		});
		redisClient.hset (`${req.code}-requests`, "all", JSON.stringify (result));
	}
	return result;
};

async function upload (req, res, next) {
	let session = req.session;
	let store = session.store;
	let fields = req.body.fields;
	let files = req.body.files;
	let name = files ["file-path"] && files ["file-path"].name;
	let path = files ["file-path"] && files ["file-path"].path;
	
	if (fields.name) {
		name = fields.name;
		path = files ["file"].path;
	}
	if (name) {
		let filename = `${store.rootDir}/public/files/${fields.objectId}-${fields.classAttrId}-${name}`;
		
		fs.rename (path, filename, function (err) {
			if (err) {
				return next (err);
			}
			res.send ({success: true});
		});
	} else {
		throw new Error ("upload error");
	}
};

async function logout (req) {
	let sid = req.query.sessionId;
	
	redisClient.hdel ("sessions",
		`${sid}-id`,
		`${sid}-username`,
		`${sid}-clock`,
		`${sid}-storeCode`,
		`${sid}-newsRevision`,
		`${sid}-port`,
		`${sid}-userId`,
		`${sid}-logined`,
		`${sid}-ip`
	);
	redisPub.publish (`${config.redis.db}-sessions`, `{"removed": "${sid}"}`);
	
	let session = sessions [sid];
	
	if (session && session.store) {
		session.store.rollbackTransaction ({session});
	}
	return {success: true};
};

async function getDict (req) {
	log.debug ({fn: "project.getDict"});
	
	let store = await getStore ({code: req.code});
	
	return await data.getDict (req, store);
};

async function getLog (req) {
	log.debug ({fn: "project.getLog"});
	
	let store = await getStore ({code: req.code});
	
	return await data.getLog (req, store);
};

async function getData (req) {
	log.debug ({fn: "project.getData"});
	
	let store = await getStore ({code: req.code});
	
	return await data.getData (req, store);
};

async function getRecords (req) {
	log.debug ({fn: "project.getRecords"});
	
	let store = await getStore ({code: req.code});
	
	return await data.getRecords (req, store);
};

module.exports = {
	init,
	loadConfig,
	startTransaction,
	commitTransaction,
	rollbackTransaction,
	getNews,
	newsGC,
	createStores,
	getAll,
	upload,
	logout,
	getHandler,
	auth,
	removeTimeoutSessions,
	www,
	wwwPublic,
	sessions,
	getStore,
	classFn,
	classAttrFn,
	viewFn,
	viewAttrFn,
	actionFn,
	objectFn,
	getData,
	getDict,
	getLog,
	getRecords
};
