"use strict";

const _ = require ("lodash");
const { isMetaTable } = require ("./map");

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

async function getViewAttrs (recs, view, caMap, store, fields) {
	let cols = _.map (_.keys (recs [0]), (a) => {
		let va = view.attrs [a];
		let name = a;
		let order = 0;
		let classId = null, classAttrId = null, typeId = 1;
		let field = fields [a];
		
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
			classAttrId = field.column == "fobject_id" ? null : Number (field.column.split ("_")[1]);
			
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
			code: a,
			order,
			model: classId,
			property: classAttrId,
			type: typeId
		};
	});
	cols = _.sortBy (cols, ["order", "name"]);
	
	return cols;
};

async function getData (req, store) {
	let session = req.session;
	let view = store.getView (req.args.query);
	let query = view.get ("query");
	let tokens = [], json = "", str = "", classMap = {}, caMap = {};
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
						type: 2
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
				}
				tokens [i] = f;
			}
		}
	}
	let fields = {};
	let data = {
		recs: await store.query ({session, sql: getQuery ("data", tokens, req.args), fields})
	};
	data.cols = await getViewAttrs (data.recs, view, caMap, store, fields);
	
	if (_.has (req.args, "offset") && _.has (req.args, "limit")) {
		if (hasSelectCount) {
			let recs = await store.query ({session, sql: getQuery ("count", tokens, req.args)});
			
			data.length = recs [0].num;
		}
		if (hasTree) {
			if (data.recs.length) {
				data.childs = await store.query ({session, sql: getQuery ("tree", tokens, req.args, _.map (data.recs, "id"))});
			} else {
				data.childs = [];
			}
		}
	}
	return data;
};

module.exports = {
	getDict,
	getData
};
