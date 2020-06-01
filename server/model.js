"use strict"

const _ = require ("lodash");
const common = require ("./common");

let { getFieldMap, getAttrMap, getMetaTable } = require ("./map");

class Base {
	constructor ({store, rsc, rec, row, data}) {
		let me = this;
		
		me.store = store;
		me.rsc = rsc;
		me.data = data || {};
		me.originalData = data ? _.clone (data) : {};
		me.removed = false;

		if (row) {
			let map = getFieldMap (rsc);

			_.each (map, function (a, f) {
				me.set (a, row [f]);
			});
		}
		if (rec) {
			let map = getAttrMap (rsc);
			
			_.each (map, function (f, a) {
				me.set (a, rec [a]);
			});
		}
	}
	
	get (a) {
		return this.data [a];
	}
	
	set (a, v) {
		let me = this;
		
		if (a == "id" && me.data.id) {
			return;
		}
		// todo: reserved words for objectAttr code
		if (v && typeof (v) == "string") {
			if (me.rsc == "object") {
				if (a == "_class") {
					v = me.store.getClass (v).get ("id");
				}
			} else {
				if (a == "class") {
					v = me.store.getClass (v).get ("id");
				}
				if (a == "view") {
					v = me.store.getView (v).get ("id");
				}
				if (a == "type") {
					v = me.store.getTypeId (v);
				}
				if (a == "parent") {
					if (me.rsc == "class") {
						v = me.store.getClass (v).get ("id");
					}
					if (me.rsc == "view") {
						v = me.store.getView (v).get ("id");
					}
				}
			}
		}
		me.data [a] = v;
	}
	
	remove () {
		this.removed = true;
	}
	
	toJSON () {
/*
		let me = this;
		let r;

		for (let attr in me.data) {
			if (!r) {
				r = "{";
			} else {
				r += ",";
			}
			r += '"' + attr + '":' + common.toJSONString (me.data [attr], utc);
		}
		r += "}";

		return r;
*/
		return this.data;
	}
	
	static buildData ({rsc, fields, values}) {
		let data = {};
		let map = getFieldMap (rsc);

		_.each (fields, function (f, i) {
			data [map [f]] = values [i];
		});

		return data;
	}
}

class Object extends Base {
	constructor (opts) {
		super (_.extend (opts, {rsc: "object"}));
		
		let me = this;
		
		if (me.get ("_class")) {
			let attrs = me.store.getClass (me.get ("_class")).attrs;
			
			_.each (opts.rec, function (v, a) {
				if (attrs [a]) {
					me.set (a, v);
				}
			});
		}
	}
	
	static buildData (opts) {
		return super.buildData (_.extend (opts, {rsc: "object"}));
	}
	
