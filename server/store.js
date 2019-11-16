"use strict"

const _ = require ("lodash");
const { createClient } = require ("./db/client").db;
const { Base, Object, Action, factory } = require ("./model");
const { Query } = require ("./query");
const { native, getMetaTable } = require ("./map");
const legacy = require ("./legacy");

// todo: me.redisClient.hset ("sessions", `${session.id}-clock`, config.clock);
// todo: redisEmulator Promise

class Store {
	constructor ({code, connection, systemDB}) {
		let me = this;
		
		_.extend (me, {
			code,
			connection,
			systemDB,
			// Database main client object
			client: null,
			// Connections to database. One connection - one transaction.
			clientPool: {},
			// Current revision of transaction
			revision: {},
			// Current revisions
			revisions: {},
			
			recs: {
				"class": [],
				"classAttr": [],
				"view": [],
				"viewAttr": []
			},
			map: {
				"class": {},
				"classAttr": {},
				"view": {},
				"viewAttr": {}
			},
			// Dictionary
			dataId: {},
			
			auth: {
				login: {}, // login attributes
				password: {}, // password attributes
				user: {}, // user records by id, login
				roleClassId: null,
				sroleClassId: null
			}
		});
	}
	
	getClient ({session}) {
		let me = this;
		
		return me.clientPool [session.id] || createClient (me);
	}
	
	async query ({session, client, sql, params, fields, rowMode}) {
		let me = this;
		
		if (!client && !session) {
			throw new Error ("session not exists");
		}
		client = client || me.getClient ({session});
		
		// hide params
/*
		if (params) {
			for (let i = 0; i < params.length; i ++) {
				sql = sql.replace (`$${i + 1}`, `#${i + 1}`);
			}
		}
*/
		// prepare
/*
		let s = "", c, newSql = "";
		
		for (let i = 0; i < sql.length; i ++) {
			c = sql [i];
			if (c == "$") {
				if (s) {
					s = s.substr (1);
					if (client.tags.hasOwnProperty (s)) {
						newSql += client.tags [s];
					} else {
						newSql += `$${s}$`;
					}
					s = "";
				} else {
					s = c;
				}
			} else {
				if (s) {
					s += c;
				} else {
					newSql += c;
				}
			}
		}
		if (s) {
			newSql += s;
		}
		sql = newSql;
*/
		
		// returnParams
/*
		if (params) {
			for (let i = 0; i < params.length; i ++) {
				sql = sql.replace (`#${i + 1}`, `$${i + 1}`);
			}
		}
*/
		let fArray = fields ? [] : undefined;
		let rows = await client.query ({sql, params, rowMode, fields: fArray});
		
		if (fields) {
/*
			for (let i = 0; i < fArray.length; i ++) {
				let f = fArray [i];
				let pgo = me.pgObject [f.tableID];
				
				if (!pgo) {
					await me.loadPgObjects ({});
					pgo = me.pgObject [f.tableID];
				}
				fields [f.name] = {
					table: pgo.table,
					column: pgo.columns [f.columnID] ? pgo.columns [f.columnID].column : null
				};
			}
*/
			for (let i = 0; i < fArray.length; i ++) {
				let f = fArray [i];
				let pgo = me.pgObject [f.tableID];
				
				if (!pgo) {
					await me.loadPgObjects ({});
					pgo = me.pgObject [f.tableID];
				}
				fields.push ({
					alias: f.name,
					table: pgo.table,
					column: pgo.columns [f.columnID] ? pgo.columns [f.columnID].column : null
				});
			}
		}
		if ((!session || !this.clientPool [session.id]) && !client.inStore) {
			client.disconnect ();
		}
		return rows;
	}
	
	async createRevision ({description, session, remoteAddr}) {
		let client = this.clientPool [session.id];
		let id = await client.getNextId ({table: "trevision"});
		
		this.lastRevision = id;
		remoteAddr = remoteAddr ? `'${remoteAddr}'` : "null";
		session.userId = session.userId || "null";
		
		let sql = `
			insert into trevision (fid, fdate, fdescription, fsubject_id, fremote_addr)
			values (${id}, ${client.currentTimestamp ()}, '${description}', ${session.userId}, ${remoteAddr})
		`;
		await this.query ({session, sql});
		return id;
	}
	
