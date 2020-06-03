"use strict";

const _ = require ("lodash");
const { Query } = require ("./query");
const fs = require ("fs");
const util = require ("util");
const fs_access = util.promisify (fs.access);

let project;
let projectPlugins = {};

const alias = [
	["application.school.student.school_enter", "application.school_enter"],
	["application.school.student.school_enter", "application.school.school_enter"],
	["application.school.student.school_enter", "application.student.school_enter"],
	["subject.human.admin", "subject.admin"],
	["subject.human.student", "subject.student"],
	["spr.application.application_status", "spr.application_status"],
	["spr.establishment.additionalService", "spr.additionalService"],
	["system.admin.Authentication.LoginPassword", "system.LoginPassword"]
];

function updateAliases (m, p, o) {
	for (let i = 0; i < alias.length; i ++) {
		let a = alias [i];
		
		if (a [0] == p) {
			m [a [1]] = o;
		}
	}
};

function addOrderId (sql) {
	let alias;
	
	for (alias in sql.from [0]) {
		break;
	}
	let order = sql.orderAfter || sql.order;
	
	order = order || [];
	
	let has = 0;
	
	for (let i = 0; i < order.length; i ++) {
		if (typeof (order [i]) == "object") {
			for (let a in order [i]) {
				if (order [i][a] == "id") {
					has = 1;
				}
			}
		}
	}
	if (!has) {
		if (["system.class", "system.class_attr", "system.view", "system.view_attr", "system.action", "system.object", "system.object_attr", "system.revision"].indexOf (sql.from [0][alias]) == -1) {
			if (order.length) {
				order.push (",");
			}
			order.push ({[alias]: "id"});
		}
	}
	if (sql.orderAfter) {
		sql.orderAfter = order;
	} else {
		sql.order = order;
	}
}

async function execute ({session, client, sql, resultText, asArray}) {
	log.debug ({fn: "store.execute"});
	
	let me = this;
	
	me.addOrderId (sql);
	
	let query = new Query ({store: me, sql});
	
	query.generate ();
	
	let fields = query.fields;
	let sql2 = query.selectSQL + query.fromSQL + query.whereSQL + query.orderSQL;
	let rows = await me.query ({session, client, sql: sql2});
	
	if (resultText) {
		/*
		let r = "[";
		
		for (let i = 0; i < rows.length; i ++) {
			if (i) {
				r += ",";
			}
			r += "[";
			
			for (let j = 0; j < fields.length; j ++) {
				if (j) {
					r += ",";
				}
				r += common.toJSONString (rows [i][fields [j]]);
			}
			r += "]";
		}
		r += "]";
		
		return r;
		*/
		return JSON.stringify (rows);
	}
	if (asArray || sql.asArray) {
		let attrs = _.filter (sql.select, function (s) {
			return typeof (s) == "string";
		});
		let recs = [];
		
		_.each (rows, function (row) {
			let rec = {};
			
			_.each (fields, function (f, i) {
				rec [attrs [i]] = row [f];
			});
			recs.push (rec);
		});
		return recs;
	} else {
		rows = _.map (rows, row => {
			let a = [];
			
			_.each (fields, function (f, i) {
				a.push (row [f]);
			});
			return a;
		});
	}
	return {
		rows, // надо массив
		length: rows.length,
		get: function (i, f) {
			if (i >= options.length) {
				return null;
			};
			return rows [i][f + "_"];
		}
	};
}

async function selectRow ({session, viewId, viewFilter, selectFilter}) {
	log.debug ({fn: "store.selectRow"});
	
	let me = this;
	let view = me.getView (viewId);
	let viewQuery = JSON.parse (view.get ("query"));
	
	if (viewFilter && viewFilter.length) {
		viewQuery.where = viewQuery.where || [];
		
		if (viewQuery.where.length) {
			viewQuery.where.push ("and");
		}
		viewQuery.where.push (viewFilter);
	}
	let rn = ["row_number ()", "over"];
	
	if (viewQuery.order) {
		rn.push (["order by"].concat (viewQuery.order));
	} else {
		rn.push ([]);
	}
	viewQuery.select.push (rn);
	viewQuery.select.push ("rn");
	
	let query = new Query ({store: me, sql: viewQuery});
	
	query.generate ();
	
	let sql = query.selectSQL + query.fromSQL + query.whereSQL + query.orderSQL;
	
	selectFilter [0] = selectFilter [0].substr (1) + "_";
	sql = "select rn_ from (" + sql + ") v where " + selectFilter.join (" ");
	
	let rows = await me.query ({session, sql});
	
	let r = 0;
	
	if (rows.length) {
		r = rows [0].rn_ - 1;
	}
	return {rn: r};
};

