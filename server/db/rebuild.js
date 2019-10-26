// todo: tclass.fparent_id not exists in tclass - remove trash

"use strict";

const _ = require ("lodash");
const fs = require ("fs");
const util = require ("util");
const fs_readFile = util.promisify (fs.readFile);
const fs_writeFile = util.promisify (fs.writeFile);

async function initStore (store) {
	const { getMetaTable } = require ("./../map");
	const { factory } = require ("./../model");
	let rscList = ["class", "classAttr"];
	
	for (let i = 0; i < rscList.length; i ++) {
		let rsc = rscList [i];
		
		let sql = `select * from ${getMetaTable (rsc)} where fend_id = 2147483647`;
		
		if (rsc == "classAttr") {
			sql += " and fclass_id in (select fid from tclass where fend_id = 2147483647)";
		}
		sql += " order by fid";
		
		let rows = await store.query ({client: store.client, sql});
		
		_.each (rows, function (row) {
			let o = factory ({rsc, store, row});
			
			store.map [rsc][o.get ("id")] = o;
			store.recs [rsc].push (o);
		});
		_.each (store.recs [rsc], function (o) {
			store.initRsc ({rsc, action: "create", o});
		});
	}
};

async function rebuild ({store}) {
	log.debug ({fn: "rebuild.rebuild"});
	
	//await store.query ({client: store.client, sql: "begin"});
	
	let tables = [
		"_class", "_class_attr", "_view", "_object", "_opts", "_log", ..._.map (store.recs ["class"], o => o.getTable ())
	];
	await store.query ({client: store.client, sql: "begin"});
	
	for (let i = 0; i < tables.length; i ++) {
		let table = tables [i];
		let result = await store.client.isTableExists ({table});
		
		if (result) {
			await store.query ({client: store.client, sql: `drop table ${table} cascade`});
		}
	}
	await store.query ({client: store.client, sql: "commit"});
	
	// engine
	let sql = await fs_readFile (`${__dirname}/engine-struct.sql`, "utf8");
	
	await store.query ({client: store.client, sql});

	sql = await fs_readFile (`${__dirname}/engine-fn.sql`, "utf8");
	
	await store.query ({client: store.client, sql});
	
	let engineTables = {
		"_class": {
			sql: `
				insert into _class (fid, fparent_id, fname, fcode, fdescription, fformat,  fview_id, fstart_id)
				select fid, fparent_id, fname, fcode, fdescription, fformat,  fview_id, fstart_id
				from tclass
				where fend_id = 0 and fid >= 1000
			`
		},
		"_class_attr": {
			sql: `
				insert into _class_attr (fid, fclass_id, fclass_code, fname, fcode, fdescription, ftype_id, fnot_null, fsecure, funique, fremove_rule, fstart_id)
				select a.fid, a.fclass_id, b.fcode, a.fname, a.fcode, a.fdescription, a.ftype_id, a.fnot_null, a.fsecure, a.funique, a.fremove_rule, a.fstart_id
				from tclass_attr a
				inner join tclass b on (b.fid = a.fclass_id and b.fend_id = 0)
				where a.fend_id = 0
			`
		},
		"_view": {
			logTable: "tview",
			fields: ["fid", "fparent_id", "fname", "fcode", "fdescription", "flayout", "fquery", "fstart_id"]
		},
		"_object": {
			logTable: "tobject",
			fields: ["fid", "fstart_id"]
		}
	};
	await store.query ({client: store.client, sql: "begin"});
	
	for (let table in engineTables) {
		let logTable = engineTables [table].logTable;
		let fields = engineTables [table].fields;
		
		log.info (`${table} building ...`);
		
		await store.query ({
			client: store.client, sql: engineTables [table].sql || `
				insert into ${table} (${fields.join (", ")})
				select ${fields.join (", ")} from ${logTable} where fend_id = 0
			`
		});
	}
	await store.query ({client: store.client, sql: `insert into _opts (fcode, fvalue) values ('version', '4.0')`});
	await store.query ({client: store.client, sql: "commit"});
	
	// toc
	await store.query ({client: store.client, sql: "begin"});
	
	for (let i = 0; i < store.recs ["class"].length; i ++) {
		let classObj = store.recs ["class"][i];
		let classId = classObj.get ("id");
		
		if (classId < 1000) {
			continue;
		}
		log.info (`${i + 1} / ${store.recs ["class"].length} ${classObj.getTable ()} objects ...`);
		
		await store.query ({client: store.client, sql: `select table_util (${classId}, 'createTable')`});
		await store.query ({client: store.client, sql: `
			insert into ${classObj.getTable ()} (fobject_id, fclass_id)
			select fid, fclass_id from tobject where fend_id = 0 and fclass_id in (${[classId, ...classObj.childs].join (",")})
		`});
	}
	for (let i = 0; i < store.recs ["classAttr"].length; i ++) {
		let ca = store.recs ["classAttr"][i];
		let caId = ca.get ("id");
		let classObj = store.getClass (ca.get ("class"));
		
		log.info (`${i + 1} / ${store.recs ["classAttr"].length} ${ca.getField ()} object attrs ...`);
		
		await store.query ({client: store.client, sql: `select column_util (${caId}, 'createColumn');`});
		await store.query ({client: store.client, sql: `
			update ${classObj.getTable ()} set ${ca.getField ()} = oa.${ca.getLogField ()}
			from (select fobject_id, ${ca.getLogField ()} from tobject_attr where fend_id = 0 and fclass_attr_id = ${caId}) as oa
			where ${classObj.getTable ()}.fobject_id = oa.fobject_id
		`});
	}
	await store.query ({client: store.client, sql: "commit"});
	
	await store.query ({client: store.client, sql: "begin"});
	
	for (let i = 0; i < store.recs ["class"].length; i ++) {
		log.info (`${i + 1} / ${store.recs ["class"].length} foreign key ...`);
		
		let classId = store.recs ["class"] [i].get ("id");
		
		if (classId >= 1000) {
			await store.query ({client: store.client, sql: `select table_util (${classId}, 'createForeignKey')`});
		}
	}
	for (let i = 0; i < store.recs ["classAttr"].length; i ++) {
		log.info (`${i + 1} / ${store.recs ["classAttr"].length} constraints ...`);
		
		let ca = store.recs ["classAttr"][i];
		let caId = ca.get ("id");

		await store.query ({client: store.client, sql: `select column_util (${caId}, 'setNotNull,createIndex,createForeignKey');`});
	}
	await store.query ({client: store.client, sql: "commit"});
	
	// trigger_factory
	await store.query ({client: store.client, sql: "begin"});
	await store.query ({client: store.client, sql: `select set_config ('objectum.revision_id', '1', True)`});

	for (let i = 0; i < store.recs ["class"].length; i ++) {
		await store.query ({client: store.client, sql: `select trigger_factory (${store.recs ["class"] [i].get ("id")})`});
	}
	await store.query ({client: store.client, sql: "commit"});
	await store.client.updateSequences ();
};