	async startTransaction ({session, description, remoteAddr}) {
		log.debug ({fn: "store.startTransaction", description});
		
		let client = createClient (this);
		
		if (this.clientPool [session.id]) {
			await this.rollbackTransaction ({session});
		}
		await client.connect ();
		await client.startTransaction ();
		this.clientPool [session.id] = client;
		
		let id = await this.createRevision ({session, description, remoteAddr});
		
		await this.query ({session, sql: `select set_config ('objectum.revision_id', '${id}', True)`});
		
		this.revision [session.id] = id;
		this.revisions [id] = {
			id,
			dirty: true // after commitTransaction = true
		};
		_.each (["object", "class", "classAttr", "view", "viewAttr", "auth"], rsc => {
			this.revisions [id][rsc] = {
				changed: [],
				created: [],
				removed: []
			};
		});
		await client.setConfig ("objectum.revision_id", id, true);
		
		return id;
	}
	
	async commitTransaction ({session}) {
		let me = this;
		
		log.debug ({fn: "store.commitTransaction"});
		
		if (this.revision [session.id]) {
			let client = this.clientPool [session.id];
			
			if (client) {
				let revision = this.revision [session.id];
				let rows = await client.query ({sql: `select fid, frsc_id, foper_id from _log`});

				for (let i = 0; i < rows.length; i ++) {
					let row = rows [i];
					
					if (row.frsc_id == 12) {
						if (row.foper_id == 1) {
							me.revisions [revision]["object"].created.push (row.fid);
						}
						if (row.foper_id == 2) {
							me.revisions [revision]["object"].changed.push (row.fid);
						}
						if (row.foper_id == 3) {
							me.revisions [revision]["object"].removed.push (row.fid);
						}
					};
				}
				await client.query ({sql: `delete from _log`});
				await client.commitTransaction ();
				
				client.disconnect ();
				
				delete this.clientPool [session.id];
				delete this.revision [session.id];
				
				if (this.revisions [revision]) {
					this.revisions [revision].dirty = false;
					this.redisPub.publish (`${config.redis.db}-${this.code}-revisions`, JSON.stringify (this.revisions [revision]));
				}
				return revision;
			}
		}
	}
	
	async rollbackTransaction ({session}) {
		log.debug ({fn: "store.rollbackTransaction"});
		
		if (this.revision [session.id]) {
			let revision = this.revision [session.id];
			
			delete this.revisions [revision];
			delete this.revision [session.id];
			
			let client = this.clientPool [session.id];
			
			if (!client) {
				// removeTimeoutSessions exception
				return revision;
			}
			await client.rollbackTransaction ();
			delete this.clientPool [session.id];
			client.disconnect ();
			return revision;
		}
	}
	
	addAttr (map, o, a) {
		let me = this;
		
		o.attrs [a.get ("code")] = a;
		
		_.each (o.childs, id => {
			me.addAttr (map, map [id], a);
		});
	};
	
	removeAttr (map, o, a) {
		let me = this;
		
		delete o.attrs [a.get ("code")];
		
		_.each (o.childs, id => {
			me.removeAttr (map, map [id], a);
		});
	};
	
	getClass (id) {
		let me = this;
		
		if (me.map ["class"][id]) {
			return me.map ["class"][id];
		} else {
			throw new Error (`store.getClass: Unknown class: ${id}`);
		}
	}
	
	getTypeId (id) {
		let me = this;

		if (_.isNumber (id) && id >= 1 && id <= 13) {
			return id;
		}
		if (native [id]) {
			return native [id];
		}
		let cls = me.getClass (id);
		
		return cls.get ("id");
	}
	