async function getContent ({viewId, row, rowCount, filter, order, total, dateAttrs, timeOffsetMin, session}) {
	log.debug ({fn: "store.getContent"});
	
	let me = this;
	let view = me.getView (viewId);
	let viewQuery = view.get ("query");
	
	if (!viewQuery || filter == "unselected") {
		return {
			recs: [],
			length: 0,
			columns: []
		};
	}
	viewQuery = JSON.parse (viewQuery.split ("2147483647").join ("0"));

	if (filter && filter.length) {
		viewQuery.where = viewQuery.where || [];
		
		if (viewQuery.where.length) {
			viewQuery.where = [viewQuery.where];
			viewQuery.where.push ("and");
		}
		viewQuery.where.push (filter);
	}
	if (order && order.length) {
		if (viewQuery.orderAfter) {
			viewQuery.orderAfter = order;
		} else {
			viewQuery.order = order;
		}
	}
	me.addOrderId (viewQuery);
	
	let classes = [];
	let query = new Query ({store: me, sql: viewQuery});
	
	query.generate ();
	
	let sql = query.selectSQL + query.fromSQL + query.whereSQL + query.orderSQL;
	
	for (let a in query.attrs) {
		let getClasses = function (classId) {
			classes.push (classId);
			let childs = me.map ["class"][classId].childs;
			for (let i = 0; i < childs.length; i ++) {
				getClasses (childs [i]);
			}
		};
		let classCode = query.attrs [a].cls;
		
		if (["system.class", "system.class_attr", "system.view", "system.view_attr"].indexOf (classCode) > -1) {
			continue;
		}
		getClasses (me.map ["class"][classCode].get ("id"));
	}
	let sqlLimit = sql + `\nlimit ${rowCount} offset ${row}\n`;
	//let rows = await me.query ({session, sql: sqlLimit});
	let sqlCount = sql;
	let s = "select\n\tcount (*) as rows_num";
	
	for (let t in total) {
		let has = 0;
		
		for (let i = 1; i < viewQuery.select.length; i += 2) {
			if (viewQuery.select [i] == t) {
				has = 1;
				break;
			}
		}
		if (!has) {
			continue;
		}
		let field = t.toLowerCase () + "_";
		
		if (total [t] == "cnt") {
			total [t] = "count";
		}
		s += `, ${total [t]}(${field}) as ${field}`;
	}
	s += `\nfrom (${sqlCount}`;
	s += `\nlimit ${config.query.maxCount || 1000} offset 0\n`;
	s += ") v\n";
	
	//let totalRow = (await me.query ({session, sql: s})) [0];
	
	let [rows, totalRow] = await Promise.all (me.query ({session, sql: sqlLimit}), await me.query ({session, sql: s}));
	
	totalRow = totalRow [0];
	
	let attrs = view.attrs, attrsNum = 0;
	let orderAttrs = [];
	
	for (let attrCode in attrs) {
		attrs [attrCode].set ("field", attrs [attrCode].get ("code").toLowerCase () + "_");
		orderAttrs.push (attrs [attrCode]);
		attrsNum ++;
	}
	orderAttrs.sort (function (a, b) {
		let c = a.get ("order"), d = b.get ("order");
		if (d == null || c < d) {
			return -1;
		}
		if (c == null || c > d) {
			return 1;
		}
		if (c == d) {
			return 0;
		}
	});
	let r = {
		length: totalRow.rows_num
	};
	if (totalRow.rows_num >= (config.query.maxCount || 1000)) {
		r.overflow = 1;
	}
	let columns = _.map (orderAttrs, function (attr) {
		let field = attr.get ("code").toLowerCase () + "_";
		
		return {
			width: attr.get ("columnWidth"),
			area: attr.get ("area"),
			attrId: attr.get ("id"),
			attr: attr.get ("code"),
			text: attr.get ("name"),
			typeId: query.fieldTypeId [field],
			total: totalRow [field]
		};
	});
	r.columns = columns;
	
	let recs = _.map (rows, function (row) {
		let rec = {};
		
		_.map (orderAttrs, function (attr) {
			let value = row [attr.get ("field")];
			
			if (dateAttrs && dateAttrs.indexOf (attr.get ("code")) > -1 && _.isDate (value)) {
				value.setMinutes (0);
				value.setSeconds (0);
				value.setMilliseconds (0);
			}
			rec [attr.get ("code")] = value;
		});
		return rec;
	});
	r.recs = recs;
	
	return r;
}

