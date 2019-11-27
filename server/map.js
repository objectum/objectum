"use strict";

const native = {
	"String": 1,
	"string": 1,
	"Number": 2,
	"number": 2,
	"Date": 3,
	"date": 3,
	"Boolean": 4,
	"boolean": 4,
	"File": 5,
	"file": 5,
	"Class": 6,
	"class": 6,
	"ClassAttr": 7,
	"classAttr": 7,
	"View": 8,
	"view": 8,
	"ViewAttr": 9,
	"viewAttr": 9,
	"Action": 10,
	"action": 10,
	"ActionAttr": 11,
	"actionAttr": 11,
	"Object": 12,
	"object": 12,
	"ObjectAttr": 13,
	"objectAttr": 13
};
const map = {
	"class": {
		"fid": "id",
		"fparent_id": "parent",
		"fname": "name",
		"fcode": "code",
		"fdescription": "description",
		"forder": "order",
		"fformat": "format",
		"fview_id": "view",
		"fopts": "opts",
		"fstart_id": "start",
		"fend_id": "end",
		"fschema_id": "schema",
		"frecord_id": "record"
	},
	"classAttr": {
		"fid": "id",
		"fclass_id": "class",
		"fname": "name",
		"fcode": "code",
		"fdescription": "description",
		"forder": "order",
		"ftype_id": "type",
		"fnot_null": "notNull",
		"fsecure": "secure",
		"funique": "unique",
		"fvalid_func": "validFunc",
		"fremove_rule": "removeRule",
		"fopts": "opts",
		"fstart_id": "start",
		"fend_id": "end",
		"fschema_id": "schema",
		"frecord_id": "record"
	},
	"view": {
		"fid": "id",
		"fparent_id": "parent",
		"fname": "name",
		"fcode": "code",
		"fdescription": "description",
		"forder": "order",
		"fquery": "query",
		"flayout": "layout",
		"ficon_cls": "iconCls",
		"fsystem": "system",
		"fclass_id": "class",
		"fopts": "opts",
		"fstart_id": "start",
		"fend_id": "end",
		"fschema_id": "schema",
		"frecord_id": "record"
	},
	"viewAttr": {
		"fid": "id",
		"fview_id": "view",
		"fname": "name",
		"fcode": "code",
		"fdescription": "description",
		"forder": "order",
		"fclass_attr_id": "classAttr",
		"farea": "area",
		"fcolumn_width": "columnWidth",
		"fopts": "opts",
		"fstart_id": "start",
		"fend_id": "end",
		"fschema_id": "schema",
		"frecord_id": "record"
	},
	"action": {
		"fid": "id",
		"fclass_id": "class",
		"fname": "name",
		"fcode": "code",
		"fdescription": "description",
		"forder": "order",
		"fbody": "body",
		"flayout": "layout",
		"fopts": "opts",
		"fstart_id": "start",
		"fend_id": "end",
		"fschema_id": "schema",
		"frecord_id": "record"
	},
	"object": {
		"fid": "id",
		"fclass_id": "_class",
		"fstart_id": "start",
		"fend_id": "end",
		"fschema_id": "schema",
		"frecord_id": "record"
	},
	"objectAttr": {
		"fid": "id",
		"fobject_id": "object",
		"fclass_attr_id": "classAttr",
		"fstring": "string",
		"fnumber": "number",
		"ftime": "time",
		"fstart_id": "start",
		"fend_id": "end",
		"fschema_id": "schema",
		"frecord_id": "record"
	}
};

function getFieldMap (code) {
	return map [code];
};

function getFields (code) {
	return Object.keys (map [code]);
};

function getAttrMap (code) {
	let m = {};

	Object.keys (map [code]).forEach (a => {
		m [map [code][a]] = a;
	});
	return m;
};

const metaTable = {
	"class": "tclass",
	"classAttr": "tclass_attr",
	"view": "tview",
	"viewAttr": "tview_attr",
	"action": "taction"
};

let tableMeta = {};

Object.keys (metaTable).forEach (a => {
	tableMeta [metaTable [a]] = a;
});

function getMetaTable (rsc) {
	return metaTable [rsc];
};

function getMetaCode (table) {
	return tableMeta [table];
};

function isMetaTable (table) {
	if (["tschema", "trevision", "tview_attr", "taction", "_class_attr", "_object", "_opts", "_log",
		"_view", "_view_attr", "_class", "tclass", "tclass_attr", "tview", "tobject", "tobject_attr"].indexOf (table) > -1
	) {
		return true;
	}
	return false;
};

module.exports = {
	native,
	getFieldMap,
	getFields,
	getAttrMap,
	getMetaTable,
	getMetaCode,
	isMetaTable
};

