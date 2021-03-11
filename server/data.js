"use strict";

const _ = require ("lodash");
const {isMetaTable} = require ("./map");
const {View, ViewAttr} = require ("./model");

async function getDict (req, store) {
	let session = req.session;
	let cls = store.getClass (req.args ["model"]);
	let ca = cls.attrs ["name"];
	
	if (!ca) {
		throw new Error (`"name" not exists in ${cls.getPath ()}`);
	}
	let cls2 = store.getClass (ca.get ("class"));
	let caGroup;
	let caCode = cls.attrs ["code"];
	let caOrder = cls.attrs ["order"];
	
	for (let code in cls.attrs) {
		if (cls.attrs [code].get ("type") >= 1000) {
			caGroup = cls.attrs [code];
			break;
		}
	}
	let sql = `
		select
			a.fobject_id as id,
			${ca.getField ()} as name
			${caCode ? `, ${caCode.getField ()} as ${caCode.get ("code")}` : ""}
			${caGroup ? `, ${caGroup.getField ()} as ${caGroup.get ("code")}` : ""}
		from
			${cls.getTable ()} a
			${cls2.get ("id") != cls.get ("id") ? `inner join ${cls2.getTable ()} b on (a.fobject_id = b.fobject_id)` : ""}
		order by
			${caOrder ? `a.${caOrder.getField ()}, ` : ""} name
	`;
	return await store.query ({session, sql});
};

async function getLog (req, store) {
	let session = req.session;
	let userModel = store.getClass ("objectum.user");
	let ca = store.getClassAttr (req.args ["property"]);
	let sql = `
		select
			a.fid as id,
			a.${ca.getLogField ()} as value,
			b.fdate as date,
			b.fdescription as description,
			b.fremote_addr as remote_addr,
			b.fsubject_id as user_id,
			c.${userModel.attrs ["login"].getField ()} as login
		from
			tobject_attr a
			inner join trevision b on (a.fstart_id = b.fid)
			left join ${userModel.getTable ()} c on (b.fsubject_id = c.fobject_id)
		where
			a.fobject_id = ${req.args ["record"]} and
			a.fclass_attr_id = ${ca.get ("id")}
		order by
			b.fdate
	`;
	return await store.query ({session, sql});
};

function addToWhere (tokens, f) {
	let r = [], whereSection = false, where = [];
	
	for (let i = 0; i < tokens.length; i ++) {
		let o = tokens [i];
		
		if (o && typeof (o) == "object" && o ["where"]) {
			if (o ["where"] == "begin") {
				r.push (o);
				whereSection = true;
			}
			if (o ["where"] == "end") {
				if (where.length) {
					r = [...r, "(", ...where, ") and (", ...f, ")", o];
				} else {
					r = [...r, ...f, o];
				}
				whereSection = false;
			}
			if (o ["where"] == "empty") {
				r = [...r, {"where": "begin"}, ...f, {"where": "end"}];
			}
		} else {
			if (whereSection) {
				where.push (o);
			} else {
				r.push (o);
			}
		}
	}
	return r;
};

function addFilters (tokens, filters, caMap, aliasPrefix) {
	let f = _.map (filters, f => {
		if (!caMap [f [0]]) {
			throw new Error (`unknown column: ${f [0]}`);
		}
		let s = `${aliasPrefix [f [0]]}.${caMap [f [0]].isId ? "fobject_id" : caMap [f [0]].getField ()} ${f [1]}`;
		
		if (f.length == 2) {
			f.push ("");
		}
		if (f [1] == "like" || f [1] == "not like") {
			s = `lower (${aliasPrefix [f [0]]}.${caMap [f [0]].getField ()}) ${f [1]} '${f [2].toLowerCase ()}%'`;
		} else
		if (f [2] !== "") {
			if (f [1] == "in" || f [1] == "not in") {
				s += `(${(f [2].length ? f [2] : ['0']).join (",")})`;
			} else {
				s += ` '${f [2]}'`;
			}
		}
		return s;
	});
	f = "\n" + f.join (" and ") + "\n";
	
	return addToWhere (tokens, f);
};

function addAccessFilters (tokens, filters) {
	let f = [];
	
	for (let i = 0; i < filters.length; i ++) {
		if (i) {
			f.push (" and ");
		}
		let filterTokens = `(${filters [i]})`.split ("{");
		
		f.push (filterTokens [0]);
		
		for (let j = 1; j < filterTokens.length; j ++) {
			let strTokens = filterTokens [j].split ("}");
			let json = JSON.parse (`{${strTokens [0]}}`);
			
			f.push (json);
			f.push (strTokens [1]);
		}
	}
	return addToWhere (tokens, f);
};