async function processProjectPlugins (req, res) {
	let storeCode = req.code;
	
	req.method = req.raw.method;
	
	if (req.body && typeof (req.body) == "object") {
		req.body = JSON.stringify (req.body);
	}
	if (projectPlugins [storeCode]) {
		projectPlugins [storeCode] (req, res);
	} else {
		await project.getStore ({code: storeCode});
		
		if (projectPlugins [storeCode]) {
			projectPlugins [storeCode] (req, res);
		} else {
		}
	}
};

class Storage {
	constructor (store) {
		this.store = store;
		this.redisClient = store.redisClient;
		this.rootDir = store.rootDir;
	}
	
	startTransaction (options, cb) {
		let success = options.success;
		let failure = options.failure;
		let session = options.session;
		let description =  options.description;
		let remoteAddr = options.remoteAddr || session.ip;
		
		this.store.startTransaction ({session, description, remoteAddr}).then (id => {
			if (cb) {
				cb (null, id);
			} else
			if (success) {
				success ({revision: id});
			}
		}, err => {
			if (cb) {
				cb (err);
			} else
			if (failure) {
				failure (err);
			}
		});
	}
	
	commitTransaction (options, cb) {
		let success = options.success;
		let failure = options.failure;
		let session = options.session;
		
		this.store.commitTransaction ({session}).then (() => {
			if (cb) {
				cb ();
			} else if (success) {
				success ({});
			}
		}, err => {
			if (cb) {
				cb (err);
			} else if (failure) {
				failure (err);
			}
		});
	}
	
	rollbackTransaction (options, cb) {
		let success = options.success;
		let failure = options.failure;
		let session = options.session;
		
		this.store.commitTransaction ({session}).then (revision => {
			if (cb) {
				cb (null, revision);
			} else if (success) {
				success ({revision});
			}
		}, err => {
			if (cb) {
				cb (err);
			} else if (failure) {
				failure (err);
			}
		});
	}
	
	getId (options) {
		let session = options.session;
		let success = options.success;
		let failure = options.failure;
		let classCode = options.classCode;
		let valueCode = options.valueCode || options.code;
		
		if (!valueCode) {
			return success ({id: null});
		}
		this.store.getId ({session, classCode, code: valueCode}).then (id => {
			success ({id});
		}, err => {
			if (failure) {
				failure (err);
			} else {
				success ({id: null});
			}
		});
	}
	
	execute (options, cb) {
		let success = options.success;
		let failure = options.failure;
		
		if (!options.session && !options.client) {
			options.client = this.store.client;
		}
		this.store.execute (options).then (result => {
			if (cb) {
				cb (null, result);
			} else if (success) {
				success (result);
			}
		}, err => {
			if (cb) {
				cb (err);
			} else if (failure) {
				failure (err);
			}
		});
	}
	
	getClassAttr (options) {
		return this.store.getClassAttr (options);
	}
};

class Objectum {
	constructor () {
		let me = this;
		let _ = require ("lodash");
		
		_.findWhere = _.findLast;
		_.where = _.filter;
		
		global.async = require ("async");
		global._ = _;
		global.fs = require ("fs");
		
		me.common = require ("./common");
		me.config = config;
		me.mimetypes = require ("./mimetypes");
		me.modules = {
			async: require ("async"),
			pg: require ("pg"),
			util: require ("util"),
			fs: require ("fs"),
			http: require ("http"),
			url: require ("url"),
			redis: require ("redis"),
			nodemailer: require ("nodemailer"),
			simplesmtp: require ("simplesmtp"),
			_
		};
		me.projects = {
			sessions: project.sessions
		};
	}
};

async function startProjectPlugins ({store}) {
	if (config.stores [store.code].pluginStarted || config.stores [store.code].disablePlugins) {
		return;
	}
	config.stores [store.code].pluginStarted = true;
	
	let pluginsFile = config.stores [store.code].rootDir + "/plugins/plugins.js"
	
	try {
		await fs_access (pluginsFile);
	} catch (err) {
		return;
	}
	try {
		let m = require (pluginsFile);
		
		if (m.init) {
			m.init ({objectum: new Objectum (), storage: new Storage (store), success: () => {
				log.info ({cls: "plugins"}, "plugin " + pluginsFile + " initialized.");
			}, failure: err => {
				log.error ({cls: "plugins", error: pluginsFile + " error: " + err});
			}}, () => {
				log.info ({cls: "plugins"}, "plugin " + pluginsFile + " initialized.");
			});
		}
		if (m.handler) {
			projectPlugins [store.code] = m.handler;
			log.info ({cls: "plugins"}, "plugin " + pluginsFile + " handler activated.");
		}
	} catch (err) {
		log.error ({cls: "plugins", plugin: pluginsFile, err});
	}
};

