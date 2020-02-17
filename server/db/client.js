"use strict";

const _ = require ("lodash");
const { Postgres } = require ("./postgres");

class Database {
	createClient ({code, connection}) {
		if (_.isObject (connection.database)) {
			connection = connection.database;
		}
		return new Postgres ({code, connection});
/*
		if (connection.database == "postgres") {
			return new Postgres ({code, connection});
		} else {
			throw new Error (`db.createClient: unsupported database ${connection.database}`);
		}
*/
	}

	async execute (cfg) {
		const time1 = new Date ();
		const { loadConfig } = require ("./../project");
		
		await loadConfig ({code: cfg.code});
		
		let connection = config.stores [cfg.code];

		if (_.isObject (connection.database)) {
			connection = connection.database;
		}
		const { Store } = require ("./../store");
		let store;
		
		if (cfg.fn == "create") {
			log.info ("creating store ...");
			
			store = new Store ({systemDB: true, code: cfg.code, connection});
			
			await store.init ();
			await store.client.create ({cfg, connection});
		} else
		if (cfg.fn == "remove") {
			log.info ("removing store ...");
			
			store = new Store ({systemDB: true, code: cfg.code, connection});
			
			await store.init ();
			await store.client.remove ({connection});
		} else
		if (cfg.fn == "import") {
			log.info ("importing store ...");
			
			let { Import } = require ("./../import");
			let i = new Import ();
			
			await i.importFromFile ({code: cfg.code, file: cfg.file});
		} else
		if (cfg.fn == "export") {
			log.info ("exporting store ...");
			
			let { Export } = require ("./../export");
			let e = new Export ();
			
			await e.exportToFile ({
				schema: _.has (cfg, "schema") ? cfg.schema : true,
				code: cfg.code,
				file: cfg.file,
				classes: cfg.classes || "all",
				views: cfg.views || "all",
				except: {
					tobject: [{
						fclass_id: cfg.filterClasses || []
					}]
				},
				space: _.has (cfg, "space") ? cfg.space : "\t"
			});
		} else
		if (cfg.fn == "rebuild") {
			log.info ({fn: "db.rebuild"}, "rebuilding store ...");
			
			store = new Store ({code: cfg.code, connection});

			await store.init ();
			await require ("./rebuild").rebuild ({store});
		} else
		if (cfg.fn == "migration3to4") {
			log.info ({fn: "db.rebuild"}, "rebuilding store ...");
			
			store = new Store ({code: cfg.code, connection});
			
			await store.init ();
			await require ("./rebuild").migration3to4 ({store});
		} else
		if (cfg.fn == "uniqueStat") {
			log.info ("uniqueStat ...");
			
			store = new Store ({code: cfg.code, connection});
			
			await store.init ();
			await require ("./rebuild").uniqueStat ({store});
		} else
		if (cfg.fn == "uniqueRemoveDuplicates") {
			log.info ("uniqueRemoveDuplicates ...");
			
			store = new Store ({code: cfg.code, connection});
			
			await store.init ();
			await require ("./rebuild").uniqueRemoveDuplicates ({store});
		} else
		if (cfg.fn == "nullNotNullStat") {
			log.info ("nullNotNullStat ...");
			
			store = new Store ({code: cfg.code, connection});
			
			await store.init ();
			await require ("./rebuild").nullNotNullStat ({store});
		} else
		if (cfg.fn == "updateNullNotNull") {
			log.info ("updateNullNotNull ...");
			
			store = new Store ({code: cfg.code, connection});
			
			await store.init ();
			await require ("./rebuild").updateNullNotNull ({store, values: cfg.values});
		} else
		if (cfg.fn == "removeUnusedObjectAttrs") {
			log.info ("removeUnusedObjectAttrs ...");
			
			store = new Store ({code: cfg.code, connection});
			
			await store.init ();
			await require ("./rebuild").removeUnusedObjectAttrs ({store});
		} else
		if (cfg.fn == "invalidFkStat") {
			log.info ("invalidFkStat ...");
			
			store = new Store ({code: cfg.code, connection});
			
			await store.init ();
			await require ("./rebuild").invalidFkStat ({store});
		} else
		if (cfg.fn == "setNullInvalidFk") {
			log.info ("setNullInvalidFk ...");
			
			store = new Store ({code: cfg.code, connection});
			
			await store.init ();
			await require ("./rebuild").setNullInvalidFk ({store});
		} else
		if (cfg.fn == "nullNotNullUniqueStat") {
			log.info ("nullNotNullUniqueStat ...");
			
			store = new Store ({code: cfg.code, connection});
			
			await store.init ();
			await require ("./rebuild").nullNotNullUniqueStat ({store});
		} else
		if (cfg.fn == "dropObjectAttrIndexes") {
			log.info ({fn: "db.rebuild"}, "dropObjectAttrIndexes ...");
			
			store = new Store ({code: cfg.code, connection});
			
			await store.init ();
			await require ("./rebuild").dropObjectAttrIndexes ({store});
		} else {
			throw new Error (`unknown fn: ${cfg.fn}`);
		}
		if (store) {
			store.end ();
		}
		log.info (`duration: ${((new Date ().getTime () - time1) / 1000).toFixed (3)} sec.`);
		
		global.redisClient.quit ();
		global.redisPub.quit ();
		global.redisSub.quit ();
	}
};

module.exports = {
	db: new Database ()
};

