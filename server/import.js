"use strict"

const _ = require ("lodash");
const fs = require ("fs");
const util = require ("util");
const fs_readFile = util.promisify (fs.readFile);
const fs_access = util.promisify (fs.access);
const common = require ("./common");
const { Store } = require ("./store");
const { getMetaCode, getFields } = require ("./map");
const ProgressBar = require ("progress");

class Import {
	constructor () {
		// Здесь импортируемые данные
		this.data = {};
		// Счетчики идентификаторов по таблицам
		this.tableId = {};
		// Соответствие schemaId и локальным id
		this.newId = {
			tclass: {}, tclass_attr: {}, tview: {}, tview_attr: {}, taction: {}, tobject: {}, tobject_attr: {}, trevision: {}, tschema: {}
		}
		// Счетчик добавленных записей в таблицах
		this.count = {
			tclass: 0, tclass_attr: 0, tview: 0, tview_attr: 0, taction: 0, tobject: 0, tobject_attr: 0, trevision: 0, restoredRecords: 0
		}
		// Тип данных атрибута класса
		this.classAttrType = {};
		// Стартовая ревизия при импорте схемы (обновление схемы)
		this.startRevision = null;
		this.startRevisionMin = null;
	}
	
	async getSequences () {
		let me = this;
		let tables = ["tclass",	"tclass_attr", "tview", "tview_attr", "taction", "tobject", "tobject_attr", "trevision"];
		
		for (let i = 0; i < tables.length; i ++) {
			let table = tables [i];
			me.tableId [table] = await me.store.client.getNextId ({table});
		}
	};
	
	generateInsert (options) {
	    let fields = [];
	    let values = "";
		
	    let code = getMetaCode (options.table);
	    
	    if (code) {
	    	let tableFields = getFields (code);
				
	    	for (let key in options.fields) {
	    		if (tableFields.indexOf (key) == -1) {
	    			delete options.fields [key];
				}
			}
		}
	    for (let key in options.fields) {
			fields.push (key);
			
			if (values) {
				values += ",";
			}
			if (options.fields [key] != null) {
				let value = options.fields [key];
				
				if (typeof (value) == "string") {
					if (value.length == 24 && value [10] == "T" && value [23] == "Z") { // 2012-08-20T13:17:48.456Z
						value = "'" + common.getUTCTimestamp (new Date (value)) + "'";
					} else {
						value = "E" + common.ToSQLString (value);
					}
				} else
				if (typeof (value) == "object" && value.getMonth) {
					value = "'" + common.getUTCTimestamp (value) + "'";
				}
				values += value;
			} else {
				values += "null";
			}
	    }
	    let s;
		
	    s = `
	    	insert into ${options.table} (
	    		${fields.join ()}
	    	) values (		    
	    		${values}
	    	)
	    `;
	    return s;
	}
	
	generateUpdate ({table, fields, where}) {
		let sql = `update ${table} set `;
		let conditions = [], params = [];
		
		for (let key in fields) {
			let value = null;
			
			if (fields [key] !== null && fields [key] !== undefined) {
				value = fields [key];
				
				if (typeof (value) == "string" && value.length == 24 && value [10] == "T" && value [23] == "Z") { // 2012-08-20T13:17:48.456Z
					value = common.getUTCTimestamp (new Date (value));
				} else
				if (typeof (value) == "object" && value.getMonth) {
					value = common.getUTCTimestamp (value);
				}
			}
			conditions.push (`${key} = $${conditions.length + 1}`);
			params.push (value);
		}
		sql +=  `${conditions.join (", ")} where ${where}`;
		
		return {sql, params};
	}
	
	incCount (table, id) {
		this.count [table] ++;
	}
	
	async importViews () {
		log.info ({fn: "importQueries"});
		
		let me = this;
		let viewFields = me.data.fields.tview;
		let bar = new ProgressBar (`:current/:total, :elapsed sec.: :bar`, {total: me.data.tview.length, renderThrottle: 200});
		
		for (let j = 0; j < me.data.tview.length; j ++) {
			let view = me.data.tview [j];
			let fields = {};
			let schemaId;
			
			for (let i = 0; i < viewFields.length; i ++) {
				let field = viewFields [i];
				let value = view.values [i];
				
				if (value != null) {
					if (field == "fid") {
						value = me.newId ["tview"][value];
					} else
					if (field == "fparent_id") {
						value = me.newId ["tview"][value];
					} else
					if (field == "fclass_id") {
						value = me.newId ["tclass"][value];
					} else
					if (field == "fschema_id") {
						schemaId = value;
						value = me.newId ["tschema"][value];
					}
				}
				fields [field] = value;
			}
			if (me.startRevision [schemaId] == null || fields ["fstart_id"] < me.startRevision [schemaId]) {
				// Запись удалена
				if (me.startRevision [schemaId] != null && 
					fields ["fend_id"] != 0 &&
					fields ["fend_id"] >= me.startRevision [schemaId] &&
					fields ["fid"] !== undefined // Например когда запись одна и она удалена
				) {
					fields ["fend_id"] = me.newId ["trevision"][fields ["fend_id"]];
					await me.store.query ({session: me.session, sql: `
						update tview set fend_id = ${fields ["fend_id"]} where fid = ${fields ["fid"]} and fend_id = 0
					`});
					me.incCount ("tview", fields ["fid"]);
				}
			} else {
				fields ["fstart_id"] = me.newId ["trevision"][fields ["fstart_id"]];
				fields ["fend_id"] = me.newId ["trevision"][fields ["fend_id"]];
				
				let s = me.generateInsert ({table: "tview", fields});
				
				await me.store.query ({session: me.session, sql: s});
				me.incCount ("tview", fields ["fid"]);
			}
			bar.tick ();
		}
	};
	