	getClassAttr (opts) {
		let me = this;
		
		if (typeof (opts) == "number" || typeof (opts) == "string") {
			if (me.map ["classAttr"][opts]) {
				return me.map ["classAttr"][opts];
			} else {
				throw new Error (`store.getClassAttr: Unknown classAttr: ${opts}`);
			}
		} else {
			let o = me.getClass (opts.classCode || opts.classId);
			
			if (o) {
				if (o.attrs [opts.attrCode]) {
					return o.attrs [opts.attrCode];
				} else {
					throw new Error (`store.getClassAttr: Unknown attrCode: ${opts.attrCode} (class: ${opts.classId || opts.classCode})`);
				}
			} else {
				throw new Error (`store.getClassAttr: Unknown class: ${opts.classCode || opts.classId}`);
			}
		}
	}
	
	getView (id) {
		let me = this;
		
		if (me.map ["view"][id]) {
			return me.map ["view"][id];
		} else {
			throw new Error (`store.getView: Unknown view: ${id}`);
		}
	}
	
	getViewAttr (opts) {
		let me = this;
		
		if (typeof (opts) == "number" || typeof (opts) == "string") {
			if (me.map ["viewAttr"][opts]) {
				return me.map ["viewAttr"][opts];
			} else {
				throw new Error (`store.getViewAttr: Unknown viewAttr: ${opts}`);
			}
		} else {
			let o = me.getView (opts.viewCode || opts.viewId);
			
			if (o) {
				if (o.attrs [opts.attrCode]) {
					return o.attrs [opts.attrCode];
				} else {
					throw new Error (`store.getViewAttr: Unknown attrCode: ${opts.attrCode} (view: ${opts.viewId || opts.viewCode})`);
				}
			} else {
				throw new Error (`store.getViewAttr: Unknown view: ${opts.viewCode || opts.viewId}`);
			}
		}
	}
	
	async getAction ({session, id}) {
		log.debug ({fn: "store.getAction"});
		
		let me = this;
		let rows, opts;
		
		if (typeof (id) == "number") {
			opts = {
				session,
				sql: `select * from taction where fend_id = 0 and fid = ${id}`
			};
		} else
		if (typeof (id) == "string") {
			let tokens = id.split (".");
			let classCode = tokens.slice (0, tokens.length - 1).join (".");
			let code = tokens [tokens.length - 1];
			let classId = me.getClass (classCode).get ("id");
			opts = {
				session,
				sql: `select * from taction where fend_id = 0 and fclass_id = ${classId} and fcode = '${code}'`
			};
		}
		if (!session) {
			opts.client = me.client;
		}
		rows = await me.query (opts);
		
		if (!rows.length) {
			throw new Error (`unknown action: ${id}`);
		}
		return new Action ({store: me, row: rows [0]});
	}
	
	async getObject ({session, id}) {
		log.debug ({fn: "store.getObject", id});
		
		let me = this;
		let object;
		let result = await me.redisClient.hgetAsync (`${me.code}-objects`, id);
		
		if (result) {
			object = new Object ({store: me});
			object.data = JSON.parse (result);
			object.originalData = _.extend ({}, object.data);
		}
		if (!object) {
			let opts = {
				session,
				sql: `
					select a.fclass_attr_id, a.fstring, a.ftime, fnumber, b.fclass_id
					from tobject b
					left join tobject_attr a on (a.fobject_id=b.fid and a.fend_id = 0)
					where b.fid = ${id} and b.fend_id = 0
				`
			};
			if (!session) {
				opts.client = me.client;
			}
			let rows = await me.query (opts);
			
			if (!rows.length) {
				throw new Error (`store.getObject: Unknown object: ${id}`);
			}
			object = new Object ({store: me});
			object.data.id = id;
			object.data.fclass_id = object.data.classId = object.data ["_class"] = rows [0].fclass_id;
			
			_.each (rows, function (row) {
				let classAttr = me.map ["classAttr"][row.fclass_attr_id];
				
				if (!classAttr) {
					return;
				}
				let value;
				
				if (classAttr.get ("type") == 1 || classAttr.get ("type") == 5) {
					value = row.fstring;
				} else if (classAttr.get ("type") == 3) {
					value = row.ftime;
				} else {
					value = row.fnumber;
				}
				object.data [classAttr.get ("code")] = value;
				object.originalData [classAttr.get ("code")] = value;
			});
			if (!me.revision [session.id]) {
				me.redisClient.hset (`${me.code}-objects`, id, JSON.stringify (object.toJSON ()));
			}
		}
		return object;
	}
	
