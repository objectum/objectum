"use strict"

const _ = require ("lodash");
const fs = require ("fs");
const util = require ("util");
const fs_writeFile = util.promisify (fs.writeFile);
const {Store} = require ("./store");
const {getFields} = require ("./map");
const common = require ("./common");

/*
const ifields = {
	tclass: ["fid", "fparent_id", "fname", "fcode", "fdescription", "fformat", "fview_id", "ftype", "fsystem", "fschema_id", "frecord_id", "fstart_id", "fend_id"],
	tclass_attr: ["fid", "fclass_id", "fname", "fcode", "ftype_id", "forder", "fnot_null", "fvalid_func", "fformat_func", "fdescription", "fsecure", "fmax_str", "fmin_str", "fmax_number", "fmin_number", "fmax_ts", "fmin_ts", "funique", "fformat_number", "fformat_ts", "fremove_rule", "fschema_id", "frecord_id", "fstart_id", "fend_id"],
	tview: ["fid", "fparent_id", "fname", "fcode", "fdescription", "flayout", "fkey", "fparent_key", "fclass_id", "funrelated", "fquery", "ftype", "fsystem", "fmaterialized", "forder", "fschema_id", "frecord_id", "ficon_cls", "fstart_id", "fend_id"],
	tview_attr: ["fid", "fview_id", "fname", "fcode", "fclass_id", "fclass_attr_id", "fsubject_id", "forder", "fsort_kind", "fsort_order", "foperation", "fvalue", "farea", "fcolumn_width", "ftotal_type", "fread_only", "fgroup", "fnot_null", "fschema_id", "frecord_id", "fstart_id", "fend_id"],
	taction: ["fid", "fclass_id", "fname", "fcode", "fdescription", "forder", "fbody", "fconfirm", "flayout", "fschema_id", "frecord_id", "fstart_id", "fend_id"],
	tobject: ["fid", "fclass_id", "fschema_id", "frecord_id", "fstart_id", "fend_id"],
	tobject_attr: ["fid", "fobject_id", "fclass_attr_id", "fstring", "fnumber", "ftime", "fschema_id", "frecord_id", "fstart_id", "fend_id"],
	trevision: ["fid", "fdate", "fdescription", "fschema_id", "frecord_id"],
	tschema: ["fid", "fparent_id", "fname", "fcode"]
};
*/
const ifields = {
	tclass: getFields ("class"),
	tclass_attr: getFields ("classAttr"),
	tview: getFields ("view"),
	tview_attr: getFields ("viewAttr"),
	taction: getFields ("action"),
	tobject: getFields ("object"),
	tobject_attr: getFields ("objectAttr"),
	trevision: ["fid", "fdate", "fdescription", "fschema_id", "frecord_id"],
	tschema: ["fid", "fparent_id", "fname", "fcode"]
};

class Export {
	constructor () {
		// Здесь собираются данные для экспорта
		this.data = {};
		// id классов для экспорта
		this.classesId = [];
		// id представлений для экспорта
		this.viewsId = [];
		// Исключения (записи которые не надо экспортировать)
		this.except = {};
		// Идентификатор текущей схемы
		this.currentSchemaId = null;
	}

	async getTopClassesCodes () {
		let me = this;
		
		log.info ({cls: "Export", fn: "getTopClassesCodes"});
		
		let rows = await this.store.query ({session: me.session, sql: `
			select
				distinct (a.fid) as fid
			from
				tclass a
			where
				a.fparent_id is null and a.fid >= 1000
		`});
		return _.map (rows, "fid");
	}

	async getTopViewsCodes () {
		let me = this;
		
		log.info ({cls: "Export", fn: "getTopViewsCodes"});
		
		let rows = await this.store.query ({session: me.session, sql: `
			select
				distinct (a.fid) as fid
			from
				tview a
			where
				a.fparent_id is null
		`});
		return _.map (rows, "fid");
	}
	
	async getNodesId ({codes, table}) {
		let me = this;
		let result = [];
		
		for (let i = 0; i < codes.length; i ++) {
			let code = codes [i];
			let id;
			
			if (String (typeof (code)).toLowerCase () == "number") {
				id = code;
			} else {
				let rows = await me.store.query ({session: me.session, sql: `
					select
						distinct (a.fid) as fid
					from
						${table} a
					where
						a.fcode = '${code}' and a.fparent_id is null
				`});
				id = rows [0].fid;
			}
			result.push (id);
			
			let rows = await me.store.query ({session: me.session, sql: `
				select
					distinct (a.fid) as fid
				from
					${table} a
				where
					a.fparent_id = ${id}
				order by a.fid
			`});
			let childsId = _.map (rows, "fid");
			
			if (childsId.length) {
				let childs = await me.getNodesId ({table, codes: childsId});
				
				result = [...result, ...childs];
			}
		}
		return result;
	};

