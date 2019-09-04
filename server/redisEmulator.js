"use strict"

let redisEmulator = {
	m: {},
	del: function (key, cb) {
		delete this.m [key];
		if (cb) {
			cb (null, true);
		};
	},
	keys: function (mask, cb) {
		let r = [];
		if (mask && mask [mask.length - 1] == "*") {
			let m = mask.substr (0, mask.length - 1);
			for (let key in this.m) {
				if (key.substr (0, m.length) == m) {
					r.push (key);
				};
			};
		};
		if (cb) {
			cb (null, r);
		};
	},
	subscribers: [],
	on: function (event, cb) {
		this.subscribers.push (cb);
	},
	subscribe: function (channel) {
	},
	publish: function (channel, message) {
		for (let i = 0; i < this.subscribers.length; i ++) {
			(this.subscribers [i]) (channel, message);
		};
	},
	incrby: function (key, inc, cb) {
		this.m [key] = this.m [key] || 0;
		this.m [key] = Number (this.m [key]) + inc;
		if (cb) {
			cb (null, String (this.m [key]));
		};
	},
	get: function (key, cb) {
		if (cb) {
			cb (null, this.m [key] || null);
		};
	},
	set: function (key, value, cb) {
		this.m [key] = String (value);
		if (cb) {
			cb (null, true);
		};
	},
	hincrby: function (key, field, inc, cb) {
		this.m [key] = this.m [key] || {};
		this.m [key][field] = this.m [key][field] || 0;
		this.m [key][field] = Number (this.m [key][field]) + inc;
		if (cb) {
			cb (null, String (this.m [key][field]));
		};
	},
	hdel: function () {
		let key = arguments [0];
		for (let i = 1; i < arguments.length; i ++) {
			if (typeof (arguments [i]) != "function" && this.m [key] && this.m [key][arguments [i]]) {
				delete this.m [key][arguments [i]];
			};
		};
		if (typeof (arguments [arguments.length - 1]) == "function") {
			(arguments [arguments.length - 1]) (null, true);
		};
	},
	hset: function (key, field, value, cb) {
		this.m [key] = this.m [key] || {};
		this.m [key][field] = String (value);
		if (cb) {
			cb (null, true);
		};
	},
	hmset: function (key, hdata, cb) {
		this.m [key] = this.m [key] || {};
		for (let field in hdata) {
			this.m [key][field] = String (hdata [field]);
		};
		if (cb) {
			cb (null, true);
		};
	},
	hget: function (key, field, cb) {
		this.m [key] = this.m [key] || {};
		if (cb) {
			cb (null, this.m [key][field]);
		};
	},
	hmget: function (key, keys, cb) {
		this.m [key] = this.m [key] || {};
		let r = [];
		for (let i = 0; i < keys.length; i ++) {
			r.push (this.m [key][keys [i]]);
		};
		if (cb) {
			cb (null, r);
		};
	},
	hgetall: function (key, cb) {
		let r = {};
		for (let field in this.m [key]) {
			r [field] = this.m [key][field];
		};
		if (cb) {
			cb (null, r);
		};
	},
	hsetnx: function (key, field, value, cb) {
		this.m [key] = this.m [key] || {};
		let r = 0;
		if (!this.m [key] [field]) {
			this.m [key] [field] = value;
			r = 1;
		};
		if (cb) {
			cb (null, r);
		};
	},
	hkeys: function (key, cb) {
		let r = [];
		for (let field in this.m [key]) {
			r.push (field);
		};
		if (cb) {
			cb (null, r);
		};
	},
	sadd: function (key, value, cb) {
		this.m [key] = this.m [key] || [];
		if (this.m [key].indexOf (value) == -1) {
			this.m [key].push (String (value));
			if (cb) {
				cb (null, true);
			};
		} else {
			if (cb) {
				cb (true, false);
			};
		};
	},
	sismember: function (key, value, cb) {
		this.m [key] = this.m [key] || [];
		if (cb) {
			cb (null, this.m [key].indexOf (value) > -1);
		};
	},
	srem: function (key, value, cb) {
		this.m [key] = this.m [key] || [];
		let pos = this.m [key].indexOf (String (value));
		if (pos > -1) {
			this.m [key].splice (pos, 1);
		};
		if (cb) {
			cb (null, true);
		};
	},
	smembers: function (key, cb) {
		this.m [key] = this.m [key] || [];
		if (cb) {
			cb (null, this.m [key]);
		};
	},
	lpush: function (key, value) {
		this.m [key] = this.m [key] || [];
		this.m [key] = [value].concat (this.m [key]);
		if (key.indexOf ("service.log") > -1) {
			console.log (key + " lpush " + this.m [key]);
		};
	},
	ltrim: function (key, start, end) {
		this.m [key] = this.m [key] || [];
		this.m [key] = this.m [key].slice (start, end + 1);
		if (key.indexOf ("service.log") > -1) {
			console.log (key + " ltrim " + this.m [key]);
		};
	},
	lrange: function (key, start, end, cb) {
		this.m [key] = this.m [key] || [];
		end = end == -1 ? (this.m [key].length - 1) : end;
		if (cb) {
			cb (null, this.m [key].slice (start, end + 1));
		};
		if (key.indexOf ("service.log") > -1) {
			console.log (key + " lrange " + this.m [key]);
		};
	},
	select: function (db, cb) {
		cb ();
	},
	quit: function () {
	}
};

module.exports = redisEmulator;