	async getId ({session, client, classCode, code}) {
		log.debug ({fn: "store.getId"});
		
		let me = this;
		
		if (!me.dataId [classCode]) {
			let recs = await me.execute ({session, client, sql: {
					asArray: true,
					select: [
						{"a": "id"}, "id",
						{"a": "code"}, "code"
					],
					from: [
						{"a": classCode}
					]
				}});
			let map = {};
			
			_.each (recs, function (rec) {
				map [rec.code] = rec.id;
			});
			me.dataId [classCode] = map;
		}
		let id = me.dataId [classCode][code];
		
		if (id) {
			return id;
		} else {
			throw new Error (`store.getId: unknown code: ${code}, class: ${classCode}`);
		}
	}
	
	addOrderId (sql) {
		return legacy.addOrderId.call (this, sql);
	}
	
	async execute ({session, client, sql, resultText, asArray}) {
		return await legacy.execute.call (this, {session, client, sql, resultText, asArray});
	}
	
	async selectRow ({session, viewId, viewFilter, selectFilter}) {
		return await legacy.selectRow.call (this, {session, viewId, viewFilter, selectFilter});
	};
	
	async getContent ({viewId, row, rowCount, filter, order, total, dateAttrs, timeOffsetMin, session}) {
		return await legacy.getContent.call (this, {viewId, row, rowCount, filter, order, total, dateAttrs, timeOffsetMin, session});
	}
	
	async readAuthInfo () {
		log.debug ({fn: "store.readAuthInfo"});
		
		let me = this;
		
		if (config.legacy) {
			return await legacy.readAuthInfo.call (this);
		}
		let userCls = me.getClass ("objectum.user");
		let roleCls = me.getClass ("objectum.role");
		let recs = await me.query ({
			client: me.client, sql: `
				select
					a.fobject_id as id,
					a.${userCls.attrs ["login"].getField ()} as login,
					a.${userCls.attrs ["password"].getField ()} as password,
					a.${userCls.attrs ["role"].getField ()} as role,
					b.${roleCls.attrs ["menu"].getField ()} as menu
				from
					${userCls.getTable ()} a
					inner join ${roleCls.getTable ()} b on (a.${userCls.attrs ["role"].getField ()} = b.fobject_id)
			`
		});
		_.each (recs, function (rec) {
			let o = {
				login: rec.login,
				password: rec.password,
				id: rec.id,
				role: rec.role,
				menu: rec.menu
			};
			me.auth.user [rec.login] = o;
			me.auth.user [rec.id] = o;
		});
		me.auth.roleClassId = me.getClass ("objectum.role").get ("id");
		me.auth.sroleClassId = me.getClass ("objectum.user").get ("id");
	}
	
	end () {
		log.debug ({fn: "store.end"});
		
		let me = this;
		
		me.client.disconnect ();
		me.redisClient.quit ();
		me.redisSub.quit ();
		me.redisPub.quit ();
	}
	
	initRsc ({rsc, action, o}) {
		let me = this;

		if (!me.map [rsc]) {
			return;
		}
		if (action == "create") {
			me.map [rsc][o.get ("id")] = o;
			
			if (!_.find (me.recs [rsc], rec => rec.get ("id") == o.get ("id"))) {
				me.recs [rsc].push (o);
			}
			let path = o.getPath ();
			
			if (path) {
				me.map [rsc][path] = o;
				
				legacy.updateAliases (me.map [rsc], path, o);
			}
			if ((rsc == "class" || rsc == "view") && o.get ("parent")) {
				let addChild = function (rsc, o, id) {
					if (me.map [rsc][o.get ("parent")]) {
						me.map [rsc][o.get ("parent")].childs.push (id);
						addChild (rsc, me.map [rsc][o.get ("parent")], id);
					}
				};
				addChild (rsc, o, o.get ("id"));
/*
				if (me.map [rsc][o.get ("parent")]) {
					me.map [rsc][o.get ("parent")].childs.push (o.get ("id"));
				}
*/
				if (rsc == "class" && o.get ("parent")) {
					_.each (me.map ["class"][o.get ("parent")].attrs, (ca, code) => {
						o.attrs [code] = ca;
					});
				}
			}
			if (rsc == "classAttr" && o.get ("class")) {
				me.addAttr (me.map ["class"], me.getClass (o.get ("class")), o);
			}
			if (rsc == "viewAttr" && o.get ("view")) {
				me.addAttr (me.map ["view"], me.getView (o.get ("view")), o);
			}
		}
		if (action == "remove") {
			if (o.get ("parent")) {
				_.remove (me.map [rsc][o.get ("parent")].childs, childId => {
					return childId == o.get ("id");
				});
			}
			delete me.map [rsc][o.get ("id")];
			
			if (o.getPath ()) {
				delete me.map [rsc][o.getPath ()];
			}
			_.remove (me.recs [rsc], rec => {
				return rec.get ("id") == o.get ("id");
			});
			if (rsc != "object" && o.get ("class")) {
				me.removeAttr (me.map ["class"], me.map ["class"][o.get ("class")], o);
			}
			if (o.get ("view")) {
				me.removeAttr (me.map ["view"], me.map ["view"][o.get ("view")], o);
			}
		}
	}
	