// legacy
async function uniqueStat ({store}) {
	log.debug ({fn: "rebuild.uniqueStat"});
	
	await initStore (store);

	let attrs = [];
	
	for (let i = 0; i < store.recs.classAttr.length; i ++) {
		let ca = store.recs.classAttr [i];
		
		if (ca.get ("unique")) {
			attrs.push (ca);
		}
	}
	log.info (`unique attrs num: ${attrs.length}`);
	
	let data = {};
	
	for (let i = 0; i < attrs.length; i ++) {
		log.info (`${i + 1} / ${attrs.length} reading ...`);

		let ca = attrs [i];
		let f = ca.getLogField ();
		let recs = await store.query ({client: store.client, sql: `select fid, fobject_id, fstart_id, ${f} from tobject_attr where fclass_attr_id = ${ca.get ("id")} and fend_id = 2147483647`});
		let num = {};
		
		recs.forEach (rec => {
			num [rec [f]] = num [rec [f]] || 0;
			num [rec [f]] ++;
		});
		let invalidRecs = [];
		
		_.each (num, (n, v) => {
			if (n > 1) {
				let r = _.filter (recs, rec => {
					if (rec [f] == v) {
						return true;
					}
				});
				invalidRecs.push (r);
			}
		});
		if (invalidRecs.length) {
			data [ca.getPath ()] = invalidRecs;
		}
	}
	if (_.isEmpty (data)) {
		log.info ("unique conflicts not exists");
	} else {
		_.each (data, (recs, a) => {
			console.log (a, recs.length);
		});
		log.info ("unique conflicts saved to objectum-unique-conflicts.json");
		fs.writeFileSync ("objectum-unique-conflicts.json", JSON.stringify (data, null, "\t"));
	}
	return data;
};

