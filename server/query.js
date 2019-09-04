"use strict"

const _ = require ("lodash");
const common = require ("./common");

const sysCls = ["system.class", "system.class_attr", "system.view", "system.view_attr", "system.action", "system.object", "system.object_attr", "system.revision"];
const tables = ["tclass", "tclass_attr", "tview", "tview_attr", "taction", "tobject", "tobject_attr", "trevision"];
const keywords = [
	"is null", "is not null", "on", "in", "not in", "exist", "not exist", "like", "not like",
	"desc", "DESC", "asc", "ASC", "and", "or", "row_number ()", "over", "order by",
	"<>", ">", ">=", "<", "<=", "=", "+", "-", "||", "/", ",", "*", "current_timestamp",
	"lower", "trim", "ltrim", "rtrim"
];

class Query {
	constructor ({store, sql}) {
		let me = this;

		me.store = store;
		me.select = sql.select;
		me.from = sql.from;
		me.where = sql.where;
		me.order = sql.order;
		me.orderAfter = sql.orderAfter;
		me.attrs = {};
		me.fields = [];
		me.fieldNames = [];
		me.fieldTypeId = {};
		me.lastTypeId = 1;
	}
	getAttrs () {
		let me = this;

		for (let i = 0; i < me.from.length; i ++) {
			let o = me.from [i];

			if (typeof (o) == "object" && Object.prototype.toString.call (o) !== "[object Array]") {
				for (let key in o) {
					me.attrs [key] = me.attrs [key] || {};
					me.attrs [key].cls = o [key];
					me.attrs [key].toc = {};

					break;
				}
			}
		}
	}
	processJoin (arr) {
		let me = this;

		for (let i = 0; i < arr.length; i ++) {
			let o = arr [i];

			if (typeof (o) =="object") {
				for (let a in o) {
					if (o [a] == "id") {
						let toc = me.store.getClass (me.attrs [a].cls).toc;

						me.attrs [a].toc [toc] = me.attrs [a].toc [toc] || [];
						if (me.attrs [a].toc [toc].indexOf ("fobject_id") == -1) {
							me.attrs [a].toc [toc].push ("fobject_id");
						}
					} else {
						if (!me.attrs [a]) {
							console.error ("unknown attr: " + a);
						}
						let toc, ca, pos = sysCls.indexOf (me.attrs [a].cls);

						if (pos > -1) {
							toc = tables [pos];
							ca = {toc: o [a].substr (3)};
						} else {
							ca = me.store.getClassAttr ({classCode: me.attrs [a].cls, attrCode: o [a]});
							toc = me.store.getClass (ca.get ("class")).toc;
						}
						me.attrs [a].toc [toc] = me.attrs [a].toc [toc] || [];
						if (me.attrs [a].toc [toc].indexOf (ca.toc) == -1) {
							me.attrs [a].toc [toc].push (ca.toc);
						}
					}
					break;
				}
			}
		}
	}
	processJoins (arr) {
		let me = this;

		for (let i = 0; i < arr.length; i ++) {
			let o = arr [i];

			if (o == "left-join" || o == "inner-join") {
				me.processJoin (arr [i + 3]);
				i += 3;
			}
		}
	}
	fieldToSQL (o) {
		let me = this;

		let r = "";
		let distinct = o.distinct;

		for (let a in o) {
			if (a == "distinct") {
				continue;
			}
			if (o [a] == "id") {
				if (distinct) {
					r = "distinct on (" + a + ".fobject_id) " + a + ".fobject_id";
				} else {
					r = a + ".fobject_id";
				}
				let c = me.store.getClass (me.attrs [a].cls);

				if (!c) {
					throw "query.fieldToSQL - unknown class: " + me.attrs [a].cls;
				}
				let toc = c.toc;
				me.attrs [a].toc [toc] = me.attrs [a].toc [toc] || [];

				if (me.attrs [a].toc [toc].indexOf ("fobject_id") == -1) {
					me.attrs [a].toc [toc].push ("fobject_id");
				}
				me.lastTypeId = 2;
			} else {
				if (!me.attrs [a]) {
					throw new Error ("Unknown attr: " + a);
				}
				let toc, pos = sysCls.indexOf (me.attrs [a].cls);
				let ca = me.store.getClassAttr ({classCode: me.attrs [a].cls, attrCode: o [a]});

				if (pos > -1) {
					toc = tables [pos];
					ca.toc = o [a].substr (3);
				} else {
					toc = me.store.getClass (ca.get ("class")).toc;
				}
				if (distinct) {
					r = "distinct on (" + a + "." + ca.toc + ") " + a + "." + ca.toc;
				} else {
					r = a + "." + ca.toc;
				}
				me.attrs [a].toc [toc] = me.attrs [a].toc [toc] || [];

				if (me.attrs [a].toc [toc].indexOf (ca.toc) == -1) {
					me.attrs [a].toc [toc].push (ca.toc);
				}
				me.lastTypeId = ca.get ("type");
			}
			break;
		}
		return r;
	}
	getExpressionStr (arr) {
		let me = this;
		let r = "";

		for (let i = 0; i < arr.length; i ++) {
			if (r) {
				r += " ";
			}
			let o = arr [i];

			if (_.isNull (o)) {
				r += "null";
			} else
			if (typeof (o) == "object") {
				if (common.isArray (o)) {
					r += "(" + me.getExpressionStr (o) + ")";
				} else {
					r += me.fieldToSQL (o);
				}
			} else
			if (typeof (o) == "number") {
				r += o;
			} else
			if (typeof (o) == "string") {
				let pos = me.fields.indexOf (o.toLowerCase () + "_");
				if (keywords.indexOf (o) > -1) {
					r += o;
				} else
				if (pos > -1) {
					// поиск в олапе без учета регистра
					if (!config.query.strictFilter && i < arr.length - 2 && (arr [i + 1] == "like" || arr [i + 1] == "not like") && arr [i + 2] && typeof (arr [i + 2]) == "string") {
						r += "lower (" + me.fieldNames [pos] + ")";
						arr [i + 2] = arr [i + 2].toLowerCase ();
					} else {
						r += me.fieldNames [pos];
					};
				} else {
					r += "'" + o.split ("'").join ("''") + "'";
				}
			} else {
				r += o;
			}
		}
		return r;
	}
	processSelect (arr) {
		let me = this;
		let r = "", name;

		for (let i = 0; i < arr.length; i ++) {
			let o = arr [i];

			if (common.isArray (o)) {
				if (r) {
					r += ",\n\t";
				} else {
					r += "\t";
				}
				r += me.getExpressionStr (o);
			} else
			if (typeof (o) =="object") {
				if (r) {
					r += ",\n\t";
				} else {
					r += "\t";
				}
				name = me.fieldToSQL (o);
				r += name;
			} else {
				let s = o.toLowerCase () + "_";
				r += " as " + s;

				if (i && !common.isArray (arr [i - 1])) {
					me.fields.push (s);

					if (name.substr (0, 8) == "distinct") {
						name = name.split (" ")[3];
					}
					me.fieldNames.push (name);
					me.fieldTypeId [s] = me.lastTypeId;
				}
			}
		}
		return "select\n" + r + "\n";
	}
	processFrom (arr) {
		let me = this;

		if (!arr) {
			return "";
		}
		let getBlock = function (o) {
			let alias, classCode, fields = [], _tables = [], where = [];

			for (alias in o) {
				classCode = o [alias];
				break;
			}
			let objectField;

			for (let t in me.attrs [alias].toc) {
				let f = me.attrs [alias].toc [t];

				for (let i = 0; i < f.length; i ++) {
					fields.push (t + "." + f [i]);
				}
				if (tables.indexOf (t) == -1) {
					objectField = t + ".fobject_id";
				}
			}
			let cls = me.store.getClass (classCode);

			while (1) {
				let pos = sysCls.indexOf (classCode);

				if (pos > -1) {
					_tables.push (tables [pos]);
					break;
				}
				_tables.push (cls.toc);

				if (!cls.get ("parent")) {
					break;
				}
				cls = me.store.getClass (cls.get ("parent"));
			}
			for (let i = 1; i < _tables.length; i ++) {
				where.push (_tables [i - 1] + ".fobject_id=" + _tables [i] + ".fobject_id");
			}
			if (where.length) {
				where = " where " + where.join (" and ");
			} else {
				where = "";
			}
			if (!objectField) {
				if (_tables.indexOf ("tobject") > -1) {
					objectField = "tobject.fid";
				} else
				if (_tables.indexOf ("tobject_attr") > -1) {
					objectField = "tobject_attr.fid";
				}
			}
			return "(select " + fields.join (",") + " from " + _tables.join (",") + where + ") " + alias;
		};
		let r = "";

		for (let i = 0; i < arr.length; i ++) {
			if (!i) {
				r += "\t" + getBlock (arr [0]);
			} else {
				let o = arr [i];

				if (o == "left-join" || o == "inner-join") {
					r += "\n\t" + o.split ("-").join (" ");
					r += " " + getBlock (arr [i + 1]);
					r += " on (" + me.getExpressionStr (arr [i + 3]) + ")";
					i += 3;
				}
			}
		}
		return "from\n" + r + "\n";
	}
	processWhere (arr) {
		let me = this;

		if (!arr || !arr.length) {
			return "";
		}
		return "where\n\t" + me.getExpressionStr (arr) + "\n";
	}
	processOrder (arr) {
		let me = this;

		if (!arr || !arr.length) {
			return "";
		}
		return "order by\n\t" + me.getExpressionStr (arr) + "\n";
	}
	processOrderAfter (arr) {
		let me = this;

		if (!arr || !arr.length) {
			return "";
		}
		let s = "";

		for (let j = 0; j < arr.length; j ++) {
			if (_.isObject (arr [j])) {
				let has = false;

				for (let i = 0; i < me.select.length; i ++) {
					let o = me.select [i];

					if (_.isObject (o) && _.keys (o)[0] == _.keys (arr [j])[0] && _.values (o)[0] == _.values (arr [j])[0]) {
						s += "orderAfter." + me.select [i + 1] + "_ ";
						has = true;
					}
				}
				if (!has) {
					s += "orderAfter." + _.values (arr [j])[0] + "_ ";
				}
			} else {
				let pos = me.fields.indexOf (arr [j].toLowerCase () + "_");
				if (pos > -1) {
					s += "orderAfter." + arr [j] + "_ ";
				} else {
					s += arr [j];
				}
			}
		}
		return "order by\n\t" + s + "\n";
	}
	generate () {
		let me = this;

		me.getAttrs ();
		me.processJoins (me.from);
		me.selectSQL = me.processSelect (me.select);
		me.whereSQL = me.processWhere (me.where);
		me.orderSQL = me.processOrder (me.order);
		me.fromSQL = me.processFrom (me.from);
		if (me.orderAfter) {
			me.selectSQL = "select * from (\n" + me.selectSQL;
			me.orderSQL += "\n) orderAfter " + me.processOrderAfter (me.orderAfter);
		}
	}
}

module.exports = {
	Query
}