	async loadPgObjects ({table, column}) {
		log.debug ({fn: "store.loadPgObjects"});
		
		let me = this;
		let rows = await me.query ({client: me.client, sql: `
			select
				a.table_name, a.column_name, a.ordinal_position, b.oid
			from
				information_schema.columns a
				inner join pg_class b on (a.table_name = b.relname)
			where
				a.table_schema = '${me.code}'
				${table ? ` and table_name = '${table}'` : ""}
				${column ? ` and column_name = '${column}'` : ""}
			order by
				a.table_name, a.ordinal_position
		`});
		me.pgObject = me.pgObject || {};
		
		_.each (rows, row => {
			me.pgObject [row.oid] = me.pgObject [row.oid] || {
				oid: row.oid,
				table: row.table_name,
				columns: {}
			};
			me.pgObject [row.oid].columns [row.ordinal_position] = {
				oid: row.oid,
				table: row.table_name,
				column: row.column_name,
				pos: row.ordinal_position
			};
		});
	}
	
/*
	addInternals () {
		let me = this;
		let o = new View ({
			store: me,
			rec: {
				"id": -1,
				"parent": null,
				"name": "Internal dictionary",
				"code": "internal-dictionary",
				"query": ""
			}
		});
		o.attrs = {
			"id": new ViewAttr ({
				store: me,
				rec: {
					"id": -1,
					"name": "id",
					"code": "id",
					"order": 1,
					"area": 1,
				}
			}),
			"name": new ViewAttr ({
				store: me,
				rec: {
					"id": -1,
					"name": "Name",
					"code": "name",
					"order": 2,
					"area": 1,
				}
			})
		};
		me.map ["view"]["internal-dictionary"] = o;
	}
*/
	