async function projectSelectRow (req) {
	log.debug ({fn: "project.selectRow", args: req.args});
	
	let store = await project.getStore ({code: req.code});
	let result = await store.selectRow (_.extend ({session: req.session}, req.args));
	
	return result;
};

async function startWSDL () {
	if (!(config.wsdl && config.wsdl.enabled == false)) {
		let codes = _.keys (config.stores);
		
		for (let i = 0; i < codes.length; i++) {
			let storeCode = codes [i];
			let wsdlFile = config.stores [storeCode].rootDir + "/wsdl/wsdl.js"
			
			if (config.stores [storeCode].wsdl && !config.stores [storeCode].wsdl.enabled) {
				continue;
			}
			try {
				await fs_access (wsdlFile);
				
				let store = await project.getStore ({storeCode});
				// todo: одинаковые wsdl.js накрывают друг друга
				let wsdl = require (wsdlFile);
				
				store.rootDir = config.stores [storeCode].rootDir;
				wsdl.start ({objectum, store});
			} catch (err) {
			}
		}
	}
};

async function startPlugins () {
	if (!config.plugins) {
		return;
	}
	let codes = _.keys (config.plugins);
	
	for (let i = 0; i < codes.length; i ++) {
		let pluginCode = codes [i];
		let plugin = config.plugins [pluginCode];
		
		try {
			await fs_access (plugin.require);
			
			let m = require (plugin.require);
			
			plugin.module = m;
			
			if (m.init) {
				m.init ({objectum}, () => {
					log.info ({cls: "server", fn: "startPlugins"}, `plugin ${plugin.require} initialized.`);
				});
			}
			if (m.handler) {
				app.all (plugin.path, m.handler);
				log.info ({fn: "server.startPlugins"}, `plugin ${plugin.require} handler activated.`);
			}
		} catch (err) {
		}
	}
};

function copyFile (req, res, next) {
	if (req.url.indexOf ("/copy_file?") == -1) {
		return next ();
	}
	let session = req.session;
	
	if (session && session.store) {
		let store = session.store;
		let rootDir = store.config.rootDir;
		let srcObjectId = req.query.src_object_id;
		let srcClassAttrId = req.query.src_class_attr_id;
		let dstObjectId = req.query.dst_object_id;
		let dstClassAttrId = req.query.dst_class_attr_id;
		let filename = req.query.filename;
		let src = `${rootDir}/files/${srcObjectId}-${srcClassAttrId}-${filename}`;
		let dst = `${rootDir}/files/${dstObjectId}-${dstClassAttrId}-${filename}`;
		
		fs.readFile (src, function (err, data) {
			if (err) {
				res.send ({err: 1});
			} else {
				fs.writeFile (dst, data, function (err) {
					if (err) {
						res.send ({err: 1});
					} else {
						res.send ({ok: 1});
					}
				});
			}
		});
	} else {
		res.status (403).send ("Invalid session");
	}
};

function saveToFile (req, res, next) {
	if (req.url.indexOf ("/save_to_file?") == -1) {
		return next ();
	}
	let session = req.session;
	
	if (session && session.store) {
		let store = session.store;
		let rootDir = store.config.rootDir;
		let objectId = req.query.object_id;
		let classAttrId = req.query.class_attr_id;
		let filename = req.query.filename;
		let path = `${rootDir}/files/${objectId}-${classAttrId}-${filename}`;
		
		fs.writeFile (path, req.body, function (err) {
			if (err) {
				res.send ({err: 1});
			} else {
				res.send ({ok: 1});
			}
		});
	} else {
		res.status (403).send ("Invalid session");
	}
};

