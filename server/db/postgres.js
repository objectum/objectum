"use strict"

const _ = require ("lodash");
const fs = require ("fs");
const util = require ("util");
const fs_readFile = util.promisify (fs.readFile);
const pg = require ("pg");

pg.defaults.poolSize = 0;
pg.defaults.poolIdleTimeout = 120000;
pg.defaults.reapIntervalMillis = 60000;

let pgTypes = pg.types;

// types: select typname, oid, typarray from pg_type where typtype = 'b' order by oid

if (pgTypes) {
	// timestamp
	pgTypes.setTypeParser (1114, function (val) {
		return val === null ? null : new Date (val.substr (0, 10) + "T" + val.substr (11) + "Z");
	});
	// numeric
	pgTypes.setTypeParser (1700, function (val) {
		return val === null ? null : parseFloat (val);
	});
	// float4
	pgTypes.setTypeParser (700, function (val) {
		return val === null ? null : parseFloat (val);
	});
	// float8
	pgTypes.setTypeParser (701, function (val) {
		return val === null ? null : parseFloat (val);
	});
	// int8
	pgTypes.setTypeParser (20, function (val) {
		return val === null ? null : parseInt (val);
	});
	// int2
	pgTypes.setTypeParser (21, function (val) {
		return val === null ? null : parseInt (val);
	});
	// int4
	pgTypes.setTypeParser (23, function (val) {
		return val === null ? null : parseInt (val);
	});
}

let pool = {};
//let clients = {};

class Postgres {
	constructor ({code, connection}) {
		let me = this;

		me.code = code;
		me.database = "postgres";
		me.host = connection.host;
		me.port = connection.port;
		me.db = connection.db;
		me.dbUser = connection.dbUser;
		me.dbPassword = connection.dbPassword;
		me.dbaUser = connection.dbaUser;
		me.dbaPassword = connection.dbaPassword;
		me.connection = "tcp://" + me.dbUser + ":" + me.dbPassword + "@" + me.host + ":" + me.port + "/" + me.db;
		me.adminConnection = "tcp://" + me.dbaUser + ":" + me.dbaPassword + "@" + me.host + ":" + me.port + "/postgres";

		// Tags for query
/*
		me.tags = {
			schema: me.dbUser,
			schema_prefix: me.dbUser + ".",
			tablespace: "tablespace " + me.dbUser,
			tid: "bigserial",
			tid_object_attr: "bigserial",
			tnumber: "bigint",
			tnumber_value: "numeric",
			ttext: "text",
			ttimestamp: "timestamp (6)",
			tstring: "varchar (1024)",
			tstring_value: "text",
			tocObjectId: "fobject_id bigint not null, primary key (fobject_id)",
			tobject_attr_fstring: "substr (fstring, 1, 1024)"
		};
*/
	}
	
/*
	async connect (opts) {
		let me = this;
		let systemDB = opts ? opts.systemDB : false;
		let client;
		
		client = new pg.Client (systemDB ? me.adminConnection : me.connection);
		
		client.connectAsync = util.promisify (client.connect);
		client.queryAsync = util.promisify (client.query);
		
		client.on ("error", function (err) {
			log.error ({fn: "postgres.connect", err, clientError: true});
		});
		client.on ("notice", function (notice) {
			log.debug ({fn: "postgres.connect", notice});
		});
		await client.connectAsync ();
		
		me.client = client;
		me.connected = true;
		
		if (client.pauseDrain) {
			client.pauseDrain ();
		}
		let rows = await me.query ({sql: "select pg_backend_pid() as pid"});
		
		me.pid = rows [0].pid;
		clients [me.pid] = me;
	}
*/
	
	async connect (opts) {
		let me = this;
		let systemDB = opts ? opts.systemDB : false;
		let client;
		
		if (config.pool && !systemDB) {
			if (!pool [me.connection]) {
				pool [me.connection] = new pg.Pool (Object.assign ({
					connectionString: me.connection,
					max: 20,
					idleTimeoutMillis: 15000,
					connectionTimeoutMillis: 2000
				}, config.pool));
			}
			client = await pool [me.connection].connect ();
			
			client.inPool = true;
		} else {
			client = new pg.Client (systemDB ? me.adminConnection : me.connection);
			
			await client.connect ();

			client.on ("error", function (err) {
				log.error ({fn: "postgres.connect", err, clientError: true});
			});
			client.on ("notice", function (notice) {
				log.debug ({fn: "postgres.connect", notice});
			});
		}
		me.client = client;
		me.connected = true;
		
/*
		if (client.pauseDrain) {
			client.pauseDrain ();
		}
*/
/*
		let rows = await me.query ({sql: "select pg_backend_pid() as pid"});
		
		me.pid = rows [0].pid;
		clients [me.pid] = me;
*/
	}

	async disconnect () {
		let me = this;

		if (me.client && me.client.inPool) {
			me.client.release ();
		} else
		if (me.client && me.client.end) {
			await me.client.end ();
			
			me.connected = 0;
		}
	}
	
	async query ({sql, params, fields, rowMode}) {
		log.debug ({fn: "postgres.query", sql, params});
		
		let me = this;
		
		try {
			if (!me.connected) {
				await me.connect ();
			}
//			let res = await me.client.queryAsync (sql, params);
//			let res = await me.client.queryAsync ({text: sql, values: params, rowMode});

			let res = await me.client.query ({text: sql, values: params, rowMode});
			
			if (fields) {
				_.each (res.fields, f => {
					fields.push (f);
				});
			}
			return res.rows;
		} catch (err) {
			log.error ({fn: "postgres.query", error: err}, `postgres.query: ${sql} ${params ? ("params: " + params) : ""}`);
			throw err;
		}
	}

