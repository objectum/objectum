"use strict";

const _ = require ("lodash");
const { isMetaTable } = require ("./map");
const { View, ViewAttr } = require ("./model");

async function getDict (req, store) {
	let session = req.session;
	let cls = store.getClass (req.args ["model"]);
	let ca = cls.attrs ["name"];
	
	if (!ca) {
		throw new Error (`"name" not exists in ${cls.getPath ()}`);
	}
	let cls2 = store.getClass (ca.get ("class"));
	let sql = `
		select
			a.fobject_id as id,
			${ca.getField ()} as name
		from
			${cls.getTable ()} a
			${cls2.get ("id") != cls.get ("id") ? `inner join ${cls2.getTable ()} b on (a.fobject_id = b.fobject_id)` : ""}
		order by
			name
	`;
	return await store.query ({session, sql});
};

function addFilters (tokens, filters, caMap, aliasPrefix) {
	let f = "\n" + _.map (filters, f => {
		let s = `${aliasPrefix [f [0]]}.${caMap [f [0]].isId ? "fobject_id" : caMap [f [0]].getField ()} ${f [1]}`;
		
		if (f [1] == "like" || f [1] == "not like") {
			f [2] += "%";
		}
		if (f [2] !== "") {
			s += ` '${f [2]}'`;
		}
		return s;
	}).join (" and ") + "\n";
	let r = [], whereBeginWas = false, where = [];
	
	for (let i = 0; i < tokens.length; i ++) {
		let o = tokens [i];
		
		if (o && typeof (o) == "object" && o ["where"]) {
			if (o ["where"] == "begin") {
				r.push (o);
				whereBeginWas = true;
			}
			if (o ["where"] == "end") {
				if (where.length) {
					r = [...r, "(", ...where, ") and (", ...f, ")", o];
				} else {
					r = [...r, ...f, o];
				}
			}
			if (o ["where"] == "empty") {
				r = [...r, {"where": "begin"}, ...f, {"where": "end"}];
			}
		} else {
			if (whereBeginWas) {
				where.push (o);
			} else {
				r.push (o);
			}
		}
	}
	return r;
};

function addOrder (tokens, order, caMap, aliasPrefix) {
	let orderStr = `\n${aliasPrefix [order [0]]}.${caMap [order [0]].isId ? "fobject_id" : caMap [order [0]].getField ()} ${order [1]}\n`;
	let r = [], beginWas = false;
	
	for (let i = 0; i < tokens.length; i ++) {
		let o = tokens [i];
		
		if (o && typeof (o) == "object" && o ["order"]) {
			if (o ["order"] == "begin") {
				r.push (o);
				beginWas = true;
			}
			if (o ["order"] == "end") {
				r = [...r, orderStr];
			}
			if (o ["order"] == "empty") {
				r = [...r, {"order": "begin"}, orderStr, {"order": "end"}];
			}
		} else {
			if (!beginWas) {
				r.push (o);
			}
		}
	}
	return r;
};

function getQuery (code, tokens, args, parents) {
	let sql = "", skip = false;
	
	for (let i = 0; i < tokens.length; i ++) {
		let o = tokens [i];
		
		if (o && typeof (o) == "object") {
			if (o ["where"] == "begin") {
				o = "where";
			} else
			if (o ["where"] == "end") {
				o = "";
			} else
			if (o ["where"] == "empty") {
				o = "";
			} else
			if (o ["order"] == "begin") {
				if (code == "data") {
					o = "order by";
				} else {
					skip = true;
					continue;
				}
			} else
			if (o ["order"] == "end") {
				if (code == "data") {
					o = "";
				} else {
					skip = false;
					continue;
				}
			} else
			if (o ["order"] == "empty") {
				o = "";
			} else
			if (o [code] == "begin") {
				o = "";
			} else
			if (o [code] == "end") {
				o = "";
			} else {
				let section = o ["data"] || o ["count"] || o ["tree"];
				
				if (section == "begin") {
					skip = true;
					continue;
				}
				if (section == "end") {
					skip = false;
					continue;
				}
				if (skip) {
					continue;
				}
			}
			if (o) {
				if (o ["param"]) {
					if (code == "count" || code == "tree") {
						if (o ["param"] == "offset") {
							o = 0;
						} else
						if (o ["param"] == "limit") {
							o = config.query.maxCount;
						} else {
							o = args [o.param];
						}
					} else {
						o = args [o.param];
					}
				} else
				if (o ["tree"] == "filter") {
					if (code == "tree") {
						o = " in (" + parents.join (",") + ")";
					} else {
						if (args ["parent"]) {
							o = " = " + args ["parent"];
						} else {
							o = " is null";
						}
					}
				}
			}
			sql += o;
		} else {
			if (!skip) {
				sql += o;
			}
		}
	}
	return sql;
};