	async init () {
		log.debug ({fn: "store.init"});
		
		let me = this;
		
		me.client = createClient (me);
		me.client.inStore = 1;
		
		await me.client.connect ({systemDB: me.systemDB});
		
		if (!me.systemDB) {
			if (config.port == config.startPort || process.env.mainWorker) {
				await me.client.update ();
			}
			let rscList = ["class", "classAttr", "view", "viewAttr"];
			
			for (let i = 0; i < rscList.length; i ++) {
				let rsc = rscList [i];
				
				log.debug ({fn: `store.init: ${rsc}`});
				
				let sql = `select * from ${getMetaTable (rsc)} where fend_id = 0`;
				
				if (rsc == "class") {
					sql += " and fid >= 1000";
				}
				if (rsc == "classAttr") {
					sql += " and fclass_id in (select fid from tclass where fend_id = 0)";
				}
				if (rsc == "viewAttr") {
					sql += " and fview_id in (select fid from tview where fend_id = 0)";
				}
				sql += " order by fid";
				
				let rows = await me.query ({client: me.client, sql});
				
				_.each (rows, function (row) {
					let o = factory ({rsc, store: me, row});
					
					me.map [rsc][o.get ("id")] = o;
					me.recs [rsc].push (o);
				});
				_.each (me.recs [rsc], function (o) {
					me.initRsc ({rsc, action: "create", o});
				});
			}
//			me.addInternals ();
			
			try {
				await me.readAuthInfo ();
			} catch (err) {
				log.error (`readAuthInfo error: ${err}`);
			}
/*
			let rows = await me.query ({client: me.client, sql: `
				select
					a.table_name, a.column_name, a.ordinal_position, b.oid
				from
					information_schema.columns a
					inner join pg_class b on (a.table_name = b.relname)
				where
					a.table_schema = '${me.code}'
				order by
					a.table_name, a.ordinal_position
			`});
			me.pgObject = {};
			
			_.each (rows, row => {
				me.pgObject [row.oid] = me.pgObject [row.oid] || {
					oid: row.oid,
					table: row.table_name,
					columns: {}
				};
				me.pgObject [row.oid].columns [row.ordinal_position] = {
					oid: row.oid,
					table: row.table_name,
					column: row.column_name,
					pos: row.ordinal_position
				};
			});
*/
			await me.loadPgObjects ({});

			let rows = await me.query ({client: me.client, sql: "select max (fid) as max_id from trevision"});
			
			me.lastRevision = rows [0].max_id;
		}
		me.redisClient = redis.createClient (config.redis.port, config.redis.host);
		me.redisPub = redis.createClient (config.redis.port, config.redis.host);
		me.redisSub = redis.createClient (config.redis.port, config.redis.host);
		
		if (config.redis.db) {
			await me.redisSub.selectAsync (config.redis.db);
			await me.redisPub.selectAsync (config.redis.db);
			await me.redisClient.select (config.redis.db);
		}
		me.redisSub.on ("message", function (channel, message) {
			log.trace ({fn: "store.sub"}, `redisSub.message on channel: ${channel}`);
			
			if (channel == `${config.redis.db}-${me.code}-revisions`) {
				let r = JSON.parse (message);
				
				if (!me.revisions [r.id]) {
					me.revisions [r.id] = r;
					log.trace ({fn: "store.sub"}, `new revision: ${r.id}`);
					// todo: clear redis cache
				}
				_.each (["class", "classAttr", "view", "viewAttr"], rsc => {
					_.each (r [rsc].created, function ({fields, values}) {
						let data = Base.buildData ({rsc, fields, values});
						let o = factory ({rsc, store: me, data});
						
						if (rsc == "classAttr" && !me.map ["class"][o.get ("class")]) {
							return;
						}
						if (rsc == "viewAttr" && !me.map ["view"][o.get ("view")]) {
							return;
						}
						me.initRsc ({rsc, action: "create", o});
					});
					_.each (r [rsc].changed, function ({fields, values}) {
						let data = Base.buildData ({rsc, fields, values});
						let o = me.map [rsc][data.id];
						
						if (o) {
							_.each (data, (v, a) => o.set (a, v));
						}
					});
					_.each (r [rsc].removed, function (id) {
						let o = me.map [rsc][id];
						
						if (o) {
							me.initRsc ({rsc, action: "remove", o});
						}
					});
				});
				let auth = [...r ["auth"].created, ...r ["auth"].changed];
				
				for (let i = 0; i < auth.length; i ++) {
					let o = auth [i];
					
					if (o.userId) {
						me.auth.user [o.userId] = me.auth.user [o.userId] || {};
						me.auth.user [o.userId].id = o.userId;
						me.auth.user [o.userId].login = o.login || me.auth.user [o.userId].login;
						me.auth.user [o.userId].password = o.password || me.auth.user [o.userId].password;
						me.auth.user [o.userId].role = o.role || me.auth.user [o.userId].role;
						me.auth.user [o.userId].menu = o.menu || me.auth.user [o.userId].menu;
						
						if (o.login) {
							me.auth.user [o.login] = me.auth.user [o.userId];
						}
					}
					if (o.roleId) {
						_.each (me.auth.user, function (rec) {
							if (rec.role == o.roleId) {
								rec.menu = o.menu;
							}
						});
					}
				}
			};
		});
		me.redisSub.subscribe (`${config.redis.db}-${me.code}-revisions`);
	}
}

module.exports = {
	Store
};