// legacy
async function uniqueRemoveDuplicates ({store}) {
	let data = await uniqueStat ({store});
	
	if (_.isEmpty (data)) {
		return;
	}
	let num = 0, total = 0;
	
	_.each (data, (arrayRecs) => {
		_.each (arrayRecs, (recs) => {
			total += recs.length - 1;
		});
	});
	let removed = {};
	let revisionId = await store.client.getNextId ({table: "trevision"});
	
	await store.query ({client: store.client, sql: "begin"});
	await store.query ({client: store.client, sql: `
		insert into trevision (fid, fdate, fdescription, fsubject_id, fremote_addr)
		values (${revisionId}, ${store.client.currentTimestamp ()}, 'uniqueRemoveDuplicates', null, null)
	`});
	for (let caPath in data) {
		let arrayRecs = data [caPath];
		let ca = store.getClassAttr (caPath);
		
		removed [caPath] = [];
		
		for (let j = 0; j < arrayRecs.length; j ++) {
			let recs = arrayRecs [j];
			
			removed [caPath] = [...removed [caPath], ...recs.slice (0, recs.length - 1)];
			
			for (let i = 0; i < recs.length - 1; i ++) {
				let rec = recs [i];
				
				num ++;
				log.info (`${num} / ${total}: ${caPath} - ${rec [ca.getLogField ()]}`);
				
				await store.query ({
					client: store.client, sql: `
						update tobject_attr set fend_id = ${revisionId} where fclass_attr_id = ${ca.get ("id")} and fend_id = 2147483647 and fobject_id = ${rec.fobject_id}
					`
				});
			}
		}
	}
	await store.query ({client: store.client, sql: "end"});
	
	log.info ("unique conflicts removed saved to objectum-unique-conflicts-removed.json");
	fs.writeFileSync ("objectum-unique-conflicts-removed.json", JSON.stringify (removed, null, "\t"));
};

// legacy
async function invalidFkStat ({store}) {
	log.debug ({fn: "rebuild.invalidFkStat"});
	
	let objectRecs = await store.query ({client: store.client, sql: "select fid, fclass_id from tobject where fend_id = 2147483647"});
	let objectMap = {};
	
	objectRecs.forEach (rec => {
		objectMap [rec.fid] = rec.fclass_id;
	});
	await initStore (store);
	
	let attrs = [];
	
	for (let i = 0; i < store.recs.classAttr.length; i ++) {
		let ca = store.recs.classAttr [i];
		
		if (ca.get ("type") >= 1000 && ca.get ("removeRule") != "no action") {
			attrs.push (ca);
		}
	}
	let data = {};
	
	for (let i = 0; i < attrs.length; i ++) {
		let ca = attrs [i];
		let recs = await store.query ({client: store.client, sql: `select distinct fnumber as f from tobject_attr where fclass_attr_id = ${ca.get ("id")} and fend_id = 2147483647 and fnumber is not null`});
		let invalid = [];
		let classes = [ca.get ("type"), ...store.getClass (ca.get ("type")).childs];
		
		log.info (`${i + 1} / ${attrs.length}: ${recs.length} records.`);
		
		recs.forEach (rec => {
			if (!objectMap [rec.f]) {
				invalid.push ("none-" + rec.f);
			}
			if (objectMap [rec.f] && classes.indexOf (objectMap [rec.f]) == -1) {
				invalid.push ("cls-" + rec.f);
			}
		});
		if (invalid.length) {
			data [ca.getPath ()] = invalid;
		}
	}
	fs.writeFileSync ("invalidFk.json", JSON.stringify (data, null, "\t"));
};

