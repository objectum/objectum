"use strict";

const _ = require ("lodash");
let storePool = {};

class StoreWrapper {
	constructor (store, session) {
		this.store = store;
		this.session = session;
	}
	
	async getData (opts) {
		return await this.store.getData ({session: this.session, args: opts});
	}
	
	async getRecord (id) {
		return await this.store.getObject ({session: this.session, id});
	}
	
	getModel (id) {
		return this.store.getClass (id);
	}
	
	getProperty (id) {
		return this.store.getClassAttr (id);
	}
};

async function accessFilter ({tokens, classMap, store, session}) {
	let filters = [];
	
	for (let alias in classMap) {
		let m = classMap [alias];
		let opts = m.getOpts ();
		
		if (! opts.access || ! opts.access.filter) {
			continue;
		}
		let fn;
		
		try {
			eval ("fn = async function ({store, session, alias}) {" + opts.access.filter + "}");
		} catch (err) {
			throw new Error (`error in access.filter function: ${err.message}, model: ${m.getPath ()}.`);
		}
		let storeWrapper = storePool [session.id];
		
		if (!storeWrapper) {
			storeWrapper = new StoreWrapper (store, session);
			storePool [session.id] = storeWrapper;
		}
		let filter = await fn ({store: storeWrapper, session, alias});
	
		if (filter) {
			filters.push (filter);
		}
	}
	if (! filters.length) {
		return tokens;
	}
	let filterStr = _.map (filters, f => {
		return `(${f})`;
	}).join (" and ");

	// convert {"prop": "a.*"} to SQL
	let filterTokens = [], json = "", str = "";
	
	for (let i = 0; i < filterStr.length; i ++) {
		let c = filterStr [i];
		
		if (c == "{") {
			filterTokens.push (str);
			str = "";
			json += c;
		} else
		if (c == "}") {
			json += c;
			try {
				json = JSON.parse (json);
			} catch (err) {
				throw new Error (`JSON error: ${err.message}, JSON: ${json}`);
			}
			if (json ["prop"]) {
				let [alias, code] = json ["prop"].split (".");
				let m = classMap [alias];
				
				if (code == "id") {
					filterTokens.push (` ${alias}.fobject_id `);
				} else {
					if (! m.attrs [code]) {
						throw new Error (`unknown property: ${code}, model: ${m.getPath ()}.`);
					}
					filterTokens.push (` ${alias}.${m.attrs [code].getField ()} `);
				}
			} else {
				throw new Error (`unknown JSON in access.filter function: ${JSON.stringify (json)}`);
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
		filterTokens.push (str);
	}
	// insert to where
	let r = [], whereSection = false, where = [];
	
	for (let i = 0; i < tokens.length; i ++) {
		let o = tokens [i];
		
		if (o && typeof (o) == "object" && o ["where"]) {
			if (o ["where"] == "begin") {
				r.push (o);
				whereSection = true;
			}
			if (o ["where"] == "end") {
				if (where.length) {
					r = [...r, "(", ...where, ") and (", ...filterTokens, ")", o];
				} else {
					r = [...r, ...filterTokens, o];
				}
				whereSection = false;
			}
			if (o ["where"] == "empty") {
				r = [...r, {"where": "begin"}, ...filterTokens, {"where": "end"}];
			}
		} else {
			if (whereSection) {
				where.push (o);
			} else {
				r.push (o);
			}
		}
	}
	return r;
};

module.exports = {
	accessFilter
};