	async exportClasses () {
		log.info ({cls: "Export", fn: "exportClasses"});

		let me = this;
		let codes = me.data.options.classes;
		
		me.classesId = await me.getNodesId ({table: "tclass", codes});

		if (me.classesId.length) {
			me.data.tclass = [];
			
			let data = await me.store.query ({session: me.session, sql: `
				select
					${ifields.tclass.join ()}
				from
					tclass a
				where
					a.fid in (${me.classesId.join ()})
				order by
					a.fid, a.fstart_id
			`});
			for (let k = 0; k < data.length; k++) {
				let values = [];
				
				for (let j = 0; j < ifields.tclass.length; j++) {
					let field = ifields.tclass [j];
					let value = data [k][field];
					
					if (field == "fcode" && !value) {
						throw "exportClasses (): fcode must be not null. FID=" + data [k].fid;
					}
					if (field == "fschema_id" && value == null) {
						value = me.currentSchemaId;
					}
					if (field == "frecord_id" && value == null) {
						value = data [k].fid;
					}
					values.push (value);
				}
				me.data.tclass.push ({
					values
				});
			}
		}
	};

	async exportClassAttrs () {
		let me = this;
		
		me.data.tclass_attr = [];
		
		let data = await me.store.query ({session: me.session, sql: `
			select
				${ifields.tclass_attr.join ()}
			from
				tclass_attr a
			where
				a.fclass_id in (${me.classesId.join ()})
			order by
				a.fid, a.fstart_id
		`});
		for (let i = 0; i < data.length; i ++) {
			let attr = {};
			
			attr.values = [];
			
			for (let j = 0; j < ifields.tclass_attr.length; j ++) {
				let field = ifields.tclass_attr [j];
				let value = data [i][field];
				
				if (field == "fschema_id" && value == null) {
					value = me.currentSchemaId;
				}
				if (field == "frecord_id" && value == null) {
					value = data [i].fid;
				}
				attr.values.push (value);
			}
			me.data.tclass_attr.push (attr);
		}
	}
	
	async exportActions () {
		let me = this;
		
		me.data.taction = [];
		
		let data = await me.store.query ({session: me.session, sql: `
			select
				${ifields.taction.join ()}
			from
				taction a
			where
				a.fclass_id in (${me.classesId.join ()})
			order by
				a.fid, a.fstart_id
		`});
		for (let i = 0; i < data.length; i ++) {
			let action = {};
			
			action.values = [];
			
			for (let j = 0; j < ifields.taction.length; j ++) {
				let field = ifields.taction [j];
				let value = data [i][field];
				
				if (field == "fschema_id" && value == null) {
					value = me.currentSchemaId;
				}
				if (field == "frecord_id" && value == null) {
					value = data [i].fid;
				}
				action.values.push (value);
			}
			me.data.taction.push (action);
		}
	}

	async exportObjects () {
		let me = this;

		me.data.tobject = [];
		
		let classes = [];
		
		if (me.except.tobject && me.except.tobject.fclass_id.length) {
			let except = me.except.tobject.fclass_id;
			
			for (let i = 0; i < me.classesId.length; i ++) {
				if (except.indexOf (me.classesId [i]) == -1) {
					classes.push (me.classesId [i]);
				}
			}
		} else {
			classes = me.classesId;
		}
		let objects = await me.store.query ({session: me.session, sql: `
			select
				${ifields.tobject.join ()}
			from
				tobject a
			where
				a.fclass_id in (${classes.join ()})
			order by
				a.fid, a.fstart_id
		`});
		for (let i = 0; i < objects.length; i ++) {
			let object = {};
			
			object.values = [];
			
			for (let j = 0; j < ifields.tobject.length; j ++) {
				let field = ifields.tobject [j];
				let value = objects [i][field];
				
				if (field == "fschema_id" && value == null) {
					value = me.currentSchemaId;
				}
				if (field == "frecord_id" && value == null) {
					value = objects [i].fid;
				}
				object.values.push (value);
			};
			me.data.tobject.push (object);
		}
	}
	