	async sync ({session}) {
		let me = this;
		let revisionId = me.store.revision [session.id];
		
		if (!revisionId) {
			throw new Error (`no transaction, session ${session.id}`);
		}
		let client = me.store.getClient ({session});
		let classObj = me.store.map ["class"][me.get ("_class")];
		
		if (!classObj) {
			throw new Error (`unknown model: ${me.get ("_class")}`);
		}
		if (me.get ("id")) {
			await me.store.redisClient.hdelAsync (`${me.store.code}-objects`, me.get ("id"));
		}
		if (me.removed) {
			await me.store.query ({session, sql: `delete from ${classObj.getTable ()} where fobject_id = ${me.get ("id")}`});
			
			if (!config.legacy && me.store.getClass ("objectum.user").get ("id") == me.get ("_class")) {
				delete me.store.auth.user [me.get ("login")];
				delete me.store.auth.user [me.get ("id")];
			}
			if (me.store.revisions [revisionId]["object"]) {
				me.store.revisions [revisionId]["object"].removed.push (me.get ("id"));
			}
			return;
//			return await me.store.query ({session, sql: `update tobject set fend_id = ${revisionId} where fid = ${me.get ("id")} and fend_id = 0`});
		}
		let newObject = false;
		let id = me.get ("id");
		
		if (!id) {
			newObject = true;
		}
		let attrs = [];

		_.each (me.data, function (v, a) {
			if (_.isDate (me.originalData [a])) {
				me.originalData [a] = me.originalData [a].toISOString ();
			}
			if (_.isDate (me.data [a])) {
				me.data [a] = me.data [a].toISOString ();
			}
			if (!me.originalData.hasOwnProperty (a) || me.originalData [a] != me.data [a]) {
				attrs.push (a);
			}
		});
		if (newObject) {
			id = await client.getNextId ({table: "tobject"});

			me.set ("id", id);
			me.set ("start", revisionId);
			me.set ("end", 0);
			
//			await me.store.query ({session, sql: `insert into ${classObj.getTable ()} (fobject_id) values (${id})`});
//			await me.store.query ({session, sql: `insert into tobject (fid, fclass_id, fstart_id, fend_id) values (${id}, ${me.get ("class")}, ${revisionId}, 0)`});
		}
		let data = {};
		//let login, password;
		
		for (let i = 0; i < attrs.length; i ++) {
			let attr = attrs [i];
			let ca = classObj.attrs [attr];
			
			if (!ca) {
				continue;
			}
			let value = me.get (attr);
			
/*
			if (me.store.auth.login [ca.get ("id")]) {
				login = value;
			}
			if (me.store.auth.password [ca.get ("id")]) {
				password = value;
			}
*/
			if (value === true || value === false) {
				value = Number (value);
			}
			if (ca.get ("type") == 3 && typeof (value) == "string" && (value || "").trim () == "") {
				value = null;
			}
			if (ca.get ("type") != 1 && ca.get ("type") != 3 && ca.get ("type") != 5 && (isNaN (value) || value === "")) {
				value = null;
			}
			data [ca.get ("class")] = data [ca.get ("class")] || {};
			data [ca.get ("class")][ca.getField ()] = value;
		}
		let parent = classObj.get ("id");
		
		while (parent) {
			data [parent] = data [parent] || {};
			parent = me.store.getClass (parent).get ("parent");
		}
		for (let classId in data) {
			let o = data [classId];
			let cls = me.store.getClass (classId);
			let sql;
			let params = [], n = 1;
			
			if (newObject) {
				let fields = ["fobject_id", "fclass_id"], values = [`$${n ++}`, `$${n ++}`];
				
				params.push (id);
				params.push (me.get ("_class"));
				
				_.each (o, (v, a) => {
					fields.push (a);
					values.push (`$${n ++}`);
					params.push (v);
				});
				sql = `
					insert into ${cls.getTable ()} (${fields.join (", ")})
					values (${values.join (", ")})
				`;
			} else {
				let values = [];
				
				_.each (o, (v, a) => {
					values.push (`${a} = $${n ++}`);
					params.push (v);
				});
				sql = `
					update ${cls.getTable ()} set
					${values.join (",\n")}
					where fobject_id = ${id}
				`;
			}
			if (params.length) {
				await me.store.query ({session, sql, params});
			}
		}
		if (me.store.auth.userClassId == classObj.get ("id")) {
			let menu = null, roleCode = null;
			
			if (me.get ("role")) {
				let o = await me.store.getObject ({session, id: me.get ("role")});
				
				menu = o.get ("menu");
				roleCode = o.get ("code");
			}
			me.store.revisions [revisionId]["auth"][newObject ? "created" : "changed"].push ({
				user: me.get ("id"), login: me.get ("login"), password: me.get ("password"), role: me.get ("role"), roleCode, menu
			});
		} else
		if (me.store.auth.roleClassId == classObj.get ("id")) {
			me.store.revisions [revisionId]["auth"][newObject ? "created" : "changed"].push ({
				role: me.get ("id"), roleCode: me.get ("code"), menu: me.get ("menu")
			});
		}
		if (me.store.revisions [revisionId]["object"]) {
			if (newObject) {
				me.store.revisions [revisionId]["object"].created.push (me.get ("id"));
			} else {
				me.store.revisions [revisionId]["object"].changed.push (me.get ("id"));
			}
		}
		let updatedObject = await me.store.getObject ({session, id: me.get ("id")});
		
		me.data = updatedObject.data;
		me.originalData = updatedObject.originalData;
/*
		if (!config.legacy && me.store.getClass ("objectum.user").get ("id") == me.get ("_class")) {
			let menuId = null;
			
			if (me.get ("role")) {
				let o = await me.store.getObject ({session, id: me.get ("role")});
				
				menuId = o.get ("menu");
			}
			let o = {
				login: me.get ("login"),
				password: me.get ("password"),
				id: me.get ("id"),
				role: me.get ("role"),
				menu: menuId
			};
			me.store.auth.user [me.get ("login")] = o;
			me.store.auth.user [me.get ("id")] = o;
		}
*/
	}
	