function removeWhere (tokens) {
	let r = [], whereSection = false;
	
	for (let i = 0; i < tokens.length; i ++) {
		let o = tokens [i];
		
		if (o && typeof (o) == "object" && o ["where"]) {
			if (o ["where"] == "begin") {
				whereSection = true;
			}
			if (o ["where"] == "end") {
				whereSection = false;
			}
		} else {
			if (!whereSection) {
				r.push (o);
			}
		}
	}
	return r;
};

function addOrder (tokens, order, caMap, aliasPrefix) {
	let orderStr = `\n${aliasPrefix [order [0]]}.${caMap [order [0]].isId ? "fobject_id" : caMap [order [0]].getField ()} ${order [1]}\n`;
	let r = [], orderSection = false;
	
	for (let i = 0; i < tokens.length; i ++) {
		let o = tokens [i];
		
		if (o && typeof (o) == "object" && o ["order"]) {
			if (o ["order"] == "begin") {
				r.push (o);
				orderSection = true;
			} else
			if (o ["order"] == "end") {
				r = [...r, orderStr, o];
				orderSection = false;
			} else
			if (o ["order"] == "empty") {
				r = [...r, {"order": "begin"}, orderStr, {"order": "end"}];
			}
		} else {
			if (!orderSection) {
				r.push (o);
			}
		}
	}
	return r;
};

function getQuery ({code, tokens, args, parents}) {
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
					if (args.getColumns) {
						if (o ["param"] == "offset") {
							o = 0;
						} else
						if (o ["param"] == "limit") {
							o = 1;
						} else {
							o = '010101';
						}
					} else
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
	let selectAliasesMap = {};
	
	selectAliases.forEach (a => selectAliasesMap [a.toLowerCase ()] = a);
	
	let cols = _.map (fields, (field, i) => {
		let name = field.alias;
		let va = view.attrs [selectAliasesMap [name] || name];
		let order = 0;
		let classId = null, classAttrId = null, typeId = 1, area = 1;
		
		if (isMetaTable (field.table)) {
			if (["funlogged", "fnot_null", "fsecure", "funique", "fsystem"].indexOf (field.column) > -1) {
				typeId = 4;
			} else
			if (field.column == "ftype_id") {
				typeId = 6;
			}
		} else {
			if (field.table) {
				classId = Number (field.table.split ("_")[1]);
				classId = store.getClass (classId).getPath ();
			}
			if (field.column == "fobject_id") {
				classAttrId = null;
				typeId = 2;
			} else {
				if (field.column) {
					classAttrId = Number (field.column.split ("_")[1]);
				}
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
			area = Number (va.get ("area"));
		}
		return {
			name,
			code: selectAliasesMap [field.alias] || field.alias,
			order,
			area,
			model: classId,
			property: classAttrId,
			type: typeId
		};
	});
	return cols;
};

function getModelView (model, store, args) {
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
	
	let where = `{"where": "empty"}`;
	
	if (args.hasOwnProperty ("parent")) {
		where = `
		{"where": "begin"}
			{"prop": "a.parent"} {"tree": "filter"}
		{"where": "end"}
		`;
	}
	if (m.getPath ().substr (0, 2) == "t.") {
		let tokens = m.getPath ().split (".");
		let parentCode = tokens [tokens.length - 2];
		
		if (args [parentCode]) {
			where = `
		{"where": "begin"}
			{"prop": "a.${parentCode}"} = ${args [parentCode]}
			${args.hasOwnProperty ("parent") ? `and {"prop": "a.parent"} {"tree": "filter"}` : ""}
		{"where": "end"}
			`;
		}
	}
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
		
		${args.hasOwnProperty ("parent") ? `
		{"tree": "begin"}
		select
			{"prop": "a.parent", "as": "parent"}, count (*) as num
		{"tree": "end"}
		` : ""}
		
		from
			{"model": "${model}", "alias": "a"}
		
		${where}
		
		{"order": "begin"}
			${order.join (", ")}
		{"order": "end"}
		
		${args.hasOwnProperty ("parent") ? `
		{"tree": "begin"}
		group by
			{"prop": "a.parent"}
		{"tree": "end"}
		` : ""}
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
		let area = 1;
		let opts = a.getOpts ();
		
		if (opts.column && opts.column.hasOwnProperty ("area")) {
			area = opts.column.area;
		}
		o.attrs [a.get ("code")] = new ViewAttr ({
			rec: {
				"name": a.get ("name"),
				"code": a.get ("code"),
				"order": i ++,
				"area": area
			}
		})
	});
	return o;
};
/*
	todo: $1, $2 parameters, prepare query
 */
