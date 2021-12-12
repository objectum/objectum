// todo: tclass.fparent_id not exists in tclass - remove trash

"use strict";

const _ = require ("lodash");
const fs = require ("fs");
const util = require ("util");
const fs_readFile = util.promisify (fs.readFile);
const fs_writeFile = util.promisify (fs.writeFile);
const ProgressBar = require ("progress");

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
		"_class", "_class_attr", "_view", "_view_attr", "_object", "_opts", "_log", ..._.map (store.recs ["class"], o => o.getTable ())
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
				insert into _class (fid, fparent_id, fname, fcode, fdescription, forder, fformat,  fview_id, fopts, fstart_id)
				select fid, fparent_id, fname, fcode, fdescription, forder, fformat,  fview_id, fopts, fstart_id
				from tclass
				where fend_id = 0 and fid >= 1000
			`
		},
		"_class_attr": {
			sql: `
				insert into _class_attr (fid, fclass_id, fclass_code, fname, fcode, fdescription, forder, ftype_id, fnot_null, fsecure, funique, fremove_rule, fopts, fstart_id)
				select a.fid, a.fclass_id, b.fcode, a.fname, a.fcode, a.fdescription, a.forder, a.ftype_id, a.fnot_null, a.fsecure, a.funique, a.fremove_rule, a.fopts, a.fstart_id
				from tclass_attr a
				inner join tclass b on (b.fid = a.fclass_id and b.fend_id = 0)
				where a.fend_id = 0
			`
		},
		"_view": {
			logTable: "tview",
			fields: ["fid", "fparent_id", "fname", "fcode", "fdescription", "forder", "flayout", "fquery", "fopts", "fstart_id"]
		},
		"_view_attr": {
			logTable: "tview_attr",
			fields: ["fid", "fview_id", "fname", "fcode", "fdescription", "forder", "fclass_attr_id", "farea", "fcolumn_width", "fopts", "fstart_id"]
		},
		"_object": {
			logTable: "tobject",
			fields: ["fid", "fclass_id", "fstart_id"]
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
	
	log.info ("building tables:");
	
	let bar = new ProgressBar (`:current/:total, :elapsed sec.: :bar`, {total: store.recs ["class"].length, renderThrottle: 200});
	
	for (let i = 0; i < store.recs ["class"].length; i ++) {
		let classObj = store.recs ["class"][i];
		let classId = classObj.get ("id");
		
		if (classId < 1000) {
			continue;
		}
		bar.tick ();
		
		await store.query ({client: store.client, sql: `select table_util (${classId}, 'createTable')`});
		await store.query ({client: store.client, sql: `
			insert into ${classObj.getTable ()} (fobject_id, fclass_id)
			select fid, fclass_id from tobject where fend_id = 0 and fclass_id in (${[classId, ...classObj.childs].join (",")})
		`});
	}
	log.info ("building columns:");
	
	let classAttrBar = new ProgressBar (`:current/:total, :elapsed sec.: :bar`, {total: store.recs ["classAttr"].length, renderThrottle: 200});
	
	for (let i = 0; i < store.recs ["classAttr"].length; i ++) {
		let ca = store.recs ["classAttr"][i];
		let caId = ca.get ("id");
		let classObj = store.getClass (ca.get ("class"));

		classAttrBar.tick ();
		
		await store.query ({client: store.client, sql: `select column_util (${caId}, 'createColumn');`});
/*
		await store.query ({client: store.client, sql: `
			update ${classObj.getTable ()} set ${ca.getField ()} = oa.${ca.getLogField ()}
			from (select fobject_id, ${ca.getLogField ()} from tobject_attr where fend_id = 0 and fclass_attr_id = ${caId}) as oa
			where ${classObj.getTable ()}.fobject_id = oa.fobject_id
		`});
*/
		await store.query ({client: store.client, sql: `
			update ${classObj.getTable ()} set ${ca.getField ()} = oa.${ca.getLogField ()}
			from (select fobject_id, ${ca.getLogField ()} from tobject_attr_${caId} where fend_id = 0) as oa
			where ${classObj.getTable ()}.fobject_id = oa.fobject_id
		`});
	}
	await store.query ({client: store.client, sql: "commit"});
	
	await store.query ({client: store.client, sql: "begin"});
	
	log.info ("foreign keys:");
	
	let fkBar = new ProgressBar (`:current/:total, :elapsed sec.: :bar`, {total: store.recs ["class"].length, renderThrottle: 200});
	
	for (let i = 0; i < store.recs ["class"].length; i ++) {
		fkBar.tick ();
		let classId = store.recs ["class"] [i].get ("id");
		
		if (classId >= 1000) {
			await store.query ({client: store.client, sql: `select table_util (${classId}, 'createForeignKey')`});
		}
	}
	log.info ("fix refs:");
	
	let revisionId = await store.client.getNextId ({table: "trevision"});

	await store.query ({client: store.client, sql: `
		insert into trevision (fid, fdate, fdescription)
		values (${revisionId}, ${store.client.currentTimestamp ()}, 'rebuild fix refs)')
	`});
	let frBar = new ProgressBar (`:current/:total, :elapsed sec.: :bar`, {total: store.recs ["classAttr"].length, renderThrottle: 200});
	
	for (let i = 0; i < store.recs ["classAttr"].length; i ++) {
		frBar.tick ();
		
		let ca = store.recs ["classAttr"][i];
		
		if (ca.get ("type") >= 1000) {
			let c1 = store.map ["class"][ca.get ("class")];
			let c2 = store.map ["class"][ca.get ("type")];
			let recs = await store.query ({
				client: store.client,
				sql: `select fobject_id from ${c1.getTable ()} where ${ca.getField ()} is not null and ${ca.getField ()} not in (select fobject_id from ${c2.getTable ()})`
			});
			if (recs.length) {
				let objects = recs.map (rec => rec.fobject_id);
				
				if (ca.get ("removeRule") == "cascade") {
					log.info (`delete: ${objects}`);
					
					await store.query ({client: store.client, sql: `update tobject set fend_id=${revisionId} where fid in (${objects})`});
					await store.query ({client: store.client, sql: `delete from _object where fid in (${objects})`});
					await store.query ({client: store.client, sql: `delete from ${c1.getTable ()} where fobject_id in (${objects})`});
				} else {
					log.info (`set null: ${objects}`);
					
					await store.query ({client: store.client, sql: `update tobject_attr set fnumber = null where fclass_attr_id=${ca.get ("id")} and fend_id = 0 and fobject_id in (${objects})`});
					await store.query ({client: store.client, sql: `update ${c1.getTable ()} set ${ca.getField ()} = null where fobject_id in (${objects})`});
				}
			}
		}
	}
	log.info ("constraints:");
	
	let cBar = new ProgressBar (`:current/:total, :elapsed sec.: :bar`, {total: store.recs ["classAttr"].length, renderThrottle: 200});
	
	for (let i = 0; i < store.recs ["classAttr"].length; i ++) {
		cBar.tick ();
		
		let ca = store.recs ["classAttr"][i];
		let caId = ca.get ("id");
		
		if (ca.get ("type") >= 1000) {
			let c1 = store.map ["class"][ca.get ("class")];
			let c2 = store.map ["class"][ca.get ("type")];
			
			if (ca.get ("removeRule") == "cascade") {
				await store.query ({
					client: store.client,
					sql: `select fobject_id, ${ca.getField ()} from ${c1.getTable ()} where ${ca.getField ()} not in (select fobject_id from ${c2.getTable ()})`
				});
			}
		}
		await store.query ({client: store.client, sql: `select column_util (${caId}, 'setNotNull,createIndex,createForeignKey');`});
	}
	await store.query ({client: store.client, sql: "commit"});
	
	// trigger_factory
	await store.query ({client: store.client, sql: "begin"});
	await store.query ({client: store.client, sql: `select set_config ('objectum.revision_id', '1', True)`});
	
	log.info ("triggers and unique indexes:");
	
	let tBar = new ProgressBar (`:current/:total, :elapsed sec.: :bar`, {total: store.recs ["class"].length, renderThrottle: 200});
	
	for (let i = 0; i < store.recs ["class"].length; i ++) {
		tBar.tick ();
		
		await store.query ({client: store.client, sql: `select trigger_factory (${store.recs ["class"] [i].get ("id")})`});
		await store.query ({client: store.client, sql: `select update_class_unique_indexes (${store.recs ["class"] [i].get ("id")})`});
	}
	await store.query ({client: store.client, sql: "commit"});
	await store.client.updateSequences ();
};

async function dropObjectAttrIndexes ({store}) {
	log.debug ({fn: "rebuild.dropObjectAttrIndexes"});
	
	let rows = await store.query ({client: store.client, sql: `select fid from _class_attr`});
	let bar = new ProgressBar (`:current/:total: :bar`, {total: rows.length, renderThrottle: 200});
	
	for (let i = 0; i < rows.length; i ++) {
		let row = rows [i];
		let indexRows = await store.query ({client: store.client, sql: `
			select indexname
			from pg_indexes
			where tablename = 'tobject_attr_${row.fid}'
		`});
		for (let j = 0; j < indexRows.length; j ++) {
			let indexRow = indexRows [j];
			let n = indexRow.indexname;

			//if (n.indexOf ("fend_id") == - 1 && n.indexOf ("fobject_id") == - 1 && n.indexOf ("fclass_attr_id") == - 1) {
				await store.query ({client: store.client, sql: `drop index ${n}`});
			//}
		}
		bar.tick ();
	}
};

async function createObjectAttrIndexes ({store}) {
	log.debug ({fn: "rebuild.createObjectAttrIndexes"});
	
	let rows = await store.query ({client: store.client, sql: `select fid from _class_attr`});
	let bar = new ProgressBar (`:current/:total: :bar`, {total: rows.length, renderThrottle: 200});
	let columns = ["fid", "fobject_id", "fclass_attr_id", "fend_id", "fschema_id", "frecord_id"];
	
	for (let i = 0; i < rows.length; i ++) {
		let row = rows [i];
		
		for (let j = 0; j < columns.length; j ++) {
			await store.query ({client: store.client, sql: `
				create index tobject_attr_${row.fid}_${columns [j]} on tobject_attr_${row.fid} (${columns [j]})
			`});
		}
		bar.tick ();
	}
};

module.exports = {
	rebuild,
	dropObjectAttrIndexes,
	createObjectAttrIndexes
};