async function getViewAttrs (recs, view, caMap, store, fields, selectAliases) {
	let cols = _.map (fields, (field, i) => {
		let name = field.alias;
		let va = view.attrs [name];
		let order = 0;
		let classId = null, classAttrId = null, typeId = 1;
		
		if (isMetaTable (field.table)) {
			if (["funlogged", "fnot_null", "fsecure", "funique", "fsystem"].indexOf (field.column) > -1) {
				typeId = 4;
			} else
			if (field.column == "ftype_id") {
				typeId = 6;
			}
		} else {
			classId = Number (field.table.split ("_")[1]);
			classId = store.getClass (classId).getPath ();
			
			if (field.column == "fobject_id") {
				classAttrId = null;
				typeId = 2;
			} else {
				classAttrId = Number (field.column.split ("_")[1]);
			}
			if (classAttrId) {
				let ca = store.getClassAttr (classAttrId);
				
				name = ca.get ("name");
				order = ca.get ("order");
				typeId = ca.get ("type");
			}
		}
		if (va) {
			name = va.get ("name");
			order = va.get ("order");
		}
		return {
			name,
			code: selectAliases [i] || field.alias,
			order,
			model: classId,
			property: classAttrId,
			type: typeId
		};
	});
	return cols;
};

function getModelView (model, store) {
	let m = store.getClass (model);
	let attrs = _.sortBy (_.values (m.attrs), ["order", "name"]);
	
	if (!attrs.length) {
		throw new Error ("model has no properties");
	}
	let order = [];
	
	if (attrs ["order"]) {
		order.push (`{"prop": "a.order"}`);
	}
	if (attrs ["name"]) {
		order.push (`{"prop": "a.name"}`);
	}
	order.push (`{"prop": "a.id"}`);
	
	let query = `
		{"data": "begin"}
		select
			{"prop": "a.id", "as": "id"},
			${_.map (attrs, a => {
				return `{"prop": "a.${a.get ("code")}", "as": "${a.get ("code")}"}`;
			}).join ("\n,")}
		{"data": "end"}
		
		{"count": "begin"}
		select
			count (*) as num
		{"count": "end"}
		
		from
			{"model": "${model}", "alias": "a"}
		
		{"where": "empty"}
		
		{"order": "begin"}
			${order.join (", ")}
		{"order": "end"}
		
		limit {"param": "limit"}
		offset {"param": "offset"}
	`;
	let o = new View ({
		rec: {
			code: "model-view",
			query
		}
	});
	o.attrs = {
		"id": new ViewAttr ({
			rec: {
				"name": "id",
				"code": "id",
				"order": 0
			}
		})
	};
	let i = 1;
	
	_.each (attrs, a => {
		if (a.get ("order")) {
			i = a.get ("order");
		}
		o.attrs [a.get ("code")] = new ViewAttr ({
			rec: {
				"name": a.get ("name"),
				"code": a.get ("code"),
				"order": i ++
			}
		})
	});
	return o;
};

