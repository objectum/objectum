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

function selectQueryOld  (req, tokens) {
	let sql = "", skip = false;
	
	for (let i = 0; i < tokens.length; i ++) {
		let o = tokens [i];
		
		if (o && typeof (o) == "object") {
			if (o ["select"] == "countBegin" || o ["select"] == "treeBegin" || o ["groupBy"] == "treeBegin") {
				skip = true;
				continue;
			}
			if (o ["select"] == "countEnd" || o ["select"] == "treeEnd" || o ["groupBy"] == "treeEnd") {
				skip = false;
				continue;
			}
			if (skip) {
				continue;
			}
			if (o ["select"] == "dataBegin") {
				o = "select";
			} else
			if (o ["select"] == "dataEnd") {
				o = "";
			} else
			if (o ["param"]) {
				o = req.args [o.param];
			} else
			if (o ["tree"] == "filter") {
				if (req.args ["parent"]) {
					o = " = " + req.args ["parent"];
				} else {
					o = " is null";
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

function selectQuery (req, tokens) {
	let sql = "", skip = false;
	
	for (let i = 0; i < tokens.length; i ++) {
		let o = tokens [i];
		
		if (o && typeof (o) == "object") {
			if (o ["count"] == "begin" || o ["tree"] == "begin") {
				skip = true;
				continue;
			}
			if (o ["count"] == "end" || o ["tree"] == "end") {
				skip = false;
				continue;
			}
			if (skip) {
				continue;
			}
			if (o ["data"] == "begin") {
				o = "";
			} else
			if (o ["data"] == "end") {
				o = "";
			} else
			if (o ["param"]) {
				o = req.args [o.param];
			} else
			if (o ["tree"] == "filter") {
				if (req.args ["parent"]) {
					o = " = " + req.args ["parent"];
				} else {
					o = " is null";
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

function countQueryOld (req, tokens) {
	let sql = "", skip = false;
	
	for (let i = 0; i < tokens.length; i ++) {
		let o = tokens [i];
		
		if (o && typeof (o) == "object") {
			if (o ["select"] == "dataBegin" || o ["select"] == "treeBegin" || o ["groupBy"] == "treeBegin") {
				skip = true;
				continue;
			}
			if (o ["select"] == "dataEnd" || o ["select"] == "treeEnd" || o ["groupBy"] == "treeEnd") {
				skip = false;
				continue;
			}
			if (skip) {
				continue;
			}
			if (o ["select"] == "countBegin") {
				o = "select";
			}
			if (o ["select"] == "countEnd") {
				o = "";
			}
			if (o ["param"]) {
				if (o ["param"] == "offset") {
					o = 0;
				} else
				if (o ["param"] == "limit") {
					o = config.query.maxCount;
				} else {
					o = req.args [o.param];
				}
			}
			if (o ["tree"] == "filter") {
				if (req.args ["parent"]) {
					o = " = " + req.args ["parent"];
				} else {
					o = " is null";
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

function countQuery (req, tokens) {
	let sql = "", skip = false;
	
	for (let i = 0; i < tokens.length; i ++) {
		let o = tokens [i];
		
		if (o && typeof (o) == "object") {
			if (o ["data"] == "begin" || o ["tree"] == "begin") {
				skip = true;
				continue;
			}
			if (o ["data"] == "end" || o ["tree"] == "end") {
				skip = false;
				continue;
			}
			if (skip) {
				continue;
			}
			if (o ["count"] == "begin") {
				o = "";
			}
			if (o ["count"] == "end") {
				o = "";
			}
			if (o ["param"]) {
				if (o ["param"] == "offset") {
					o = 0;
				} else
				if (o ["param"] == "limit") {
					o = config.query.maxCount;
				} else {
					o = req.args [o.param];
				}
			}
			if (o ["tree"] == "filter") {
				if (req.args ["parent"]) {
					o = " = " + req.args ["parent"];
				} else {
					o = " is null";
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

function treeQueryOld (req, tokens, parents) {
	let sql = "", skip = false;
	
	for (let i = 0; i < tokens.length; i ++) {
		let o = tokens [i];
		
		if (o && typeof (o) == "object") {
			if (o ["select"] == "dataBegin" || o ["select"] == "countBegin") {
				skip = true;
				continue;
			}
			if (o ["select"] == "dataEnd" || o ["select"] == "countEnd") {
				skip = false;
				continue;
			}
			if (skip) {
				continue;
			}
			if (o ["select"] == "treeBegin") {
				o = "select";
			}
			if (o ["select"] == "treeEnd") {
				o = "";
			}
			if (o ["groupBy"] == "treeBegin") {
				o = "group by";
			}
			if (o ["groupBy"] == "treeEnd") {
				o = "";
			}
			if (o ["param"]) {
				if (o ["param"] == "offset") {
					o = 0;
				} else
				if (o ["param"] == "limit") {
					o = config.query.maxCount;
				} else {
					o = req.args [o.param];
				}
			}
			if (o ["tree"] == "filter") {
				o = " in (" + parents.join (",") + ")";
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

function treeQuery (req, tokens, parents) {
	let sql = "", skip = false;
	
	for (let i = 0; i < tokens.length; i ++) {
		let o = tokens [i];
		
		if (o && typeof (o) == "object") {
			if (o ["data"] == "begin" || o ["count"] == "begin") {
				skip = true;
				continue;
			}
			if (o ["data"] == "end" || o ["count"] == "end") {
				skip = false;
				continue;
			}
			if (skip) {
				continue;
			}
			if (o ["tree"] == "begin") {
				o = "";
			}
			if (o ["tree"] == "end") {
				o = "";
			}
			if (o ["param"]) {
				if (o ["param"] == "offset") {
					o = 0;
				} else
				if (o ["param"] == "limit") {
					o = config.query.maxCount;
				} else {
					o = req.args [o.param];
				}
			}
			if (o ["tree"] == "filter") {
				o = " in (" + parents.join (",") + ")";
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
			"class": classId,
			classAttr: classAttrId,
			type: typeId
		};
	});
	cols = _.sortBy (cols, ["order", "name"]);
	
	return cols;
/*
	let cols = _.map (_.keys (recs [0]), (a) => {
		let va = view.attrs [a];
		let ca = caMap [a];
		let name = a;
		let order = 0;
		let classId = null, classAttrId = null, typeId = 1;
		
		if (va) {
			name = va.get ("name");
			order = va.get ("order");
		} else
		if (ca) {
			if (ca.get) {
				name = ca.get ("name");
				order = ca.get ("order");
				classId = store.getClass (ca.get ("class")).getPath ();
				classAttrId = ca.get ("id");
				typeId = ca.get ("type");
			} else {
				name = ca.name;
				classId = ca.classId;
				classAttrId = ca.classAttrId;
				typeId = ca.type;
			}
		}
		return {
			name,
			code: a,
			order,
			"class": classId,
			classAttr: classAttrId,
			type: typeId
		};
	});
	cols = _.sortBy (cols, ["order", "name"]);
	
	return cols;
*/
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
				//tokens.push (req.args [json.param]);
			} else
			if (json ["class"]) {
				let cls = store.getClass (json ["class"]);
				
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
			if (o ["attr"]) {
				let t = o ["attr"].split (".");
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
		recs: await store.query ({session, sql: selectQuery (req, tokens), fields})
	};
	data.cols = await getViewAttrs (data.recs, view, caMap, store, fields);
	
	if (_.has (req.args, "offset") && _.has (req.args, "limit")) {
		if (hasSelectCount) {
			let recs = await store.query ({session, sql: countQuery (req, tokens)});
			
			data.length = recs [0].num;
		}
		if (hasTree) {
			if (data.recs.length) {
				data.childs = await store.query ({session, sql: treeQuery (req, tokens, _.map (data.recs, "id"))});
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
