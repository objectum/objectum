"use strict"

const _ = require ("lodash");
const fs = require ("fs");
const util = require ("util");
const fs_readFile = util.promisify (fs.readFile);
const jwt = require ("jsonwebtoken");
jwt.signAsync = util.promisify (jwt.sign);
jwt.verifyAsync = util.promisify (jwt.verify);
const uaParser = require ("ua-parser-js");
const storePool = {};
const common = require ("./common");
const {Store} = require ("./store");
const {Class, ClassAttr, View, ViewAttr, Action, Object} = require ("./model");
const mimetypes = require ("./mimetypes");
const data = require ("./data");

async function init () {
	await redisSub.subscribe ("o-cluster", message => {
		if (message == "restart") {
			process.exit (1);
		}
	});
};

async function loadConfig ({code}) {
	if (!config.stores [code]) {
		config.projectsDir = config.projectsDir || `${config.rootDir}/../projects`;
		
		if (config.projectsDir) {
			let data = await fs_readFile (`${config.projectsDir}/${code}/config.json`, "utf8");

			data = JSON.parse (data);
			data.rootDir = data.rootDir || `${config.projectsDir}/${code}`;
			config.stores [code] = data;
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
		await redisClient.del (`o-${code}-requests`);
		await redisClient.del (`o-${code}-objects`);
	}
	await loadConfig ({code});
	
	store = new Store ({code, connection: config.stores [code]});
	storePool [code] = store;

	await store.init ();

	store.config = config.stores [code];
	store.rootDir = config.stores [code].rootDir;
	store.visualObjectum = config.stores [code].visualObjectum || {};
	
	return store;
};

/*
function tryLogin ({store, session}) {
	let sessionId = session.id;
	
	sessions [sessionId] = session;

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
*/

function authAdmin ({store, login, password}) {
	if (login == "admin" && password == config.stores [store.code].adminPassword) {
		return {
			userId: null,
			username: "admin",
			roleId: store.auth.adminRoleId,
			roleCode: "admin",
			menuId: store.auth.adminMenuId,
			code: store.code
		};
	}
};

function authUser ({store, login, password}) {
	if (store.auth.user [login] && store.auth.user [login].password == password) {
		let o = store.auth.user [login];

		return {
			userId: o.id,
			username: login,
			roleId: o.role,
			roleCode: o.roleCode,
			menuId: o.menu,
			code: store.code
		};
	}
};

async function auth (req) {
	let login = req.args.username;
	let password = req.args.password;
	let store = await getStore ({code: req.code});
	let authId = await redisClient.incr ("o-authId");

	if (req.args.refreshToken) {
		try {
			let data = common.parseJwt (req.args.refreshToken);

			if (data.expires < config.clock) {
				return {error: "401 Unauthenticated"};
			}
			let authId = await redisClient.hGet (`o-refresh`, req.args.refreshToken);

			if (authId) {
				// todo: check hack
				let accessTokenExpires = (duration => {let d = new Date (); d.setTime (d.getTime () + duration); return d.getTime ()}) (config.user.accessTokenExpires);
				let accessToken = await jwt.signAsync (_.extend ({}, data, {expires: accessTokenExpires}), config.user.secretKey);
				let refreshTokenExpires = (duration => {let d = new Date (); d.setTime (d.getTime () + duration); return d.getTime ()}) (config.user.refreshTokenExpires);
				let refreshToken = await jwt.signAsync (_.extend ({}, data, {expires: refreshTokenExpires}), config.user.secretKey);

				await redisClient.hDel (`o-refresh`, req.args.refreshToken);
				await redisClient.hSet (`o-refresh`, refreshToken, String (authId));

				delete data.expires;

				return Object.assign (data, {accessToken, refreshToken});
			} else {
				return {error: "401 Unauthenticated"};
			}
		} catch (err) {
			console.error ("auth.verify error", err);
			return {error: "401 Unauthenticated"};
		}
	} else {
		let data = authAdmin ({store, login, password}) || authUser ({store, login, password}) || {error: "401 Unauthenticated"};

		// todo: fix store.auth.user.roleCode update
		if (data.roleId && !data.roleCode && data.userId) {
			await store.readAuthInfo ();
			data.roleCode = store.auth.user [data.userId].roleCode;
		}
		if (data.username) {
			data.id = authId;
			data.ip = common.getRemoteAddress (req);

			let accessTokenExpires = (duration => {let d = new Date (); d.setTime (d.getTime () + duration); return d.getTime ()}) (config.user.accessTokenExpires);
			let accessToken = await jwt.signAsync (_.extend ({}, data, {expires: accessTokenExpires}), config.user.secretKey);
			let refreshTokenExpires = (duration => {let d = new Date (); d.setTime (d.getTime () + duration); return d.getTime ()}) (config.user.refreshTokenExpires);
			let refreshToken = await jwt.signAsync (_.extend ({}, data, {expires: refreshTokenExpires}), config.user.secretKey);

			await redisClient.hSet (`o-refresh`, refreshToken, String (authId));
			await redisClient.hSet (`o-user`, String (authId), JSON.stringify (_.extend ({}, data, {ua: uaParser (req.headers ["user-agent"]).ua})));

			return _.extend (data, {accessToken, refreshToken});
		} else {
			return data;
		}
	}
};

async function startTransaction (req) {
	log.debug ({fn: "project.startTransaction", session: req.session.id, description: req.args.description});
	
	if (req.session.username == "autologin" && request.session.userId == null) {
		throw new Error ("project.startTransaction: forbidden");
	}
	let store = await getStore ({code: req.code});
	let revision = await store.startTransaction ({
		session: req.session,
		remoteAddr: common.getRemoteAddress (req),
		description: req.args.description
	});
	return {revision};
};

async function commitTransaction (req) {
	log.debug ({fn: "project.commitTransaction", session: req.session.id});
	
	let store = await getStore ({code: req.code});
	let revision = await store.commitTransaction ({session: req.session});

	return {revision};
};

async function rollbackTransaction (req) {
	log.debug ({fn: "project.rollbackTransaction", session: req.session.id});
	
	let store = await getStore ({code: req.code});
	let revision = await store.rollbackTransaction ({session: req.session});

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
		await common.delay (config.user.pollingProgressInterval);
	} else {
		await common.delay (config.user.pollingInterval);
	}
	if (!_.has (req.args, "revision")) {
		throw new Error ("project.getNews: revision not exist");
	}
	let clientRevision = req.args.revision;
	let store = await getStore ({code: req.code});
	let data;

	if (clientRevision == 0 || clientRevision == store.lastRevision) {
		// first call
		data = {revision: store.lastRevision, created: [], updated: [], deleted: [], records: []};
	} else {
		// send changed objects id from revision to lastRevision
		let created = [], updated = [], deleted = [], metaChanged = false;
		
		for (let i = clientRevision + 1; i <= store.lastRevision; i ++) {
			let revision = store.revisions [i];
			
			if (revision) {
				if (revision.object.created.length) {
					created = [...created, ...revision.object.created];
				}
				if (revision.object.changed.length) {
					updated = [...updated, ...revision.object.changed];
				}
				if (revision.object.removed.length) {
					deleted = [...deleted, ...revision.object.removed];
				}
				if (revision.metaChanged) {
					metaChanged = true;
				}
			}
		}
		data = {revision: store.lastRevision, metaChanged, created, updated, deleted, records: []};
	}
	return data;
};