	async importViewAttrs () {
		log.info ({fn: "importColumns"});
		
		let me = this;
		let s;
		let viewAttrFields = me.data.fields.tview_attr;
		let bar = new ProgressBar (`:current/:total, :elapsed sec.: :bar`, {total: me.data.tview_attr.length, renderThrottle: 200});
		
		for (let j = 0; j < me.data.tview_attr.length; j ++) {
			let viewAttr = me.data.tview_attr [j];
			let fields = {};
			let schemaId;
			
			for (let i = 0; i < viewAttrFields.length; i ++) {
				let field = viewAttrFields [i];
				let value = viewAttr.values [i];
				
				if (value != null) {
					if (field == "fid") {
						value = me.newId ["tview_attr"][value];
					} else
					if (field == "fview_id") {
						value = me.newId ["tview"][value];
					} else
					if (field == "fclass_id") {
						value = me.newId ["tclass"][value];
					} else
					if (field == "fclass_attr_id") {
						value = me.newId ["tclass_attr"][value];
					} else
					if (field == "fschema_id") {
						schemaId = value;
						value = me.newId ["tschema"][value];
					}
				}
				fields [field] = value;
			}
			if (me.startRevision [schemaId] == null || fields ["fstart_id"] < me.startRevision [schemaId]) {
				// Запись удалена
				if (me.startRevision [schemaId] != null && 
					fields ["fend_id"] != 0 &&
					fields ["fend_id"] >= me.startRevision [schemaId] &&
					fields ["fid"] !== undefined // Например когда запись одна и она удалена
				) {
					fields ["fend_id"] = me.newId ["trevision"][fields ["fend_id"]];
					
					await me.store.query ({session: me.session, sql: `
						update tview_attr set fend_id = ${fields ["fend_id"]} where fid = ${fields ["fid"]} and fend_id = 0
					`});
					me.incCount ("tview_attr", fields ["fid"]);
				}
			} else {
				fields ["fstart_id"] = me.newId ["trevision"][fields ["fstart_id"]];
				fields ["fend_id"] = me.newId ["trevision"][fields ["fend_id"]];
				
				s = me.generateInsert ({table: "tview_attr", fields});
				
				await me.store.query ({session: me.session, sql: s});
				me.incCount ("tview_attr", fields ["fid"]);
			}
			bar.tick ();
		}
	};
	
	async importClasses () {
		log.info ({fn: "importModels"});
		
		let me = this;
		let classFields = me.data.fields.tclass;
		let bar = new ProgressBar (`:current/:total, :elapsed sec.: :bar`, {total: me.data.tclass.length, renderThrottle: 200});
		
		for (let j = 0; j < me.data.tclass.length; j ++) {
			let cls = me.data.tclass [j];
			let fields = {};
			let schemaId;
			
			for (let i = 0; i < classFields.length; i ++) {
				let field = classFields [i];
				let value = cls.values [i];
				
				if (value != null) {
					if (field == "fid") {
						value = me.newId ["tclass"][value];
					} else
					if (field == "fparent_id") {
						// TODO: Надо учесть случай когда парент класс еще не импортировался
						value = me.newId ["tclass"][value];
					} else
					if (field == "fview_id") {
						value = me.newId ["tview"][value];
					} else
					if (field == "fschema_id") {
						schemaId = value;
						value = me.newId ["tschema"][value];
					}
				}
				fields [field] = value;
			}
			if (me.startRevision [schemaId] == null || fields ["fstart_id"] < me.startRevision [schemaId]) {
				// Запись удалена
				if (me.startRevision [schemaId] != null && 
					fields ["fend_id"] != 0 &&
					fields ["fend_id"] >= me.startRevision [schemaId] &&
					fields ["fid"] !== undefined // Например когда запись одна и она удалена
				) {
					fields ["fend_id"] = me.newId ["trevision"][fields ["fend_id"]];
					
					await me.store.query ({session: me.session, sql: `
						update tclass set fend_id = ${fields ["fend_id"]} where fid = ${fields ["fid"]} and fend_id = 0
					`});
					me.incCount ("tclass", fields ["fid"]);
				}
			} else {
				fields ["fstart_id"] = me.newId ["trevision"][fields ["fstart_id"]];
				fields ["fend_id"] = me.newId ["trevision"][fields ["fend_id"]];
				
				let s = me.generateInsert ({table: "tclass", fields});
				
				await me.store.query ({session: me.session, sql: s});
				me.incCount ("tclass", fields ["fid"]);
			}
			bar.tick ();
		}
	};
	
	async importClassAttrs () {
		log.info ({fn: "importProperties"});
		
		let me = this;
		let classAttrFields = me.data.fields.tclass_attr;
		let bar = new ProgressBar (`:current/:total, :elapsed sec.: :bar`, {total: me.data.tclass_attr.length, renderThrottle: 200});
		
		for (let j = 0; j < me.data.tclass_attr.length; j ++) {
			let classAttr = me.data.tclass_attr [j];
			let fields = {};
			let schemaId;
			
			for (let i = 0; i < classAttrFields.length; i ++) {
				let field = classAttrFields [i];
				let value = classAttr.values [i];
				
				if (value != null) {
					if (field == "fid") {
						value = me.newId ["tclass_attr"][value];
					} else
					if (field == "fclass_id") {
						value = me.newId ["tclass"][value];
					} else
					if (field == "ftype_id") {
						let typeId = value;
						
						if (typeId >= 1000) {
							let id = me.newId ["tclass"][typeId];
							
							value = id;
							me.classAttrType [fields ["fid"]] = id;
						} else {
							me.classAttrType [fields ["fid"]] = typeId;
						}
					} else
					if (field == "fschema_id") {
						schemaId = value;
						value = me.newId ["tschema"][value];
					}
				}
				fields [field] = value;
			}
			if (me.startRevision [schemaId] == null || fields ["fstart_id"] < me.startRevision [schemaId]) {
				// Запись удалена
				if (me.startRevision [schemaId] != null && 
					fields ["fend_id"] != 0 &&
					fields ["fend_id"] >= me.startRevision [schemaId] &&
					fields ["fid"] !== undefined // Например когда запись одна и она удалена
				) {
					fields ["fend_id"] = me.newId ["trevision"][fields ["fend_id"]];
					
					await me.store.query ({session: me.session, sql: `
						update tclass_attr set fend_id = ${fields ["fend_id"]} where fid = ${fields ["fid"]} and fend_id = 0
					`});
					me.incCount ("tclass_attr", fields ["fid"]);
				}
			} else {
				fields ["fstart_id"] = me.newId ["trevision"][fields ["fstart_id"]];
				fields ["fend_id"] = me.newId ["trevision"][fields ["fend_id"]];
				
				let s = me.generateInsert ({table: "tclass_attr", fields});
				
				await me.store.query ({session: me.session, sql: s});
				me.incCount ("tclass_attr", fields ["fid"]);
			}
			bar.tick ();
		}
	};
	