async function getData (req, store) {
	let session = req.session;
	let view;
	
	if (req.args.query) {
		view = store.getView (req.args.query);
	} else
	if (req.args.model) {
		view = getModelView (req.args.model, store);
	} else {
		throw new Error ("query or model not exist");
	}
	let query = view.get ("query");
	let tokens = [], json = "", str = "", classMap = {}, caMap = {}, selectAliases = [], aliasPrefix = {};
	let hasSelectCount = false, hasTree = false;
	
	for (let i = 0; i < query.length; i ++) {
		let c = query [i];
		
		if (c == "{") {
			tokens.push (str);
			str = "";
			json += c;
		} else
		if (c == "}") {
			json += c;
			json = JSON.parse (json);
			
			if (json ["param"]) {
				tokens.push (json);
			} else
			if (json ["class"] || json ["model"]) {
				let cls = store.getClass (json ["class"] || json ["model"]);
				
				tokens.push (cls.getTable () + " " + json ["alias"]);
				classMap [json ["alias"]] = cls
			} else {
				if (json ["count"] == "begin") {
					hasSelectCount = true;
				}
				if (json ["tree"] == "filter") {
					hasTree = true;
				}
				tokens.push (json);
			}
			json = "";
		} else
		if (json == "") {
			str += c;
		} else {
			json += c;
		}
	}
	if (str) {
		tokens.push (str);
	}
	for (let i = 0; i < tokens.length; i ++) {
		let o = tokens [i];
		
		if (o && typeof (o) == "object") {
			if (o ["attr"] || o ["prop"]) {
				let t = (o ["attr"] || o ["prop"]).split (".");
				let f, ca;
				
				if (t [1] == "id") {
					f = t [0] + ".fobject_id";
					ca = {
						name: "id",
						code: "id",
						classId: classMap [t [0] || ""].get ("id"),
						classAttrId: null,
						type: 2,
						isId: true
					};
				} else {
					ca = classMap [t [0] || ""].attrs [t [1]];
					
					if (!ca) {
						throw new Error (`unknown attr: ${t [1]}, class: ${classMap [t [0] || ""].getPath ()}`);
					}
					f = t [0] + "." + ca.getField ();
				}
				if (o ["alias"] || o ["as"]) {
					f += " as " + (o ["alias"] || o ["as"]);
					caMap [o ["alias"] || o ["as"]] = ca;
					selectAliases.push (o ["alias"] || o ["as"]);
					aliasPrefix [o ["alias"] || o ["as"]] = t [0];
				}
				tokens [i] = f;
			}
		}
	}
	if (req.args.filters && req.args.filters.length) {
		tokens = addFilters (tokens, req.args.filters, caMap, aliasPrefix);
	}
	if (req.args.order) {
		tokens = addOrder (tokens, req.args.order, caMap, aliasPrefix);
	}
	let fields = [];
	let data = {
		recs: await store.query ({session, sql: getQuery ("data", tokens, req.args), fields, rowMode: "array"})
	};
	data.cols = await getViewAttrs (data.recs, view, caMap, store, fields, selectAliases);
	
	if (_.has (req.args, "offset") && _.has (req.args, "limit")) {
		if (hasSelectCount) {
			let recs = await store.query ({session, sql: getQuery ("count", tokens, req.args)});
			
			data.length = recs [0].num;
		}
		if (hasTree) {
			if (data.recs.length) {
				let parents = [];
				
				for (let i = 0; i < fields.length; i ++) {
					if (fields [i].alias == "id") {
						parents = _.map (data.recs, (rec) => {
							return rec [i];
						});
						break;
					}
				}
				data.childs = await store.query ({session, sql: getQuery ("tree", tokens, req.args, parents)});
			} else {
				data.childs = [];
			}
		}
	}
	return data;
};

async function getRecords (req, store) {
};

module.exports = {
	getDict,
	getData,
	getRecords
};