function sendmail (req, res, next) {
	let session = req.session;
	
	if (req.url.indexOf ("/sendmail") > -1 && sessions [session.id]) {
		let form = new formidable.IncomingForm ();
		
		form.parse (req, function (error, fields, files) {
			if (error) {
				console.error (error, `project.sendmail: fields: ${JSON.stringify (fields)}`);
				return next (error);
			}
			let attachments = [];
			
			if (fields.attachments) {
				let store = sessions [session.id].store;
				
				_.each (JSON.parse (fields.attachments), function (o) {
					if (o.filePath) {
						o.filePath = store.rootDir + "/files/" + o.filePath;
					}
					attachments.push (o);
				});
			}
			mail.send ({
				to: fields.to,
				from: fields.from,
				subject: fields.subject,
				html: fields.message,
				session: request.session,
				attachments: attachments
			}, function (err) {
				if (err) {
					log.error ({fn: "project.sendmail", error: "sendmail error: " + JSON.stringify (error) + " fields: " + JSON.stringify (fields)});
					return next (err);
				}
				log.info ({fn: "project.sendmail"}, "mail sended: " + JSON.stringify (fields));
				res.send ({success: true});
			});
		});
	} else {
		next ();
	}
};

async function projectGetContent (req) {
	log.debug ({fn: "project.getContent", args: req.args});
	
	let store = await project.getStore ({code: req.code});
	let result = await store.getContent (_.extend ({session: req.session}, req.args));
	
	return result;
};

async function projectExecute (req) {
	if (!_.get (req.args, "sql")) {
		throw new Error ("project.execute: sql not exist");
	}
	let store = await project.getStore ({code: req.code});
	let rows = await store.execute ({session: req.session, sql: req.args.sql});
	
	return rows;
};

async function readAuthInfo () {
	let me = this;
	let rows = await me.execute ({client: me.client, sql: {
			asArray: true,
			select: [
				{"a": "id"}, "id",
				{"a": "login"}, "login",
				{"a": "password"}, "password",
				{"a": "use"}, "use"
			],
			from: [
				{"a":"system.admin.Authentication.LoginPassword"}
			]
		}});
	let processedLoginPasswordPairs = {};
	
	for (let i = 0; i < rows.length; i ++) {
		let row = rows [i];
		
		if (!row.use) {
			continue;
		}
		let loginAttrId = row.login;
		let passwordAttrId = row.password;
		
		if (!processedLoginPasswordPairs [loginAttrId] == passwordAttrId) {
			continue;
		}
		processedLoginPasswordPairs [loginAttrId] = passwordAttrId;
		me.auth.login [loginAttrId] = 1;
		me.auth.password [passwordAttrId] = 1;
		
		let loginAttr = me.map ["classAttr"][loginAttrId];
		let passwordAttr = me.map ["classAttr"][passwordAttrId];
		let cls = me.map ["class"][loginAttr.get ("class")];
		let sql = {
			asArray: true,
			select: [
				{"a": "id"}, "id",
				{"a": loginAttr.get ("code")}, "login",
				{"a": passwordAttr.get ("code")}, "password"
			],
			from: [
				{"a": cls.getPath ()}
			],
			where: [
				{"a": loginAttr.get ("code")}, "is not null", "and",
				{"a": passwordAttr.get ("code")}, "is not null"
			]
		};
		let recs = await me.execute ({client: me.client, sql});
		
		_.each (recs, function (rec) {
			let o = {
				login: rec.login,
				password: rec.password,
				id: rec.id,
				hasTryAttrs: cls.attrs.lastTry ? true : false
			};
			me.auth.user [rec.login] = o;
			me.auth.user [rec.id] = o;
		});
	}
	let sroleRecs = await me.execute ({
		client: me.client,
		sql: {
			asArray: true,
			select: [
				{"a": "subject"}, "subject",
				{"a": "role"}, "role",
				{"b": "menu"}, "menu"
			],
			from: [
				{"a":"ose.srole"},
				"left-join", {"b": "ose.role"}, "on", [{"a": "role"}, "=", {"b": "id"}]
			]
		}
	});
	_.each (sroleRecs, function (rec) {
		let o = me.auth.user [rec.subject];
		
		if (o) {
			o.role = rec.role;
			o.menu = rec.menu;
		}
	});
	me.auth.roleClassId = me.getClass ("ose.role").get ("id");
	me.auth.sroleClassId = me.getClass ("ose.srole").get ("id");
};

function init () {
	project = require ("./project");
};

module.exports = {
	init,
	updateAliases,
	addOrderId,
	execute,
	selectRow,
	getContent,
	projectPlugins,
	processProjectPlugins,
	startProjectPlugins,
	projectSelectRow,
	startWSDL,
	copyFile,
	saveToFile,
	sendmail,
	startPlugins,
	projectGetContent,
	projectExecute,
	readAuthInfo,
	Storage,
	Objectum
};