async function removeRefreshTokens () {
	log.debug ({fn: "project.removeRefreshTokens"});
	
	let result = await redisClient.hGetAll ("o-refresh");

	for (let refreshToken in result) {
		let authId = result [refreshToken];
		let data = common.parseJwt (refreshToken);

		if (data.expires < config.clock) {
			await redisClient.hDel ("o-refresh", refreshToken);
			await redisClient.hDel ("o-user", authId);
			await redisClient.hDel ("o-access", authId);

			log.info ({fn: "project.removeRefreshTokens"}, `removed: ${refreshToken}, ${JSON.stringify (data)}`);
		}
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
	let result = await redisClient.hGet (`o-${store.code}-requests`, "all");
 
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
		redisClient.hSet (`o-${store.code}-requests`, "all", JSON.stringify (result));
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
	redisClient.hDel ("o-access", String (req.session.id));
	redisClient.hDel ("o-user", String (req.session.id));
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

async function getStat (req) {
	log.debug ({fn: "project.getStat"});

	if (req.session.username != "admin") {
		return {error: "forbidden"};
	}
	let store = await getStore ({code: req.code});
	let refreshTokens = await redisClient.hGetAll ("o-refresh");
	let access = await redisClient.hGetAll ("o-access");

	log.debug ({
		fn: "project.getStat",
		refreshTokens: _.keys (refreshTokens).length,
		access: _.keys (access).length
	});
	let authMap = {};
	let data = {
		refreshToken: [],
		access: [],
		transaction: []
	};
	for (let refreshToken in refreshTokens) {
		let authId = refreshTokens [refreshToken];
		let payload = common.parseJwt (refreshToken);
		authMap [authId] = payload;
		data.refreshToken.push ({id: authId, expires: payload.expires});
	}
	data.map = authMap;
	let clockLimit = new Date ().getTime () - config.user.accessTokenExpires;

	for (let authId in access) {
		let clock = access [authId];

		if (clock > clockLimit) {
			data.access.push ({id: authId, time: Number (clock)});
		}
	}
	for (let authId in store.revision) {
		data.transaction.push ({id: authId, revision: store.revision [authId]});
	}
	return data;
};

module.exports = {
	init,
	loadConfig,
	startTransaction,
	commitTransaction,
	rollbackTransaction,
	getNews,
	createStores,
	getAll,
	upload,
	logout,
	getHandler,
	auth,
	removeRefreshTokens,
	www,
	wwwPublic,
	classFn,
	classAttrFn,
	viewFn,
	viewAttrFn,
	actionFn,
	objectFn,
	getData,
	getDict,
	getLog,
	getRecords,
	getStat
};