async function setNullInvalidFk ({store}) {
	log.debug ({fn: "rebuild.setNullInvalidFk"});
	
	let objectRecs = await store.query ({client: store.client, sql: "select fid, fclass_id from tobject where fend_id = 2147483647"});
	let objectMap = {};
	
	objectRecs.forEach (rec => {
		objectMap [rec.fid] = rec.fclass_id;
	});
	await initStore (store);
	
	let attrs = [];
	
	for (let i = 0; i < store.recs.classAttr.length; i ++) {
		let ca = store.recs.classAttr [i];
		
		if (ca.get ("type") >= 1000 && ca.get ("removeRule") != "no action") {
			attrs.push (ca);
		}
	}
	let total = 0, data = {};
	
	for (let i = 0; i < attrs.length; i ++) {
		log.info (`${i + 1} / ${attrs.length} reading ...`);
		
		let ca = attrs [i];
		let recs = await store.query ({client: store.client, sql: `select distinct fnumber as f from tobject_attr where fclass_attr_id = ${ca.get ("id")} and fend_id = 2147483647 and fnumber is not null`});
		let invalid = [];
		let classes = [ca.get ("type"), ...store.getClass (ca.get ("type")).childs];
		
		recs.forEach (rec => {
			if (!objectMap [rec.f] || classes.indexOf (objectMap [rec.f]) == -1) {
				invalid.push (rec.f);
			}
		});
		if (invalid.length) {
			data [ca.getPath ()] = invalid;
			total += invalid.length;
			
			for (let j = 0; j < invalid.length; j += 10000) {
				await store.query ({client: store.client, sql: `
					delete from tobject_attr
					where fclass_attr_id = ${ca.get ("id")} and fend_id = 2147483647 and fnumber in (${invalid.slice (j, j + 10000).join (",")})
				`});
				log.info (`${j} / ${invalid.length} ...`);
			}
			log.info (`${invalid.length} fixed.`);
		}
	}
	log.info (`total ${total} fixed.`);
	fs.writeFileSync ("invalidFk-fixed.json", JSON.stringify (data, null, "\t"));
};

// legacy
async function setNullInvalidFkNew ({store}) {
	log.debug ({fn: "rebuild.setNullInvalidFk"});
	
	await initStore (store);

	let attrs = [];
	
	for (let i = 0; i < store.recs.classAttr.length; i ++) {
		let ca = store.recs.classAttr [i];
		
		if (ca.get ("type") >= 1000 && ca.get ("removeRule") != "no action") {
			attrs.push (ca);
		}
	}
	for (let i = 0; i < attrs.length; i ++) {
		log.info (`${i + 1} / ${attrs.length} processing ...`);
		
		let ca = attrs [i];
		let classes = [ca.get ("type"), ...store.getClass (ca.get ("type")).childs];
		
		await store.query ({client: store.client, sql: `
			delete from tobject_attr
			where fclass_attr_id = ${ca.get ("id")} and fend_id = 2147483647 and
			fnumber not in (
				select fid from tobject where fend_id = 2147483647 and fclass_id in (${[ca.get ("type"), ...classes].join (",")})
			)
		`});
	}
};

// legacy
async function nullNotNullStat ({store}) {
	await initStore (store);

	let attrs = [];
	
	for (let i = 0; i < store.recs.classAttr.length; i ++) {
		let ca = store.recs.classAttr [i];
		
		if (ca.get ("notNull")) {
			attrs.push (ca);
		}
	}
	log.info (`not null attrs num: ${attrs.length}`);
	
	let data = {};
	
	for (let i = 0; i < attrs.length; i ++) {
		log.info (`${i + 1} / ${attrs.length} reading ...`);
		
		let ca = attrs [i];
		let f = ca.getLogField ();
		let recs = await store.query ({client: store.client, sql: `
			select
				count (*) as num
			from
				tobject o
				left join tobject_attr oa on (oa.fobject_id = o.fid and oa.fclass_attr_id = ${ca.get ("id")} and oa.fend_id = 2147483647)
			where
				o.fend_id = 2147483647 and o.fclass_id = ${ca.get ("class")} and
				oa.${f} is null
		`});
		if (recs [0].num) {
			data [ca.getPath ()] = recs [0].num;
		}
	}
	if (_.isEmpty (data)) {
		log.info ("ok");
	} else {
		fs.writeFileSync ("objectum-nullNotNull-num.json", JSON.stringify (data, null, "\t"));
	}
	return data;
};

