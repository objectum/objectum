"use strict"

const _ = require ("lodash");
const fs = require ("fs");
const util = require ("util");
const fs_readFile = util.promisify (fs.readFile);
const fs_access = util.promisify (fs.access);
const common = require ("./common");
const { Store } = require ("./store");
const { getMetaCode, getFields } = require ("./map");

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
			tclass: 0, tclass_attr: 0, tview: 0, tview_attr: 0, taction: 0, tobject: 0, tobject_attr: 0, trevision: 0
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
	
	incCount (table, id) {
		this.count [table] ++;
	}
	
	async importViews () {
		log.info ({fn: "import.importViews"});
		
		let me = this;
		let viewFields = me.data.fields.tview;
		
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
		}
	};
	
	async importViewAttrs () {
		log.info ({fn: "import.importViewAttrs"});
		
		let me = this;
		let s;
		let viewAttrFields = me.data.fields.tview_attr;
		
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
		}
	};
	
	async importClasses () {
		log.info ({fn: "import.importClasses"});
		
		let me = this;
		let classFields = me.data.fields.tclass;
		
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
		}
	};
	
	async importClassAttrs () {
		log.info ({fn: "import.importClassAttrs"});
		
		let me = this;
		let classAttrFields = me.data.fields.tclass_attr;
		
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
		}
	};
	
	async importActions () {
		log.info ({fn: "import.importActions"});
		
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
		log.info ({fn: "import.importObjects"});
		
		let me = this;
		let objectFields = me.data.fields.tobject;
		let count = 0;
		
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
						
						await me.store.query ({session: me.session, sql: `
							update tobject set fend_id = ${fields ["fend_id"]} where fid = ${fields ["fid"]} and fend_id = 0
						`});
						me.incCount ("tobject", fields ["fid"]);
					}
				} else {
					fields ["fstart_id"] = me.newId ["trevision"][fields ["fstart_id"]];
					fields ["fend_id"] = me.newId ["trevision"][fields ["fend_id"]];
					
					await me.dropConstraints (fields ["fclass_id"]);
					
					let s = me.generateInsert ({table: "tobject", fields});
					
					await me.store.query ({session: me.session, sql: s});
					me.incCount ("tobject", fields ["fid"]);
					count ++;
					
					if (count % 10000 == 0) {
						log.info ({fn: "import.importObjects"}, "\t" + count + " records");
					}
				}
			}
		}
	};
	
	async importObjectAttrs () {
		log.info ({fn: "import.importObjectAttrs"});
		
		let me = this;
		let objectAttrFields = me.data.fields.tobject_attr;
		let count = 0;
		
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
					
					let s = me.generateInsert ({table: "tobject_attr", fields});
					
					await me.store.query ({session: me.session, sql: s});
					me.incCount ("tobject_attr", fields ["fid"]);
					count++;
					
					if (count % 10000 == 0) {
						log.info ({fn: "import.importObjectAttrs"}, "\t" + count + " records");
					}
				}
			}
		}
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
		log.info ({fn: "import.getNewId"});
		
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
							
							for (let k = 0; k < data.length; k ++) {
/*
								if (schema.values [0] != data [k].values [schemaColId]) {
									continue;
								}
								if (recordId != data [k].values [recordColId]) {
									continue;
								}
								me.newId [table] [data [k].values [0]] = qr [j].fid;
*/
								me.newId [table] [map [recordId]] = qr [j].fid;
							}
						}
					}
				}
			}
		}
	};
	
	async importRevisions () {
		log.info ({fn: "import.importRevisions"});
		
		let me = this;
		let revisionFields = me.data.fields.trevision;
		let schemaColId = revisionFields.indexOf ("fschema_id");
		
		for (let j = 0; j < me.data.trevision.length; j ++) {
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
			log.info ({fn: "import.importRevisions"}, "startRevision [" + schemaId + "] = " + revisionId + " ");
		});
		me.newId ["trevision"][2147483647] = 0;
		me.newId ["trevision"][0] = 0;
	};
	
	async importSchemas () {
		log.info ({fn: "import.importSchemas"});
		
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
		log.info ({fn: "import.generateNewId"});
		
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
		log.info ({fn: "import.updateTriggers"});
		
		let me = this;
		let rows = await me.store.query ({session: me.session, sql: "select fid from _class"});
		
		for (let i = 0; i < rows.length; i ++) {
			await me.store.query ({session: me.session, sql: `select trigger_factory (${rows [i].fid})`});
		}
	};
	
	async dropConstraints (classId) {
		let me = this;
		
		if (me.droppedClassesConstraints [classId]) {
			return;
		}
		let rows = await me.store.query ({session: me.session, sql: `
			select
				a.fcode as ca_code, a.fid as ca_id, b.fcode as c_code, b.fid as c_id
			from
				_class_attr a
				inner join _class b on (a.fclass_id = b.fid)
			where
				a.fclass_id = ${classId} and a.fnot_null = 1
		`});
		for (let i = 0; i < rows.length; i ++) {
			let row = rows [i];
			let tableName = row.c_code + "_" + row.c_id;
			let fieldName = row.ca_code + "_" + row.ca_id;
			
			await me.store.query ({session: me.session, sql: `alter table ${tableName} alter column ${fieldName} drop not null`});
		}
		me.droppedClassesConstraints [classId] = true;
	};
	
	async restoreConstraints () {
		log.info ({fn: "import.restoreConstraints"});
		
		let me = this;
		
		if (!_.keys (me.droppedClassesConstraints).length) {
			return;
		}
		let rows = await me.store.query ({session: me.session, sql: `
			select
				a.fcode as ca_code, a.fid as ca_id, b.fcode as c_code, b.fid as c_id
			from
				_class_attr a
				inner join _class b on (a.fclass_id = b.fid)
			where
				a.fclass_id in (${_.keys (me.droppedClassesConstraints).join (",")}) and a.fnot_null = 1
		`});
		for (let i = 0; i < rows.length; i ++) {
			let row = rows [i];
			let tableName = row.c_code + "_" + row.c_id;
			let fieldName = row.ca_code + "_" + row.ca_id;
			
			await me.store.query ({session: me.session, sql: `alter table ${tableName} alter column ${fieldName} set not null`});
		}
	};
	
	parseDates (list) {
		log.info ({fn: "import.parseDates"});
		
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
		log.info ({fn: "import.importFromFile"});
		
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
			log.info ({fn: "import.importFromFile"}, "loadConfig");
			
			const {loadConfig} = require ("./project");
			
			await loadConfig ({code});
			
			me.store = new Store ({code, connection: config.stores [code]});
			await me.store.init ();
			
			let _classExists = await me.store.client.isTableExists ({session, table: "_class"});
			
			if (!_classExists) {
				throw new Error ("please rebuild store.");
			}
			log.info ({fn: "import.importFromFile"}, "startTransaction");
			
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
			
			me.droppedClassesConstraints = {};
			
			await me.importObjects ();
			await me.importObjectAttrs ();
			
			await me.restoreConstraints ();
			
			await me.store.query ({session, sql: "delete from _log"});
			await me.store.query ({session, sql: `select set_config ('objectum.revision_id', '${me.store.revision [session.id]}', True)`});
			await me.updateTriggers ();
			await me.store.commitTransaction ({session});
			await me.store.client.updateSequences ();
			
			log.info ({fn: "import.importFromFile"}, "records count:\n" + JSON.stringify (me.count, 0, "\t"));
			
			let redisClient = redis.createClient (config.redis.port, config.redis.host);
			
			redisClient.del (code + "-objects");
			redisClient.quit ();
			me.store.end ();
		} catch (err) {
			await me.store.rollbackTransaction ({session});
			throw err;
		}
	}
};

module.exports = {
	Import
};