	async importActions () {
		log.debug ({fn: "importActions"});
		
		let me = this;
		let actionFields = me.data.fields.taction;
		
		for (let j = 0; j < me.data.taction.length; j ++) {
			let action = me.data.taction [j];
			let fields = [];
			let schemaId;
			
			for (let i = 0; i < actionFields.length; i ++) {
				let field = actionFields [i];
				let value = action.values [i];
				
				if (value != null) {
					if (field == "fid") {
						value = me.newId ["taction"][value];
					} else
					if (field == "fclass_id") {
						value = me.newId ["tclass"][value];
					} else
					if (field == "fschema_id") {
						schemaId = value;
						value = me.newId ["tschema"][value];
					}
				}
				fields [field] = value;
			}
			if (me.startRevision [schemaId] == null || fields ["fstart_id"] < me.startRevision [schemaId]) {
				// Запись удалена
				if (me.startRevision [schemaId] != null && 
					fields ["fend_id"] != 0 &&
					fields ["fend_id"] >= me.startRevision [schemaId] &&
					fields ["fid"] !== undefined // Например когда запись одна и она удалена
				) {
					fields ["fend_id"] = me.newId ["trevision"][fields ["fend_id"]];
					
					await me.store.query ({session: me.session, sql: `
						update taction set fend_id = ${fields ["fend_id"]} where fid = ${fields ["fid"]} and fend_id = 0
					`});
					me.incCount ("taction", fields ["fid"]);
				}
			} else {
				fields ["fstart_id"] = me.newId ["trevision"][fields ["fstart_id"]];
				fields ["fend_id"] = me.newId ["trevision"][fields ["fend_id"]];
				
				let s = me.generateInsert ({table: "taction", fields});
				
				await me.store.query ({session: me.session, sql: s});
				me.incCount ("taction", fields ["fid"]);
			}
		}
	};
	
	async importObjects () {
		log.info ({fn: "importRecords"});
		
		let me = this;
		let objectFields = me.data.fields.tobject;
		let bar = new ProgressBar (`:current/:total, :elapsed sec.: :bar`, {total: me.data.tobject.length, renderThrottle: 200});
		
		for (let j = 0; j < me.data.tobject.length; j ++) {
			let object = me.data.tobject [j];
			let fields = {};
			let schemaId;
			
			for (let i = 0; i < objectFields.length; i ++) {
				let field = objectFields [i];
				let value = object.values [i];
				
				if (value != null) {
					if (field == "fid") {
						value = me.newId ["tobject"][value];
					} else
					if (field == "fclass_id") {
						value = me.newId ["tclass"][value];
					} else
					if (field == "fschema_id") {
						schemaId = value;
						value = me.newId ["tschema"][value];
					}
				}
				fields [field] = value;
			}
			if (fields ["fclass_id"] != "0") {
				if (me.startRevision [schemaId] == null || fields ["fstart_id"] < me.startRevision [schemaId]) {
					// Запись удалена
					if (me.startRevision [schemaId] != null && 
						fields ["fend_id"] != 0 &&
						fields ["fend_id"] >= me.startRevision [schemaId] &&
						fields ["fid"] !== undefined // Например когда запись одна и она удалена
					) {
						fields ["fend_id"] = me.newId ["trevision"][fields ["fend_id"]];
						
						me.removedObjects [fields ["fclass_id"]] = me.removedObjects [fields ["fclass_id"]] || [];
						me.removedObjects [fields ["fclass_id"]].push (fields ["fid"]);
						
						await me.store.query ({session: me.session, sql: `
							update tobject set fend_id = ${fields ["fend_id"]} where fid = ${fields ["fid"]} and fend_id = 0
						`});
						me.incCount ("tobject", fields ["fid"]);
					}
				} else {
					fields ["fstart_id"] = me.newId ["trevision"][fields ["fstart_id"]];
					fields ["fend_id"] = me.newId ["trevision"][fields ["fend_id"]];
					
					await me.dropClassConstraints (fields ["fclass_id"]);
					
					let s = me.generateInsert ({table: "tobject", fields});
					
					await me.store.query ({session: me.session, sql: s});
					me.incCount ("tobject", fields ["fid"]);
				}
			}
			bar.tick ();
		}
	};
	