	async commit () {
		await this.sync.call (this, arguments);
	}
}

class Meta extends Base {
	constructor (opts) {
		super (opts);
		
		let me = this;
		
		if (["class", "classAttr", "view", "viewAttr"].indexOf (me.rsc) > -1 && !me.get ("code")) {
			throw new Error ("code not exists");
		}
	}
	
	async sync ({session}) {
		let me = this;
		let revisionId = me.store.revision [session.id];

		if (!revisionId) {
			throw new Error (`no transaction, session ${session.id}`);
		}
		let map = getAttrMap (me.rsc);
		let attrs = [];
		let newObject = false;
		
		if (!me.get ("id")) {
			newObject = true;
		}
		_.each (me.data, function (v, a) {
			if (["id"].indexOf (a) > -1 || !map [a]) {
				return;
			}
			if (_.isDate (me.originalData [a])) {
				me.originalData [a] = me.originalData [a].toISOString ();
			}
			if (_.isDate (me.data [a])) {
				me.data [a] = me.data [a].toISOString ();
			}
			if (!me.originalData.hasOwnProperty (a) || me.originalData [a] != me.data [a]) {
				attrs.push (a);
			}
		});
		if (!attrs.length && !newObject && !me.removed) {
			return;
		}
		let client = me.store.getClient ({session});

		if (newObject && !me.removed) {
			let id = await client.getNextId ({table: getMetaTable (me.rsc)});
			me.set ("id", id);
		}
		if (!me.removed) {
			let fields = _.values (map);
			let values = [];
			
			for (let i = 0; i < fields.length; i++) {
				values.push (`$${i + 1}`);
			}
			me.data.start = me.originalData.start = revisionId;
			me.data.end = me.originalData.end = 0;
			
			let params = [];
			
			_.each (map, function (field, attr) {
				let value = me.get (attr);
				
				if (value === true || value === false) {
					value = Number (value);
				}
				params.push (value);
			});
			await me.store.query ({session, sql: `
				insert into ${getMetaTable (me.rsc)} (${fields.join (",")})
				values (${values.join (",")})
			`, params});
			
			let o = {fields, values: params};
			
			if (me.store.revisions [revisionId][me.rsc]) {
				if (newObject) {
					me.store.revisions [revisionId][me.rsc].created.push (o);
				} else {
					me.store.revisions [revisionId][me.rsc].changed.push (o);
				}
			}
			if (newObject) {
				me.store.initRsc ({rsc: me.rsc, action: "create", o: me});
			} else {
				await me.store.query ({session, sql: `update ${getMetaTable (me.rsc)} set fend_id = ${revisionId} where fend_id = 0 and fid = ${me.get ("id")} and fstart_id < ${revisionId}`});
			}
		} else {
			if (me.store.revisions [revisionId][me.rsc]) {
				me.store.revisions [revisionId][me.rsc].removed.push (me.get ("id"));
			}
			await me.store.query ({session, sql: `update ${getMetaTable (me.rsc)} set fend_id = ${revisionId} where fend_id = 0 and fid = ${me.get ("id")}`});
			me.store.initRsc ({rsc: me.rsc, action: "remove", o: me});
		}
	}
	
	commit () {
		this.sync.call (this, arguments);
	}
	
	getOpts () {
		return JSON.parse (this.get ("opts") || "{}");
	}
}

class Class extends Meta {
	constructor (opts) {
		super (_.extend (opts, {rsc: "class"}));
		
		let me = this;
		
		me.toc = `${me.get ("code").toLowerCase ()}_${me.get ("id")}`;
		me.childs = [];
		me.attrs = {};
	}
	