// legacy
async function updateNullNotNull ({store, values}) {
	if (!values) {
		throw new Error ("cfg.values not exists");
	}
	let data = await nullNotNullStat ({store});
	
	if (_.isEmpty (data)) {
		return;
	}
	let num = 0, total = 0, sql = [];
	
	for (let caPath in data) {
		total += data [caPath].length - 1;
	}
	let revisionId = await store.client.getNextId ({table: "trevision"});
	
	await store.query ({client: store.client, sql: `
		insert into trevision (fid, fdate, fdescription, fsubject_id, fremote_addr)
		values (${revisionId}, ${store.client.currentTimestamp ()}, 'updateNullNotNull', null, null)
	`});
	let i = 0;
	
	for (let caPath in data) {
		let recsNum = data [caPath];
		let ca = store.getClassAttr (caPath);
		let f = ca.getLogField ();
		let a = values [caPath];
		
		if (!a) {
			continue;
			//throw new Error (`cfg.values [${caPath}] not exists`);
		}
		if (!a) {
			throw new Error (`values not exists: ${caPath}`);
		}
		log.info (`${++ i} / ${_.keys (data).length} ${caPath} num: ${recsNum}`);
		
		if (a.removeObject) {
			sql.push (`
				delete from tobject where fid in (
					select o.fid from tobject o
					left join tobject_attr oa on (oa.fobject_id = o.fid and oa.fclass_attr_id = ${ca.get ("id")} and oa.fend_id = 2147483647)
					where o.fend_id = 2147483647 and o.fclass_id = ${ca.get ("class")} and oa.${f} is null
				)
			`);
			
/*
			await store.query ({client: store.client, sql: `
				delete from tobject where fid in (
					select o.fid from tobject o
					left join tobject_attr oa on (oa.fobject_id = o.fid and oa.fclass_attr_id = ${ca.get ("id")} and oa.fend_id = 2147483647)
					where o.fend_id = 2147483647 and o.fclass_id = ${ca.get ("class")} and oa.${f} is null
				)
			`});
*/
/*
			await store.query ({client: store.client, sql: `
				delete from tobject_attr where fobject_id not in (
					select fid from tobject where fclass_id = ${ca.get ("class")}
				)
			`});
*/
			continue;
		}
		num += recsNum;
		
		let value;
		
		if (a.value) {
			value = a.value;
		}
		if (a.spr) {
			value = await store.getId ({client: store.client, classCode: a.spr, code: a.code});
		}
		if (value === undefined || value === null) {
			throw new Error (`value undefined or null: ${JSON.stringify (a)}, rec: ${JSON.stringify (rec)}`);
		}
		sql.push (`
			update tobject_attr set ${ca.getLogField ()} = '${value}', fstart_id = ${revisionId} where fclass_attr_id = ${ca.get ("id")} and fend_id = 2147483647 and ${ca.getLogField ()} is null
		`);
/*
		await store.query ({client: store.client, sql: `
			update tobject_attr set ${ca.getLogField ()} = '${value}', fstart_id = ${revisionId} where fclass_attr_id = ${ca.get ("id")} and fend_id = 2147483647 and ${ca.getLogField ()} is null
		`});
*/
		sql.push (`
			insert into tobject_attr (${ca.getLogField ()}, fobject_id, fclass_attr_id, fstart_id, fend_id)
			select
				'${value}', o.fid as fobject_id, ${ca.get ("id")}, ${revisionId}, 2147483647
			from
				tobject o
				left join tobject_attr oa on (oa.fobject_id = o.fid and oa.fclass_attr_id = ${ca.get ("id")} and oa.fend_id = 2147483647)
			where
				o.fend_id = 2147483647 and o.fclass_id = ${ca.get ("class")} and
				oa.fid is null
		`);
/*
		await store.query ({client: store.client, sql: `
			insert into tobject_attr (${ca.getLogField ()}, fobject_id, fclass_attr_id, fstart_id, fend_id)
			select
				'${value}', o.fid as fobject_id, ${ca.get ("id")}, ${revisionId}, 2147483647
			from
				tobject o
				left join tobject_attr oa on (oa.fobject_id = o.fid and oa.fclass_attr_id = ${ca.get ("id")} and oa.fend_id = 2147483647)
			where
				o.fend_id = 2147483647 and o.fclass_id = ${ca.get ("class")} and
				oa.fid is null
		`});
*/
	}
	await fs_writeFile ("updateNullNotNull.sql", sql.join (";\n"));
	
	log.info ("updateNullNotNull.sql created");
};

// legacy
async function removeUnusedObjectAttrs ({store}) {
	await initStore (store);
	
	let sql = [];
	
	for (let i = 0; i < store.recs.classAttr.length; i ++) {
		log.info (`${i + 1} / ${store.recs.classAttr.length} removing unused object attrs ...`);
		
		let ca = store.recs.classAttr [i];
		let classes = [ca.get ("class"), ...store.getClass (ca.get ("class")).childs];
		
		sql.push (`
			delete from tobject_attr oa where oa.fclass_attr_id = ${ca.get ("id")} and not exists (
				select o.fid from tobject o where o.fid = oa.fobject_id and o.fclass_id in (${classes.join (",")})
			)
		`);
	}
	await fs_writeFile ("removeUnusedObjectAttrs.sql", sql.join (";\n"));
	
	log.info ("removeUnusedObjectAttrs.sql created");
};