	// Восстанавливает удаленный объект
	async restoreObject (id, cMap, caMap) {
		let me = this;
		let recs = await me.store.query ({session: me.session, sql: `select fclass_id, fstart_id, fschema_id, frecord_id from tobject where fid=${id}`})
		let rec = recs [0];
		let cls = cMap [rec.fclass_id];
		
		await me.store.query ({session: me.session, sql: `update tobject set fend_id=0 where fid=${id}`})
		await me.store.query ({
			session: me.session,
			sql: `insert into _object (fid, fclass_id, fstart_id, fschema_id, frecord_id) values (${id}, ${rec.fclass_id}, ${rec.fstart_id}, ${rec.fschema_id}, ${rec.frecord_id})`
		});
		recs = await me.store.query ({session: me.session, sql: `select * from tobject_attr where fobject_id=${id} and fend_id=0`})
		
		let insertTOC = async (cls, originalCls) => {
			if (cls.fparent_id) {
				await insertTOC (cMap [cls.fparent_id], originalCls);
			}
			let table = `${cls.fcode}_${cls.fid}`;
			let sql = `insert into ${table} (fobject_id, fclass_id`, params = [id, originalCls.fid];
			
			recs.forEach (rec => {
				let ca = caMap [rec.fclass_attr_id];
				
				if (ca.fclass_id != cls.fid) {
					return;
				}
				let f = "fnumber";
				
				if (ca.ftype_id == 1 || ca.ftype_id == 5) {
					f = "fstring";
				}
				if (ca.ftype_id == 3) {
					f = "ftime";
				}
				sql += `, ${ca.fcode}_${ca.fid}`;
				params.push (rec [f]);
			});
			sql += ") values (";
			
			params.forEach ((p, i) => {
				if (i) {
					sql += ", ";
				}
				sql += "$" + (i + 1);
			});
			sql += ")";
			await me.store.query ({session: me.session, sql, params});
		};
		await insertTOC (cls, cls);
		me.incCount ("restoredRecords");
	};
	
	async importObjectAttrs () {
		log.info ({fn: "importRecordData"});
		
		let me = this;
		let objectAttrFields = me.data.fields.tobject_attr;
		let bar = new ProgressBar (`:current/:total, :elapsed sec.: :bar`, {total: me.data.tobject_attr.length, renderThrottle: 200});
		
		let cMap = {}, cRecs = await me.store.query ({session: me.session, sql: "select fid, fcode, fparent_id from _class"});
		let caMap = {}, caRecs = await me.store.query ({session: me.session, sql: `
			select
				a.fid, a.fcode, a.ftype_id, a.fclass_id, a.fnot_null, a.ftype_id, b.fcode as class_code
			from
				_class_attr a
				inner join _class b on (a.fclass_id = b.fid)
		`});
		let objectMap = {}, objectRecs = await me.store.query ({session: me.session, sql: "select fid from tobject where fend_id=0"});
		let restoreMap = {};
		
		cRecs.forEach (rec => cMap [rec.fid] = rec);
		caRecs.forEach (rec => caMap [rec.fid] = rec);
		objectRecs.forEach (rec => objectMap [rec.fid] = rec);
		
		for (let j = 0; j < me.data.tobject_attr.length; j ++) {
			let objectAttr = me.data.tobject_attr [j];
			let fields = {};
			let schemaId;
			let typeId = 0;
			
			for (let i = 0; i < objectAttrFields.length; i ++) {
				let field = objectAttrFields [i];
				let value = objectAttr.values [i];
				
				if (value != null) {
					if (field == "fid") {
						value = me.newId ["tobject_attr"][value];
					} else
					if (field == "fclass_attr_id") {
						let classAttrId = me.newId ["tclass_attr"][value];
						
						value = classAttrId;
						typeId = me.classAttrType [classAttrId];
					} else
					if (field == "fobject_id") {
						value = me.newId ["tobject"][value];
					} else
					if (field == "fschema_id") {
						schemaId = value;
						value = me.newId ["tschema"][value];
					} else
					if (field == "fnumber") {
						if (typeId >= 1000 || typeId == 12) {
							value = me.newId ["tobject"][value];
						}
						if (typeId == 6) {
							value = me.newId ["tclass"][value];
						}
						if (typeId == 7) {
							value = me.newId ["tclass_attr"][value];
						}
						if (typeId == 8) {
							value = me.newId ["tview"][value];
						}
						if (typeId == 9) {
							value = me.newId ["tview_attr"][value];
						}
						if (typeId == 10) {
							value = me.newId ["taction"][value];
						}
						if (typeId == 13) {
							value = me.newId ["tobject_attr"][value];
						}
					} else
					if (field != "fstart_id" && field != "fend_id") {
						if (value == undefined) {
							// Ссылка на неактуальный объект
							value = null;
						}
					}
				}
				fields [field] = value;
			}
			if (typeId) {
				if (me.startRevision [schemaId] == null || fields ["fstart_id"] < me.startRevision [schemaId]) {
					// Запись удалена
					if (me.startRevision [schemaId] != null && 
						fields ["fend_id"] != 0 &&
						fields ["fend_id"] >= me.startRevision [schemaId] &&
						fields ["fid"] !== undefined // Например когда запись одна и она удалена
					) {
						fields ["fend_id"] = me.newId ["trevision"][fields ["fend_id"]];
						
						await me.store.query ({session: me.session, sql: `
							update tobject_attr set fend_id = ${fields ["fend_id"]} where fid = ${fields ["fid"]} and fend_id = 0
						`});
						me.incCount ("tobject_attr", fields ["fid"]);
					}
				} else {
					fields ["fstart_id"] = me.newId ["trevision"][fields ["fstart_id"]];
					fields ["fend_id"] = me.newId ["trevision"][fields ["fend_id"]];
					
					//if (typeId >= 1000 && fields ["fend_id"] == 0 && fields ["fnumber"] && !objectMap [fields ["fnumber"]]) {
					if (typeId >= 1000 && fields ["fnumber"]) {
						/*
							Обработка:
								Для существующих объектов objectMap [fields ["fobject_id"]]
								Для удаленных объектов fields ["fnumber"]
							Ссылка добавляется:
								Добавить в массив fields ["fobject_id"]
							Ссылка удаляется:
								Убрать из массива fields ["fobject_id"]
							Восстановление:
								Если в массиве есть элементы
						 */
						// Объект удалили, надо восстановить
						
/*
						if (fields ["fend_id"] == 0) {
							if (!objectMap [fields ["fnumber"]]) {
								restoreMap [fields ["fnumber"]] = restoreMap [fields ["fnumber"]] || 0;
								restoreMap [fields ["fnumber"]] ++;
							}
						} else {
							if (restoreMap [fields ["fnumber"]]) {
								restoreMap [fields ["fnumber"]] --;
							}
						}
*/
						if (objectMap [fields ["fobject_id"]] && !objectMap [fields ["fnumber"]]) {
							if (fields ["fend_id"] == 0) {
								restoreMap [fields ["fnumber"]] = restoreMap [fields ["fnumber"]] || {};
								restoreMap [fields ["fnumber"]][fields ["fobject_id"]] = true;
								
								await me.dropClassAttrConstraints (caMap [fields ["fclass_attr_id"]]);
							} else {
								if (restoreMap [fields ["fnumber"]] && restoreMap [fields ["fnumber"]][fields ["fobject_id"]]) {
									delete restoreMap [fields ["fnumber"]][fields ["fobject_id"]];
								}
							}
						}
					}
					let s = me.generateInsert ({table: caMap [fields ["fclass_attr_id"]] ? ("tobject_attr_" + fields ["fclass_attr_id"]) : "tobject_attr", fields});
					
					await me.store.query ({session: me.session, sql: s});
					
					// update TOC
/*
					let caRec = caMap [fields ["fclass_attr_id"]];
					
					if (caRec) {
						let cRec = cMap [caRec.fclass_id];
						let {sql, params} = me.generateUpdate ({
							table: `${cRec.fcode}_${cRec.fid}`,
							fields: {
								[`${caRec.fcode}_${caRec.fid}`]: fields ["fstring"] || fields ["ftime"] || fields ["fnumber"]
							},
							where: `fobject_id=${fields ["fobject_id"]}`
						});
						await me.store.query ({session: me.session, sql, params});
					}
*/
					me.incCount ("tobject_attr", fields ["fid"]);
				}
			}
			bar.tick ();
		}
		/*
				let restoreId = [];

				_.each (restoreMap, (o, id) => {
					if (!_.isEmpty (o)) {
						restoreId.push (id);
					}
				});
				if (restoreId.length) {
					log.info ({fn: "restoreRecords", restoreId});

					let bar = new ProgressBar (`:current/:total, :elapsed sec.: :bar`, {total: restoreId.length, renderThrottle: 200});

					for (let i = 0; i < restoreId.length; i ++) {
						await me.restoreObject (restoreId [i], cMap, caMap);
						bar.tick ();
					}
				}
		*/
	};
	