	static buildData (opts) {
		return super.buildData (_.extend (opts, {rsc: "class"}));
	}
	
	getPath () {
		let me = this;
		let map = me.store.map ["class"];
		let codes = [];

		let getParentCode = function (o) {
			codes.unshift (o.get ("code"));

			if (o.get ("parent")) {
				if (map [o.get ("parent")]) {
					getParentCode (map [o.get ("parent")]);
				} else {
					codes = [];
				}
			}
		};
		getParentCode (me);

		return codes.join (".");
	}
	
	getTable () {
		return `${this.get ("code").toLowerCase ()}_${this.get ("id")}`;
	}
	
	async sync ({session}) {
		let me = this;
		
		await super.sync ({session});
		me.toc = `${me.get ("code").toLowerCase ()}_${me.get ("id")}`;
	}
}

class ClassAttr extends Meta {
	constructor (opts) {
		super (_.extend (opts, {rsc: "classAttr"}));

		let me = this;
		
		me.toc = `${me.get ("code").toLowerCase ()}_${me.get ("id")}`;
	}
	
	static buildData (opts) {
		return super.buildData (_.extend (opts, {rsc: "classAttr"}));
	}
	
	getPath () {
		let me = this;
		
		return `${me.store.getClass (me.get ("class")).getPath ()}.${me.get ("code")}`;
	}
	
	getField () {
		return `${this.get ("code").toLowerCase ()}_${this.get ("id")}`;
	}
	
	getLogField () {
		let f = "fnumber";
		
		switch (this.get ("type")) {
			case 1:
			case 5:
				f = "fstring";
				break;
			case 3:
				f = "ftime";
				break;
		}
		return f;
	}
	
	async sync ({session}) {
		let me = this;
		
		await super.sync ({session});
		me.toc = `${me.get ("code").toLowerCase ()}_${me.get ("id")}`;
	}
}

class View extends Meta {
	constructor (opts) {
		super (_.extend (opts, {rsc: "view"}));
		
		let me = this;
		
		me.childs = [];
		me.attrs = {};
	}
	
	static buildData (opts) {
		return super.buildData (_.extend (opts, {rsc: "view"}));
	}
	
	getPath () {
		let me = this;

		let map = me.store.map ["view"];

		let codes = [];
		let getParentCode = function (o) {
			codes.unshift (o.get ("code"));

			if (o.get ("parent")) {
				getParentCode (map [o.get ("parent")]);
			}
		};
		getParentCode (me);

		return codes.join (".");
	}
	
	async sync ({session}) {
		let me = this;
		
		await super.sync ({session});
	}
}

class ViewAttr extends Meta {
	constructor (opts) {
		super (_.extend (opts, {rsc: "viewAttr"}));
	}
	
	static buildData (opts) {
		return super.buildData (_.extend (opts, {rsc: "viewAttr"}));
	}
	
	getPath () {
		let me = this;
		
		return `${me.store.getView (me.get ("view")).getPath ()}.${me.get ("code")}`;
	}
	
	async sync ({session}) {
		let me = this;
		
		await super.sync ({session});
	}
}

class Action extends Meta {
	constructor (opts) {
		super (_.extend (opts, {rsc: "action"}));
	}
	
	static buildData (opts) {
		return super.buildData (_.extend (opts, {rsc: "action"}));
	}
}

function factory (opts) {
	let o;
	let rsc = opts.rsc;
	
	switch (rsc) {
		case "object":
			o = new Object (opts);
			break;
		case "class":
			o = new Class (opts);
			break;
		case "classAttr":
			o = new ClassAttr (opts);
			break;
		case "view":
			o = new View (opts);
			break;
		case "viewAttr":
			o = new ViewAttr (opts);
			break;
		case "action":
			o = new Action (opts);
			break;
		default:
			throw new Error (`factory: unknown resource: ${rsc}`);
	}
	return o;
};

module.exports = {
	Base,
	Object,
	Class,
	ClassAttr,
	View,
	ViewAttr,
	Action,
	factory
};