// legacy
async function nullNotNullUniqueStat ({store}) {
	await initStore (store);
	
	let attrs = [];
	
	for (let i = 0; i < store.recs.classAttr.length; i ++) {
		let ca = store.recs.classAttr [i];
		
		if (ca.get ("notNull") && ca.get ("unique")) {
			attrs.push (ca);
		}
	}
	log.info (`not null unique attrs num: ${attrs.length}`);
};

// legacy
// todo: tclass.fparent_id not exists
async function migration3to4 ({store}) {
	log.debug ({fn: "rebuild.migration3to4"});
	
	let tablesSql = (await fs_readFile (`${__dirname}/tables.sql`, "utf8")).split (";");
	let indexesSql = (await fs_readFile (`${__dirname}/indexes.sql`, "utf8")).split (";");
	let tables = ["tclass", "tclass_attr", "tview", "tview_attr", "taction"];
	let map = {
		"tclass": [
			"fid", "fparent_id", "fname", "fcode", "fdescription", "fformat", "fview_id", "fstart_id", "fend_id", "fschema_id", "frecord_id"
		],
		"tclass_attr": [
			"fid", "fclass_id", "fname", "fcode", "fdescription", "ftype_id", "fnot_null", "fsecure", "funique", "fvalid_func", "fremove_rule", "fstart_id", "fend_id", "fschema_id", "frecord_id"
		],
		"tview": [
			"fid", "fparent_id", "fname", "fcode", "fdescription", "fquery", "flayout", "ficon_cls", "fsystem", "fstart_id", "fend_id", "fschema_id", "frecord_id"
		],
		"tview_attr": [
			"fid", "fview_id", "fname", "fcode", "fdescription", "forder", "fclass_attr_id", "farea", "fcolumn_width", "fstart_id", "fend_id", "fschema_id", "frecord_id"
		],
		"taction": [
			"fid", "fclass_id", "fname", "fcode", "fdescription", "fbody", "flayout", "fstart_id", "fend_id", "fschema_id", "frecord_id"
		]
	};
	for (let i = 0; i < tables.length; i++) {
		let table = tables [i];

		log.info (`${table} updating ...`);
		
		// remove fid duplicates
		let createSql;
		
		for (let j = 0; j < tablesSql.length; j ++) {
			let sql = tablesSql [j];
			
			if (sql.indexOf (`create table ${table}`) > -1) {
				createSql = sql;
				break;
			}
		}
		let fields = map [table];
	
		await store.query ({client: store.client, sql: createSql.replace (`create table ${table}`, `create table ${table}_new`)});
		await store.query ({client: store.client, sql: `update ${table} set fend_id = 0 where fend_id = 2147483647`});
		await store.query ({client: store.client, sql: `insert into ${table}_new (${fields.join (",")}) select distinct on (fid) ${fields.join (",")} from ${table} where fend_id = 0 order by fid`});
		await store.query ({client: store.client, sql: `drop table ${table}`});
		await store.query ({client: store.client, sql: `alter table ${table}_new rename to ${table}`});
		await store.query ({client: store.client, sql: `alter sequence ${table}_new_fid_seq rename to ${table}_fid_seq`});
		
		// remove fcode + (fparent_id, fview_id, fclass_id) duplicates
		let data = {};
		let keyFields = ["fcode"];
		
		if (table == "tclass_attr" || table == "taction") {
			keyFields.push ("fclass_id");
		} else
		if (table == "tview_attr") {
			keyFields.push ("fview_id");
		} else {
			keyFields.push ("fparent_id");
		}
		let recs = await store.query ({client: store.client, sql: `select fid, ${keyFields.join (",")} from ${table} where fend_id = 0 order by fid desc`});
		
		for (let j = 0; j < recs.length; j ++) {
			let rec = recs [j];
			let hasId = data [`${rec [keyFields [0]]}-${rec [keyFields [1]]}`];
			
			if (hasId) {
				if (table == "tview" || table == "tclass") {
					let has1 = _.find (recs, {fparent_id: hasId});
					let has2 = _.find (recs, {fparent_id: rec.fid});
				
					if (!has1 && has2) {
						data [`${rec [keyFields [0]]}-${rec [keyFields [1]]}`] = rec.fid;
						rec.fid = hasId;
					}
					if (has1 && has2) {
						throw new Error (`intractable conflict: ${table}, fid: ${hasId}, ${rec.fid}`);
					}
				}
				//console.log (table, rec.fid, rec [keyFields [0]], rec [keyFields [1]], data [`${rec [keyFields [0]]}-${rec [keyFields [1]]}`]);
				await store.query ({client: store.client, sql: `delete from ${table} where fid = ${rec.fid}`});
			} else {
				data [`${rec [keyFields [0]]}-${rec [keyFields [1]]}`] = rec.fid;
			}
		}
		for (let j = 0; j < indexesSql.length; j ++) {
			let sql = indexesSql [j];
			
			if (sql.indexOf (`${table} (`) > -1) {
				await store.query ({client: store.client, sql});
			}
		}
	}
	let objectSql = [`
		create table tobject_new (
			fid bigserial not null,
			fclass_id bigint,
			fstart_id bigint,
			fend_id bigint,
			fschema_id bigint,
			frecord_id bigint
		)
	`, `
		insert into tobject_new (fid, fclass_id, fstart_id, fend_id, fschema_id, frecord_id)
		select fid, fclass_id, fstart_id, fend_id, fschema_id, frecord_id from tobject where fend_id <> 2147483647
	`, `
		insert into tobject_new (fid, fclass_id, fstart_id, fend_id, fschema_id, frecord_id)
		select fid, fclass_id, fstart_id, 0, fschema_id, frecord_id from tobject where fend_id = 2147483647
	`,
		"drop table tobject"
	,
		"alter table tobject_new rename to tobject"
	,
		"alter sequence tobject_new_fid_seq rename to tobject_fid_seq"
	,
		"create index tobject_fid on tobject (fid)"
	,
		"create index tobject_fclass_id on tobject (fclass_id)"
	,
		"create unique index tobject_ufid on tobject (fid,fstart_id,fend_id)"
	,
		"create index tobject_fstart_id on tobject (fstart_id)"
	,
		"create index tobject_fend_id on tobject (fend_id)"
	,
		"create index tobject_fschema_id on tobject (fschema_id)"
	,
		"create index tobject_frecord_id on tobject (frecord_id)"
	];
	for (let i = 0; i < objectSql.length; i ++) {
		await store.query ({client: store.client, sql: objectSql [i]});
	}
/*
	let objectAttrSql = [`
		create table tobject_attr_new (
			fid bigserial not null,
			fobject_id bigint,
			fclass_attr_id bigint,
			fstring text,
			fnumber numeric,
			ftime timestamp (6),
			fstart_id bigint,
			fend_id bigint,
			fschema_id bigint,
			frecord_id bigint
		)
	`, `
		insert into tobject_attr_new (fid, fobject_id, fclass_attr_id, fstring, fnumber, ftime, fstart_id, fend_id, fschema_id, frecord_id)
		select fid, fobject_id, fclass_attr_id, fstring, fnumber, ftime, fstart_id, fend_id, fschema_id, frecord_id from tobject_attr where fend_id <> 2147483647;
	`, `
		insert into tobject_attr_new (fid, fobject_id, fclass_attr_id, fstring, fnumber, ftime, fstart_id, fend_id, fschema_id, frecord_id)
		select fid, fobject_id, fclass_attr_id, fstring, fnumber, ftime, fstart_id, 0, fschema_id, frecord_id from tobject_attr where fend_id = 2147483647;
	`,
		"drop table tobject_attr"
	,
		"alter table tobject_attr_new rename to tobject_attr"
	,
		"alter sequence tobject_attr_new_fid_seq rename to tobject_attr_fid_seq"
	,
		"create index tobject_attr_fid on tobject_attr (fid)"
	,
		"create index tobject_attr_fobject_id on tobject_attr (fobject_id)"
	,
		"create index tobject_attr_fclass_attr_id on tobject_attr (fclass_attr_id)"
	,
		"create index tobject_attr_fnumber on tobject_attr (fnumber)"
	,
		"create index tobject_attr_ftime on tobject_attr (ftime)"
	,
		"create index tobject_attr_fstring on tobject_attr (substr (fstring, 1, 256))"
	,
		"create index tobject_attr_fstart_id on tobject_attr (fstart_id)"
	,
		"create index tobject_attr_fend_id on tobject_attr (fend_id)"
	,
		"create index tobject_attr_fschema_id on tobject_attr (fschema_id)"
	,
		"create index tobject_attr_frecord_id on tobject_attr (frecord_id)"
	];
	for (let i = 0; i < objectAttrSql.length; i ++) {
		await store.query ({client: store.client, sql: objectAttrSql [i]});
	}
*/
	let caRecs = await store.query ({client: store.client, sql: "select distinct (fid), ftype_id from tclass_attr"});
	
	for (let i = 0; i < caRecs.length; i ++) {
		log.info (`${i + 1} / ${caRecs.length} ...`);
		
		let caRec = caRecs [i];
		let caId = caRec.fid;
		let table = "tobject_attr_" + caId;
		
		await store.query ({client: store.client, sql: `
			drop table if exists ${table} cascade;
			create table ${table} (check (fclass_attr_id = ${caId})) inherits (tobject_attr);
			create rule ${table}_insert as on insert to tobject_attr where fclass_attr_id = ${caId} do instead insert into ${table} values (NEW.*);
		`});
		await store.query ({client: store.client, sql: `
			insert into ${table} (fid, fobject_id, fclass_attr_id, fstring, fnumber, ftime, fstart_id, fend_id, fschema_id, frecord_id)
			select fid, fobject_id, fclass_attr_id, fstring, fnumber, ftime, fstart_id, fend_id, fschema_id, frecord_id from only tobject_attr
			where fend_id <> 2147483647 and fclass_attr_id = ${caId};
			insert into ${table} (fid, fobject_id, fclass_attr_id, fstring, fnumber, ftime, fstart_id, fend_id, fschema_id, frecord_id)
			select fid, fobject_id, fclass_attr_id, fstring, fnumber, ftime, fstart_id, 0, fschema_id, frecord_id from only tobject_attr
			where fend_id = 2147483647 and fclass_attr_id = ${caId};
			delete from only tobject_attr where fclass_attr_id = ${caId};
		`});
/*
		await store.query ({client: store.client, sql: `create index ${table}_fid on ${table} (fid)`});
		await store.query ({client: store.client, sql: `create index ${table}_fobject_id on ${table} (fobject_id)`});
		await store.query ({client: store.client, sql: `create index ${table}_fclass_attr_id on ${table} (fclass_attr_id)`});
		await store.query ({client: store.client, sql: `create index ${table}_fnumber on ${table} (fnumber)`});
		await store.query ({client: store.client, sql: `create index ${table}_ftime on ${table} (ftime)`});
		await store.query ({client: store.client, sql: `create index ${table}_fstring on ${table} (substr (fstring, 1, 256))`});
		await store.query ({client: store.client, sql: `create index ${table}_fstart_id on ${table} (fstart_id)`});
		await store.query ({client: store.client, sql: `create index ${table}_fend_id on ${table} (fend_id)`});
		await store.query ({client: store.client, sql: `create index ${table}_fschema_id on ${table} (fschema_id)`});
		await store.query ({client: store.client, sql: `create index ${table}_frecord_id on ${table} (frecord_id)`});
*/
		await store.query ({client: store.client, sql: `
			create index ${table}_fobject_id on ${table} (fobject_id);
			create index ${table}_fstart_id on ${table} (fstart_id);
			create index ${table}_fend_id on ${table} (fend_id);
			create index ${table}_fschema_id on ${table} (fschema_id);
			create index ${table}_frecord_id on ${table} (frecord_id);
		`});
		if (caRec.ftype_id == 3) {
			await store.query ({client: store.client, sql: `create index ${table}_ftime on ${table} (ftime)`});
		} else
		if (caRec.ftype_id == 1 || caRec.ftype_id == 5) {
			await store.query ({client: store.client, sql: `create index ${table}_fstring on ${table} (substr (fstring, 1, 256))`});
		} else {
			await store.query ({client: store.client, sql: `create index ${table}_fnumber on ${table} (fnumber)`});
		}
	}
	await store.query ({client: store.client, sql: "delete from only tobject_attr"});
	// duplicates
	
	
	//await store.init ();
	//await rebuild ({store});
};

module.exports = {
	rebuild,
	uniqueStat,
	uniqueRemoveDuplicates,
	invalidFkStat,
	setNullInvalidFk,
	nullNotNullStat,
	updateNullNotNull,
	removeUnusedObjectAttrs,
	nullNotNullUniqueStat,
	migration3to4
};