	async createSchema ({code}) {
		let me = this;
		let qr = await me.store.query ({session: me.session, sql: `select fid from tschema where fcode = '${code}'`});

		if (qr.length == 0) {
			let nextId = null;
			
			let qr = await me.store.query ({session: me.session, sql: "select max (fid) as fid from tschema"});

			if (qr.length) {
				nextId = qr [0].fid + 1;
			}
			if (nextId == null) {
				nextId = 1;
			}
			await me.store.query ({session: me.session, sql: `insert into tschema (fid, fcode) values (${nextId}, '${code}')`});
			return nextId;
		} else {
			return qr [0].fid;
		}
	};
	
	async getSchemaId ({code}) {
		let me = this;
		let r = await me.store.query ({session: me.session, sql: `select fid from tschema where fcode = '${code}'`});

		if (r.length > 0) {
			return r [0].fid;
		} else {
			return null;
		}
	};
	
	// TODO: Получение карты соответствия schemaId, recordId и localId
	async getNewId () {
		log.info ({fn: "getNewId"});
		
		let me = this;
		
		for (let i = 0; i < me.data.tschema.length; i ++) {
			let schema = me.data.tschema [i];

			let schemaId = await me.getSchemaId ({code: schema.values [3]});

			if (schemaId) {
				let tables = ["tclass", "tclass_attr", "tview", "tview_attr", "taction", "tobject", "tobject_attr", "trevision"];
				
				for (let l = 0; l < tables.length; l ++) {
					let table = tables [l];
					let schemaColId = me.data.fields [table].indexOf ("fschema_id");
					let recordColId = me.data.fields [table].indexOf ("frecord_id");
					
					if (schemaColId != -1) {
						let qr = await me.store.query ({session: me.session, sql: `
							select distinct (frecord_id) as frecord_id, fid from ${table} where frecord_id is not null and fschema_id = ${schemaId}
						`});
						let data = me.data [table];
						let map = {};
						
						for (let k = 0; k < data.length; k ++) {
							if (schema.values [0] == data [k].values [schemaColId]) {
								map [data [k].values [recordColId]] = data [k].values [0];
							}
						}
						for (let j = 0; j < qr.length; j ++) {
							let recordId = qr [j].frecord_id;
							
							/*
							for (let k = 0; k < data.length; k ++) {
								if (schema.values [0] != data [k].values [schemaColId]) {
									continue;
								}
								if (recordId != data [k].values [recordColId]) {
									continue;
								}
								me.newId [table] [data [k].values [0]] = qr [j].fid;
							}
							*/
							me.newId [table] [map [recordId]] = qr [j].fid;
						}
					}
				}
			}
		}
	};
	