	async exportObjectAttrs () {
		let me = this;

		me.data.tobject_attr = [];
		
		let classes = [];
		
		if (me.except.tobject && me.except.tobject.fclass_id.length) {
			let except = me.except.tobject.fclass_id;
			for (let i = 0; i < me.classesId.length; i ++) {
				if (except.indexOf (me.classesId [i]) == -1) {
					classes.push (me.classesId [i]);
				}
			}
		} else {
			classes = me.classesId;
		}
		let objectAttrs = await me.store.query ({session: me.session, sql: `
			select
				${ifields.tobject_attr.join ()}
			from
				tobject_attr a
			where
				a.fobject_id in (select b.fid from tobject b where b.fclass_id in (${classes.join ()}))
			order by
				a.fid, a.fstart_id
		`});
		for (let i = 0; i < objectAttrs.length; i ++) {
			let objectAttr = {};
			
			objectAttr.values = [];
			
			for (let j = 0; j < ifields.tobject_attr.length; j ++) {
				let field = ifields.tobject_attr [j];
				let value = objectAttrs [i][field];
				
				if (field == "fschema_id" && value == null) {
					value = me.currentSchemaId;
				}
				if (field == "frecord_id" && value == null) {
					value = objectAttrs [i].fid;
				}
				objectAttr.values.push (value);
			};
			me.data.tobject_attr.push (objectAttr);
		}
	}
	
	async exportViews () {
		log.info ({cls: "Export", fn: "exportViews"});
		
		let me = this;
		let codes = me.data.options.views;
		
		me.viewsId = await me.getNodesId ({table: "tview", codes});
		
		if (me.viewsId.length) {
			me.data.tview = [];

			let data = await me.store.query ({session: me.session, sql: `
				select
					${ifields.tview.join ()}
				from
					tview a
				where
					a.fid in (${me.viewsId.join ()})
				order by
					a.fid, a.fstart_id
			`});
			for (let k = 0; k < data.length; k ++) {
				let values = [];
				
				for (let i = 0; i < ifields.tview.length; i ++) {
					let field = ifields.tview [i];
					let value = data [k][field];
					
					if (field == "fcode" && !value) {
						throw "exportViews (): fcode must be not null. fid=" + data [k].fid;
					}
					if (field == "fschema_id" && value == null) {
						value = me.currentSchemaId;
					}
					if (field == "frecord_id" && value == null) {
						value = data [k].fid;
					}
					values.push (value);
				}
				let viewObject = {};
				
				viewObject.values = values;
				me.data.tview.push (viewObject);
			}
		}
	}
	
	async exportViewAttrs () {
		let me = this;

		me.data.tview_attr = [];

		let data = await me.store.query ({session: me.session, sql: `
			select
				${ifields.tview_attr.join ()}
			from
				tview_attr a
			where
				a.fview_id in (${me.viewsId.join ()})
			order by
				a.fid, a.fstart_id
		`});
		for (let i = 0; i < data.length; i ++) {
			let values = [];
			
			for (let j = 0; j < ifields.tview_attr.length; j ++) {
				let field = ifields.tview_attr [j];
				let value = data [i][field];
				
				if (field == "fschema_id" && value == null) {
					value = me.currentSchemaId;
				}
				if (field == "frecord_id" && value == null) {
					value = data [i].fid;
				}
				values.push (value);
			}
			me.data.tview_attr.push ({values: values});
		}
	}
	
	async exportRevisions () {
		log.info ({cls: "Export", fn: "exportRevisions"});
		
		let me = this;
		
		let qr = await me.store.query ({session: me.session, sql: `
			select ${ifields.trevision.join ()}
			from trevision a
			order by a.fid
		`});
		me.data.trevision = [];
		
		for (let i = 0; i < qr.length; i ++) {
			let values = [];
			
			for (let j = 0; j < ifields.trevision.length; j ++) {
				let field = ifields.trevision [j];
				let value = qr [i][field];
				
				if (field == "fschema_id" && value == null) {
					value = me.currentSchemaId;
				}
				if (field == "frecord_id" && value == null) {
					value = qr [i].fid;
				}
				values.push (value);
			}
			let revision = {};
			
			revision.values = values;
			me.data.trevision.push (revision);
		}
	}
	
	async exportSchemas () {
		log.info ({cls: "Export", fn: "exportSchemas"});
		
		let me = this;

		let qr = await me.store.query ({session: me.session, sql: `
			select ${ifields.tschema.join ()}
			from tschema a
			order by a.fid
		`});
		me.data.tschema = [];
		
		for (let i = 0; i < qr.length; i ++) {
			let values = [];
			
			for (let j = 0; j < ifields.tschema.length; j ++) {
				let field = ifields.tschema [j];
				let value = qr [i][field];
				
				values.push (value);
			}
			let schema = {};
			
			schema.values = values;
			me.data.tschema.push (schema);
		}
	}
	