async function getData (req, store) {
	let session = req.session;
	let view;
	
	if (req.args._trace) {
		req.args._trace.push (["getData-start", new Date ().getTime ()]);
	}
	if (req.args.query) {
		view = store.getView (req.args.query);
	} else
	if (req.args.model) {
		view = getModelView (req.args.model, store, req.args);
	} else {
		throw new Error ("query or model not exist");
	}
	if (!req.args.hasOwnProperty ("offset")) {
		req.args.offset = 0;
	}
	if (!req.args.hasOwnProperty ("limit")) {
		req.args.limit = config.query.maxCount;
	}
	let query = view.get ("query");
	let tokens = [], json = "", str = "", classMap = {}, caMap = {}, selectAliases = [], aliasPrefix = {};
	let hasSelectCount = false, hasTree = false;
	
/*
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
*/
	let queryTokens = query.split ("{");
	
	tokens.push (queryTokens [0]);
	
	for (let i = 1; i < queryTokens.length; i ++) {
		let strTokens = queryTokens [i].split ("}");
		
		json = JSON.parse (`{${strTokens [0]}}`);

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
		tokens.push (strTokens [1]);
	}
	if (req.args.accessFilters && req.args.accessFilters.length) {
		tokens = addAccessFilters (tokens, req.args.accessFilters);
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
					if (!classMap [t [0] || ""]) {
						throw new Error (`unknown model: ${JSON.stringify (o)}`);
					}
					ca = classMap [t [0] || ""].attrs [t [1]];
					
					if (!ca) {
						throw new Error (`unknown property: ${t [1]}, model: ${classMap [t [0] || ""].getPath ()}`);
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
	if (req.args.getColumns) {
		tokens = removeWhere (tokens);
	}
	if (req.args.order && _.isArray (req.args.order)) {
		tokens = addOrder (tokens, req.args.order, caMap, aliasPrefix);
	}
	let fields = [];
	let data = {
		recs: await store.query ({session, sql: getQuery ({code: "data", tokens, args: req.args}), fields, rowMode: "array", _trace: req.args._trace}),
		position: []
	};
	data.cols = await getViewAttrs (data.recs, view, caMap, store, fields, selectAliases);
	
	if (_.has (req.args, "offset") && _.has (req.args, "limit") && !req.args.getColumns) {
		if (hasSelectCount) {
			if (req.args.limit != config.query.maxCount) {
				let recs = await store.query ({session, sql: getQuery ({code: "count", tokens, args: req.args}), _trace: req.args._trace});
				
				data.length = recs [0].num;
			} else {
				data.length = data.recs.length;
			}
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
				data.childs = await store.query ({session, sql: getQuery ({code: "tree", tokens, args: req.args, parents})});
			} else {
				data.childs = [];
			}
			// position
			let pos = {};
			
			_.each (fields, f => {
				if (f.alias == "id") {
					pos.table = f.table;
					pos.id = f.column;
				}
				if (f.alias == "parent") {
					pos.parent = f.column;
				}
				if (f.alias == "name") {
					pos.name = f.column;
				}
			});
			if (req.args.parent) {
				let recs = await store.query ({
					session, sql: `
						with recursive getParent as (
							select ${pos.id}, ${pos.parent}, ${pos.name} from ${pos.table}
							where ${pos.id} = ${req.args.parent}
						
							union all
						
							select a.${pos.id}, a.${pos.parent}, a.${pos.name} from ${pos.table} a
							join getParent on getParent.${pos.parent} = a.${pos.id}
						)
						select ${pos.id} as id, ${pos.parent} as parent, ${pos.name} as name from getParent
						order by ${pos.id}
					`
				});
				data.position = recs;
			}
		}
	}
	if (req.args._trace) {
		req.args._trace.push (["getData-end", new Date ().getTime ()]);
		data._trace = req.args._trace;
	}
	return data;
};

module.exports = {
	getDict,
	getLog,
	getData
};