	async importRevisions () {
		log.info ({fn: "importRevisions"});
		
		let me = this;
		let revisionFields = me.data.fields.trevision;
		let schemaColId = revisionFields.indexOf ("fschema_id");
		let bar = new ProgressBar (`:current/:total, :elapsed sec.: :bar`, {total: me.data.trevision.length, renderThrottle: 200});
		
		for (let j = 0; j < me.data.trevision.length; j ++) {
			bar.tick ();
			
			let revision = me.data.trevision [j];
			let schemaId = revision.values [schemaColId];
			
			// Эта ревизия уже есть
			if (me.newId ["trevision"][revision.values [0]]) {
				// 2017-07-13 ros
				me.startRevision [schemaId] = null;
				continue;
			}
			if (!me.startRevision [schemaId]) {
				me.startRevision [schemaId] = revision.values [0];
				
				if (!me.startRevisionMin || me.startRevisionMin > me.startRevision [schemaId]) {
					me.startRevisionMin = me.startRevision [schemaId];
				}
			}
			let fields = {};
			let id;
			
			for (let i = 0; i < revisionFields.length; i ++) {
				let field = revisionFields [i];
				let value = revision.values [i];
				
				if (value != null) {
					if (field == "fid") {
						id = value;
						value = me.tableId ["trevision"];
					} else
					if (field == "fschema_id") {
						value = me.newId ["tschema"][value];
					}
				}
				fields [field] = value;
			}
			let s = me.generateInsert ({table: "trevision", fields});
			
			await me.store.query ({session: me.session, sql: s});
			
			me.incCount ("trevision", fields ["fid"]);
			me.newId ["trevision"][id] = me.tableId ["trevision"];
			me.tableId ["trevision"] ++;
		}
		_.each (me.startRevision, function (revisionId, schemaId) {
			log.info ({fn: "importRevisions"}, "startRevision [" + schemaId + "] = " + revisionId + " ");
		});
		me.newId ["trevision"][2147483647] = 0;
		me.newId ["trevision"][0] = 0;
	};
	
	async importSchemas () {
		log.info ({fn: "importSchemas"});
		
		let me = this;
		let schemaFields = me.data.fields.tschema;
		
		this.startRevision = {};
		
		for (let j = 0; j < me.data.tschema.length; j ++) {
			let schema = me.data.tschema [j];
			
			me.startRevision [schema.values [0]] = null;
			
			for (let i = 0; i < schemaFields.length; i ++) {
				let field = schemaFields [i];
				let value = schema.values [i];
				
				if (value != null && field == "fcode") {
					me.newId ["tschema"][schema.values [0]] = await me.createSchema ({code: value});
					break;
				}
			}
		}
	};
	
	generateNewId () {
		log.info ({fn: "generateNewId"});
		
		let me = this;
		let tables = ["tclass", "tclass_attr", "tview", "tview_attr", "taction", "tobject", "tobject_attr"];
		
		for (let j = 0; j < tables.length; j ++) {
			let t = tables [j];
			
			if (!me.data [t]) {
				continue;
			}
			for (let i = 0; i < me.data [t].length; i ++) {
				let fields = {};
				
				for (let k = 0; k < me.data.fields [t].length; k ++) {
					let field = me.data.fields [t][k];
					let value = me.data [t][i].values [k];
					
					fields [field] = value;
				}
				if (me.schema && (me.startRevision [fields ["fschema_id"]] == null || fields ["fstart_id"] < me.startRevision [fields ["fschema_id"]])) {
					continue;
				}
				if (!me.newId [t][fields ["fid"]]) {
					me.newId [t][fields ["fid"]] = me.tableId [t];
					me.tableId [t] ++;
				}
			}
		}
	};
	
	async updateTriggers () {
		log.info ({fn: "updateTriggers"});
		
		let me = this;
		let rows = await me.store.query ({session: me.session, sql: "select fid from _class"});
		let bar = new ProgressBar (`:current/:total, :elapsed sec.: :bar`, {total: rows.length, renderThrottle: 200});
		
		for (let i = 0; i < rows.length; i ++) {
			await me.store.query ({session: me.session, sql: `select trigger_factory (${rows [i].fid})`});
			bar.tick ();
		}
	};
	
	async dropClassAttrConstraints (ca) {
		let me = this;
		
		if (me.droppedClassAttrConstraints [ca.fid]) {
			return;
		}
		let tableName = ca.class_code + "_" + ca.fclass_id;
		let fieldName = ca.fcode + "_" + ca.fid;
		
		if (ca.ftype_id >= 1000) {
			await me.store.query ({session: me.session, sql: `alter table ${tableName} drop constraint ${tableName}_${fieldName}_fk`});
		}
		if (ca.fnot_null == 1) {
			await me.store.query ({session: me.session, sql: `alter table ${tableName} alter column ${fieldName} drop not null`});
		}
		me.droppedClassAttrConstraints [ca.fid] = true;
	};
	
	async dropClassConstraints (classId) {
		let me = this;
		
		if (me.droppedClassConstraints [classId]) {
			return;
		}
		let recs = await me.store.query ({session: me.session, sql: `
			select
				a.fcode, a.fid, b.fcode as class_code, a.fclass_id, a.ftype_id, a.fnot_null
			from
				_class_attr a
				inner join _class b on (a.fclass_id = b.fid)
			where
				a.fclass_id = ${classId} and (a.fnot_null = 1 or a.ftype_id >= 1000)
		`});
		for (let i = 0; i < recs.length; i ++) {
			await me.dropClassAttrConstraints (recs [i]);
		}
		me.droppedClassConstraints [classId] = true;
	};
	
/*
	async fixRefs () {
		log.info ({fn: "fixRefs"});
		
		let me = this;
		
		if (!_.keys (me.removedObjects).length) {
			return;
		}
		let sql = `
			select
				a.fcode as ca_code,
				a.fid as ca_id,
				b.fcode as c_code,
				b.fid as c_id,
				a.ftype_id as type_id,
				a.fremove_rule as remove_rule
			from
				_class_attr a
				inner join _class b on (a.fclass_id = b.fid)
			where
				a.ftype_id in (${_.keys (me.removedObjects).join (",")})
		`;
		let rows = await me.store.query ({session: me.session, sql});
		let bar = new ProgressBar (`:current/:total, :elapsed sec.: :bar`, {total: rows.length, renderThrottle: 200});
		
		for (let i = 0; i < rows.length; i ++) {
			let row = rows [i];
			let tableName = row.c_code + "_" + row.c_id;
			let fieldName = row.ca_code + "_" + row.ca_id;
			let recs = await me.store.query ({session: me.session, sql: `select fobject_id from ${tableName} where ${fieldName} in (${me.removedObjects [row.type_id]})`});
			
			if (recs.length) {
				let objects = recs.map (rec => rec.fobject_id);
				
				if (row.remove_rule == "cascade") {
					log.info (`delete: ${objects}`);
					await me.store.query ({
						session: me.session,
						sql: `update tobject set fend_id = ${me.store.revision [me.session.id]} where fclass_id = ${row.c_id} and fend_id = 0 and fid in (${objects})`
					});
				} else {
					log.info (`set null: ${objects}`);
					await me.store.query ({
						session: me.session,
						sql: `update tobject_attr set fnumber = null, fend_id = ${me.store.revision [me.session.id]} where fclass_attr_id = ${row.ca_id} and fend_id = 0 and fobject_id in (${objects})`
					});
				}
			}
			bar.tick ();
		}
	};
*/