	async startTransaction () {
		await this.query ({sql: "begin"});
	}

	async commitTransaction () {
		await this.query ({sql: "commit"});
	}

	async rollbackTransaction () {
		await this.query ({sql: "rollback"});
	}
	
	async setConfig (key, value, isLocal) {
		await this.query ({sql: `select set_config ('${key}', '${value}', ${isLocal ? "True" : "False"})`});
	}
	
	async getNextId ({table}) {
		let rows = await this.query ({sql: `select nextval ('${table}_fid_seq') as id`});
		return rows [0].id;
	}

	currentTimestamp () {
		return "current_timestamp at time zone 'UTC'";
	}

	async update () {
		await this.updateSequences ();
	}

	async updateSequences () {
		let tables = ["tclass", "tclass_attr", "tobject", "tobject_attr", "tview", "tview_attr", "taction", "trevision"];

		for (let i = 0; i < tables.length; i ++) {
			let table = tables [i];
			let rows = await this.query ({sql: `select max (fid) as max_id from ${table}`});
			let n;
			
			if (rows.length) {
				n = rows [0].max_id + 1;
			}
			if (!n || n < 1000) {
				n = 1000;
			}
			await this.query ({sql: `alter sequence ${table}_fid_seq restart with ${n}`});
		}
	}

/*
	updateTags (sql) {
		let me = this;
		let s = "", c, newSql = "";
		
		for (let i = 0; i < sql.length; i ++) {
			c = sql [i];
			
			if (c === "$") {
				if (s) {
					s = s.substr (1);
					if (me.tags [s]) {
						newSql += me.tags [s];
					} else {
						newSql += `$${s}$`;
					}
					s = "";
				} else {
					s = c;
				}
			} else {
				if (s) {
					s += c;
				} else {
					newSql += c;
				}
			}
		}
		if (s) {
			newSql += s;
		}
		return newSql;
	}
*/
	
	async create ({connection, cfg}) {
		await this.query ({sql: `create role ${connection.dbUser} noinherit login password '${connection.dbPassword}'`});
		
		if (cfg.path) {
			await this.query ({sql: `create tablespace ${connection.dbUser} owner ${connection.dbUser} location '${cfg.path}'`});
			await this.query ({sql: `create database ${connection.db} owner ${connection.dbUser} encoding 'utf8' tablespace ${connection.dbUser}`});
		} else {
			await this.query ({sql: `create database ${connection.db} owner ${connection.dbUser} encoding 'utf8'`});
		}
		await this.query ({sql: `alter database ${connection.db} set timezone to 'UTC'`});
		await this.disconnect ();
		await this.connect ();
		await this.query ({sql: `create schema ${connection.dbUser} authorization ${connection.dbUser}`});
		
		let files = ["tables", "indexes", "data", "engine-struct", "engine-fn"];
		
		for (let i = 0; i < files.length; i ++) {
			let filename = files [i];
			let sql = await fs_readFile (`${__dirname}/${filename}.sql`, "utf8");
			
			log.info (`${filename}.sql ...`);
			//sql = this.updateTags (sql);
			await this.query ({sql});
		}
		await this.update ();
	}

	async remove ({connection}) {
		delete config.pool;
		
		try {
			await this.disconnect ();
			await this.connect ();

			await this.query ({sql: `drop schema ${connection.dbUser} cascade`});
			log.info (`schema ${connection.dbUser} dropped`);
		} catch (err) {
			log.error ({fn: "postgres.remove", error: err});
		}
		try {
			if (this.connected) {
				await this.disconnect ();
			}
			await this.connect ({systemDB: true});
			
			await this.query ({sql: `drop database ${connection.db}`});
			log.info (`database ${connection.db} dropped`);
		} catch (err) {
			log.error ({fn: "postgres.remove", error: err});
		}
		try {
			await this.query ({sql: `drop tablespace ${connection.dbUser}`});
			log.info (`tablespace ${connection.dbUser} dropped`);
		} catch (err) {
			log.error ({fn: "postgres.remove", error: err});
		}
		try {
			await this.query ({sql: `drop role ${connection.dbUser}`});
			log.info (`role ${connection.dbUser} dropped`);
		} catch (err) {
			log.error ({fn: "postgres.remove", error: err});
		}
	}

	async isTableExists ({table}) {
		let rows = await this.query ({sql: `select count (*) as num from pg_tables where upper (tablename) = upper ('${table}')`});
		return !!rows [0].num;
	}

	async isFieldExists ({table, field}) {
		let rows = await this.query ({sql: `select count (*) as num from information_schema.columns where lower (table_name) = lower ('${table}') and lower (column_name) = lower ('${field}')`});
		return !!rows [0].num;
	}

	async isIndexExists ({index}) {
		let rows = await this.query ({sql: `
			select count (*) as num from pg_catalog.pg_class as c
			left join pg_catalog.pg_namespace as n on (n.oid = c.relnamespace)
			where c.relkind = 'i' and lower (c.relname) = lower ('${index}') and n.nspname = '${this.code}'
		`});
		return !!rows [0].num;
	}
};

module.exports = {
	Postgres
	//clients
};