	// Подготовить переменные для записей, которые не надо экспортировать
	async prepareExcept () {
		let me = this;
		let except = me.data.options.except;
		
		if (!except) {
			return;
		}
		let tables = _.keys (except);

		for (let i = 0; i < tables.length; i ++) {
			let table = tables [i];
			let conditions = except [table];
			let classes = [];
			
			for (let j = 0; j < conditions.length; j ++) {
				let condition = conditions [i];

				if (condition.fclass_id) {
					let addClass = async function (classId) {
						if (classes.indexOf (classId) == -1) {
							classes.push (classId);
						}
						let data = await me.store.query ({session: me.session, sql: `
							select
								fid
							from
								tclass a
							where
								a.fparent_id = ${classId}
							order by
								a.fid, a.fstart_id
						`});
						for (let k = 0; k < data.length; k ++) {
							await addClass (data [k].fid);
						}
					};
					if (String (typeof (condition.fclass_id)).toLowerCase () == "object" && condition.fclass_id instanceof Array) {
						// fclass_id: [value1, value2, ...]
						for (let k = 0; k < condition.fclass_id.length; k ++) {
							let classId = condition.fclass_id [k];

							await addClass (me.store.getClass (classId).get ("id"));
						}
					} else {
						// fclass_id: value
						await addClass (me.store.getClass (condition.fclass_id).get ("id"));
					}
				}
			}
			me.except [table] = {};
			me.except [table].fclass_id = classes;
		}
	}
	
	// Установить в null поля TOBJECT_ATTR.FTIME < '01.01.1400'
	async clearBadTimeFields () {
		let me = this;
		
		log.info ({cls: "Export", fn: "clearBadTimeFields"});
		
		await this.store.query ({session: me.session, sql: `
			update tobject_attr set ftime = null
			where ftime < '01.01.1400'
		`});
	}
	
	// Правка неправильных ссылок на ревизии
	async fixReferences () {
		let me = this;

		let rows = await me.store.query ({session: me.session, sql: `select min (fid) as fid from trevision`});

		if (rows.length > 0) {
			let minRevision = rows [0].fid;
			let sql = [];
			
			for (let table in ifields) {
				let fields = ifields [table].join ();
				
				if (fields.indexOf ("fstart_id") == -1) {
					continue;
				}
				sql.push (`
					update ${table} set fstart_id = ${minRevision}
					where fstart_id not in (select fid from trevision)
				`);
				sql.push (`
					update ${table} set fend_id = ${minRevision}
					where fend_id <> 0 and fend_id not in (select fid from trevision)
				`);
			}
			for (let i = 0; i < sql.length; i ++) {
				await me.store.query ({session: me.session, sql: sql [i]});
			}
		}
	}
	
	async createSchema ({code}) {
		let me = this;
		let qr = await me.store.query ({session: me.session, sql: `select fid from tschema where fcode = '${code}'`});

		if (qr.length == 0) {
			let nextId = null;
			
			let qr = await me.store.query ({session: me.session, sql: `select max (fid) as fid from tschema`});

			if (qr.length) {
				nextId = qr [0].fid + 1;
			}
			if (nextId == null) {
				nextId = 1;
			}
			await me.store.query ({session: me.session, sql: `insert into tschema (fid, fcode) values (${nextId},'${code}')`});
			
			return nextId;
		} else {
			return qr [0].fid;
		}
	};
	
	async exportToFile (opts) {
		log.info ({cls: "Export", fn: "exportToFile"});
		
		let me = this;
		let timeStart = new Date ().getTime ();
		
		me.data.options = opts;
		
		const {loadConfig} = require ("./project");
		
		await loadConfig ({code: opts.code});

		me.store = new Store ({code: opts.code, connection: config.stores [opts.code]});
		await me.store.init ();
		
		me.session = {
			id: "export_" + opts.code,
			username: "admin",
			userId: null
		};
		if (opts.classes == "all") {
			opts.classes = await me.getTopClassesCodes ();
		}
		if (opts.views == "all") {
			opts.views = await me.getTopViewsCodes ();
		}
		me.data.fields = ifields;
		
		await me.clearBadTimeFields ();
		await me.fixReferences ();
		
		me.currentSchemaId = await me.createSchema ({code: opts.code});
		
		await me.exportClasses ();
		await me.exportClassAttrs ();
		await me.exportActions ();
		await me.prepareExcept ();
		await me.exportObjects ();
		await me.exportObjectAttrs ();
		await me.exportViews ();
		await me.exportViewAttrs ();
		await me.exportSchemas ();
		await me.exportRevisions ();
		
		me.data = common.unescape (me.data);
		
		if (opts.space) {
			await fs_writeFile (opts.file, JSON.stringify (me.data, null, opts.space));
		} else {
			await fs_writeFile (opts.file, JSON.stringify (me.data));
		}
		let stat = "";
		
		for (let table in ifields) {
			if (me.data [table]) {
				stat += `${table}: ${me.data [table].length}\n`;
			}
		}
		stat += `queryCount: ${me.store.queryCount}\n`;
		stat += `duration: ${(new Date ().getTime () - timeStart) / 1000} sec.\n`;
		
		log.info ({cls: "Export", stat});
		me.store.end ();
	}
}

module.exports = {
	Export
};