	async restoreConstraints () {
		log.info ({fn: "restoreConstraints"});
		
		let me = this;
		
		if (!_.keys (me.droppedClassAttrConstraints).length) {
			return;
		}
		let rows = await me.store.query ({session: me.session, sql: `
			select
				a.fcode as ca_code,
				a.fid as ca_id,
				b.fcode as c_code,
				b.fid as c_id,
				a.ftype_id as type_id,
				a.fremove_rule as remove_rule,
				a.fnot_null as not_null,
				c.fcode as ref_code
			from
				_class_attr a
				inner join _class b on (a.fclass_id = b.fid)
				left join _class c on (a.ftype_id = c.fid)
			where
				a.fid in (${_.keys (me.droppedClassAttrConstraints).join (",")}) and (a.fnot_null = 1 or a.ftype_id >= 1000)
		`});
		let prepareBar = new ProgressBar (`:current/:total, :elapsed sec.: :bar`, {total: rows.length, renderThrottle: 200});
		
		for (let i = 0; i < rows.length; i ++) {
			let row = rows [i];
			let tableName = row.c_code + "_" + row.c_id;
			let fieldName = row.ca_code + "_" + row.ca_id;
			
			if (row.type_id >= 1000) {
				let refTable = `${row.ref_code}_${row.type_id}`;
				let invalidRows = await me.store.query ({session: me.session, sql: `select * from ${tableName} where ${fieldName} not in (select fobject_id from ${refTable})`});

				if (invalidRows.length) {
					let ids = invalidRows.map (row => row.fobject_id);

					if (row.not_null == 1) {
						log.info ({table: tableName, field: fieldName, refTable, rows: ids}, `delete rows`);
						fs.writeFileSync (`importDelete-t-${tableName}-f-${fieldName}-r-${refTable}.json`, JSON.stringify (invalidRows));
						await me.store.query ({
							session: me.session,
							sql: `update tobject set fend_id = ${me.store.revision [me.session.id]} where fclass_id = ${row.c_id} and fend_id = 0 and fid in (${ids})`
						});
						await me.store.query ({session: me.session, sql: `delete from ${tableName} where fobject_id in (${ids})`});
					} else {
						log.info ({table: tableName, field: fieldName, refTable, rows: ids}, `set null rows`);
						fs.writeFileSync (`importSetNull-t-${tableName}-f-${fieldName}-r-${refTable}.json`, JSON.stringify (invalidRows));
						await me.store.query ({
							session: me.session,
							sql: `update tobject_attr set fnumber = null, fend_id = ${me.store.revision [me.session.id]} where fclass_attr_id = ${row.ca_id} and fend_id = 0 and fobject_id in (${ids})`
						});
						await me.store.query ({session: me.session, sql: `update ${tableName} set ${fieldName} = null where fobject_id in (${ids})`});
					}
				}
			}
			prepareBar.tick ();
		}
		let bar = new ProgressBar (`:current/:total, :elapsed sec.: :bar`, {total: rows.length, renderThrottle: 200});

		for (let i = 0; i < rows.length; i ++) {
			let row = rows [i];
			let tableName = row.c_code + "_" + row.c_id;
			let fieldName = row.ca_code + "_" + row.ca_id;

			if (row.type_id >= 1000) {
				let removeRule = "set null";

				if (row.remove_rule == "cascade") {
					removeRule = "cascade";
				}
				if (row.remove_rule == "set null") {
					removeRule = "set null";
				}
				// legacy
				if (row.remove_rule == "no action") {
					removeRule = "";
				}
				let refTable = `${row.ref_code}_${row.type_id}`;
				await me.store.query ({session: me.session, sql: `alter table ${tableName} add constraint ${tableName}_${fieldName}_fk foreign key (${fieldName}) references ${refTable} (fobject_id) on delete ${removeRule}`});
			}
			if (row.not_null == 1) {
				await me.store.query ({session: me.session, sql: `alter table ${tableName} alter column ${fieldName} set not null`});
			}
			bar.tick ();
		}
	};

	parseDates (list) {
		log.debug ({fn: "parseDates"});
		
		list.forEach (row => {
			row.values.forEach ((v, i) => {
				if (v && v.type) {
					if (v.type == "date") {
						let tokens = v.value.split ("-");
						
						row.values [i] = new Date (tokens [0], tokens [1] - 1, tokens [2]);
					}
					if (v.type == "datetime") {
						row.values [i] = new Date (Date.parse (v.value));
					}
				}
			});
		});
	};
	
	// _class.fstart_id, _class_attr.fstart_id, _view.fstart_id, _view_attr.fstart_id from file
/*
	async updateMetaStartId () {
		log.info ({fn: "import.updateMetaStartId"});
		
		let me = this;
		let metas = ["class", "class_attr", "view", "view_attr"];
		
		for (let i = 0; i < metas.length; i ++) {
			let meta = metas [i];
			let startId = {};
			let fields = me.data.fields ["t" + meta];
			let idIdx = fields.indexOf ("fid");
			let startIdx = fields.indexOf ("fstart_id");
			let endIdx = fields.indexOf ("fend_id");
			
			for (let j = 0; j < me.data ["t" + meta].length; j ++) {
				let o = me.data ["t" + meta][j];
				
				if (o.values [endIdx] == 0) {
					if (!me.newId ["trevision"][o.values [startIdx]]) {
						throw new Error (`unknown revision: ${o.values [startIdx]}, ${meta}: ${o.values [idIdx]}`);
					}
					startId [o.values [idIdx]] = me.newId ["trevision"][o.values [startIdx]];
				}
			}
			let rows = await me.store.query ({session: me.session, sql: `select fid, fstart_id from _${meta}`});
			
			for (let k = 0; k < rows.length; k ++) {
				let row = rows [k];
				
				if (row.fstart_id && startId [row.fid] && row.fstart_id < startId [row.fid]) {
					let sql = `update _${meta} set fstart_id = ${startId [row.fid]} where fid = ${row.fid}`;
					
					await me.store.query ({session: me.session, sql});
					log.debug (`preload: ${sql}`);
				}
			}
		}
	};
*/

	async updateMetaStartId () {
		log.info ({fn: "updateMetaStartId"});
		
		let me = this;
		let metas = ["class", "class_attr", "view", "view_attr"];
		
		for (let i = 0; i < metas.length; i ++) {
			let meta = metas [i];
			let startId = {};
			let fields = me.data.fields ["t" + meta];
			let idIdx = fields.indexOf ("fid");
			let startIdx = fields.indexOf ("fstart_id");
			let endIdx = fields.indexOf ("fend_id");
			
			for (let j = 0; j < me.data ["t" + meta].length; j ++) {
				let o = me.data ["t" + meta][j];
				
				if (o.values [endIdx] == 0) {
					if (!me.newId ["trevision"][o.values [startIdx]]) {
						throw new Error (`unknown revision: ${o.values [startIdx]}, ${meta}: ${o.values [idIdx]}`);
					}
					startId [me.newId ["t" + meta][o.values [idIdx]]] = me.newId ["trevision"][o.values [startIdx]];
				}
			}
			let rows = await me.store.query ({session: me.session, sql: `select fid, fstart_id from _${meta}`});
			
			for (let k = 0; k < rows.length; k ++) {
				let row = rows [k];
				
				if (row.fstart_id && startId [row.fid] && row.fstart_id < startId [row.fid]) {
					let sql = `update _${meta} set fstart_id = ${startId [row.fid]} where fid = ${row.fid}`;
					
					await me.store.query ({session: me.session, sql});
					log.debug (`preload: ${sql}`);
				}
			}
		}
	};
	
	async importFromFile ({code, file}) {
		log.info ({fn: "importFromFile"});
		
		let me = this;
		let session = {
			id: "import_" + code,
			username: "admin",
			userId: null
		};
		me.session = session;
		me.count.tclass = 0;
		me.count.tclass_attr = 0;
		me.count.tview = 0;
		me.count.tview_attr = 0;
		me.count.taction = 0;
		me.count.tobject = 0;
		me.count.tobject_attr = 0;
		me.count.trevision = 0;
		me.count.restoredRecords = 0;

		if (file == "schema-objectum.json") {
			file = `${__dirname}/schema/${file}`;
		}
		try {
			fs_access (file);
		} catch (err) {
			throw err;
		}
		try {
			let fileText = await fs_readFile (file);
			me.data = JSON.parse (fileText);
			me.data.tschema = _.filter (me.data.tschema, rec => {
				if (rec.values [2] != "objectum_version") {
					return true;
				}
			});
			log.debug ({fn: "importFromFile"}, "loadConfig");
			
			const {loadConfig} = require ("./project");
			
			await loadConfig ({code});
			
			me.store = new Store ({code, connection: config.stores [code]});
			await me.store.init ();
			
			let _classExists = await me.store.client.isTableExists ({session, table: "_class"});
			
			if (!_classExists) {
				throw new Error ("please rebuild store.");
			}
			log.debug ({fn: "importFromFile"}, "startTransaction");
			
			await me.store.startTransaction ({session, remoteAddr: "127.0.0.1", description: "import_" + code});
			await me.store.query ({session, sql: "select set_config ('objectum.revision_id', '0', True)"});
			await me.getSequences ();
			
			let r = await me.store.query ({session, sql: "select fcode from tschema"});
			
			for (let i = 0; i < r.length; i++) {
				if (!r [i].fcode || r [i].fcode == "undefined") {
					throw new Error ("schema undefined.");
				}
			}
			me.parseDates (me.data.trevision);
			me.parseDates (me.data.tobject_attr);
			
			await me.getNewId ();
			await me.importSchemas ();
			await me.importRevisions ();
			
			me.generateNewId ();
			
			await me.updateMetaStartId ();
			
			await me.importViews ();
			await me.importViewAttrs ();
			await me.importClasses ();
			await me.importClassAttrs (); // not null constraints
			await me.importActions ();
			
			me.droppedClassConstraints = {};
			me.droppedClassAttrConstraints = {};
			me.removedObjects = {};
			
			await me.importObjects ();
			await me.importObjectAttrs ();
			
			//await me.fixRefs ();
			await me.restoreConstraints ();
			
			await me.store.query ({session, sql: "delete from _log"});
			await me.store.query ({session, sql: `select set_config ('objectum.revision_id', '${me.store.revision [session.id]}', True)`});
			await me.updateTriggers ();
			await me.store.commitTransaction ({session});
			await me.store.client.updateSequences ();
			
			let count = {}, rscMap = {"tclass": "model", "tclass_attr": "property", "tview": "query", "tview_attr": "column", "tobject": "record", "tobject_attr": "record data", "trevision": "revision", "tschema": "schema", "taction": "action"};
			
			_.each (me.count, (v, a) => {
				count [rscMap [a] || a] = me.count [a];
			});
			log.info ({count});
			
			let redisClient = redis.createClient (config.redis.port, config.redis.host);
			
			redisClient.del (code + "-objects");
			redisClient.quit ();
			await me.store.end ();
		} catch (err) {
			await me.store.rollbackTransaction ({session});
			throw err;
		}
	}
};

module.exports = {
	Import
};
