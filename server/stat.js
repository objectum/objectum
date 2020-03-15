"use strict"

const _ = require ("lodash");
const async = require ("async");

function stat (options) {
	let request = options.request;
	let response = options.response;
	if (config.admin.ip.indexOf (common.getRemoteAddress (request)) == -1 && config.admin.ip != "all") {
		response.end ("forbidden");
	};
	log.info ({cls: "server", fn: "stat"}, "ip: " + common.getRemoteAddress (request) + ", query: " + JSON.stringify (request.query));
	if (request.query.logs) {
		redisClient.keys (config.redis.db + "-log-*", function (err, result) {
			for (let i = 0; i < result.length; i ++) {
				result [i] = result [i].substr ((config.redis.db + "-log-").length);
			};
			response.writeHead (200, {"Content-Type": "text/html; charset=utf-8"});
			response.end (JSON.stringify (result));
		});
		return;
	};
	if (request.query.log) {
		redisClient.lrange (config.redis.db + "-log-" + request.query.log, 0, -1, function (err, result) {
			response.writeHead (200, {"Content-Type": "text/html; charset=utf-8"});
			response.end (JSON.stringify (result));
		});
		return;
	};
	if (request.query.restart) {
		redisPub.publish (config.redis.db + "-cluster", "restart");
		response.writeHead (200, {"Content-Type": "text/html; charset=utf-8"});
		response.end ("ok");
		return;
	};
	if (!request.query.data) {
		fs.readFile (__dirname + "/www/client/stat/stat.html", function (err, data) {
			response.writeHead (200, {"Content-Type": "text/html; charset=utf-8"});
			response.end (data);
		});
		return;
	};
	let allData = {}, num = 0, online, lost, onlineNum, onlineNumMax, onlineNumMaxTS, started, memoryUsage, idle = "";
	async.series ([
		function (cb) {
			redisClient.hgetall ("sessions", function (err, r) {
				let data = [];
				for (let k in r) {
					if (k.indexOf ("-username") > -1) {
						let sid = k.substr (0, k.length - 9);
						data.push ({
							login: r [k],
							port: r [sid + "-port"],
							storage: r [sid + "-storageCode"],
							logined: r [sid + "-logined"],
							ip: r [sid + "-ip"]
						});
						num ++;
					}
				};
				allData.sessions = data;
				cb ();
			});
		},
		function (cb) {
			redisClient.hgetall ("current-requests", function (err, result) {
				let data = [];
				for (let k in result) {
					let r;
					try {
						r = eval ("(" + result [k] + ")");
					} catch (e) {
						r = {body: result [k]};
					};
					data.push ({
						url: r.url,
						body: r.body,
						fields: r.fields,
						ts: r.ts
					});
				};
				allData.unprocessed = data;
				cb ();
			});
		},
		function (cb) {
			redisClient.hgetall ("server-started", function (err, result) {
				started = result;
				cb ();
			});
		},
		function (cb) {
			redisClient.hgetall ("server-memoryusage", function (err, result) {
				let data = [];
				let total = {
					current: {
						rss: 0, heapTotal: 0, heapUsed: 0
					},
					max: {
						rss: 0, heapTotal: 0, heapUsed: 0
					}
				};
				for (let k in result) {
					let r = JSON.parse (result [k]);
					data.push ({
						pid: k,
						port: r.port,
						started: started [k],
						rssCurrent: r.current.rss,
						heapTotalCurrent: r.current.heapTotal,
						heapUsedCurrent: r.current.heapUsed,
						rssMax: r.max.rss,
						heapTotalMax: r.max.heapTotal,
						heapUsedMax: r.max.heapUsed
					});
				};
				allData.cluster = data;
				cb ();
			});
		},
		function (cb) {
			redisClient.get ("online-num", function (err, result) {
				onlineNum = result;
				redisClient.get ("online-num-max", function (err, result) {
					onlineNumMax = result;
					redisClient.get ("online-num-max-ts", function (err, result) {
						onlineNumMaxTS = result;
						cb ();
					});
				});
			});
		},
		function (cb) {
			let s;
			for (s in config.storages) {
				if (config.storages [s].database == "postgres") {
					let client = new db.Postgres ({connection: config.storages [s]});
					
					client.connect ({systemDB: true, success: function () {
						client.query ({sql:
						"select (date_part ('epoch', now () - query_start)) as duration, procpid, current_query\n" +
						"from pg_stat_activity\n" +
						"where current_query <> '<IDLE>' and date_part ('epoch', now () - query_start) > 0\n" +
						"order by 1"
							, success: function (options) {
								let rows = options.result.rows;
								let data = [];
								for (let i = 0; i < rows.length; i ++) {
									data.push ({
										duration: rows [i].duration,
										pid: rows [i].procpid,
										query: rows [i].current_query
									});
								};
								allData.pgStat = data;
								client.disconnect ();
								cb ();
							}, failure: function () {
								allData.pgStat = [];
								cb ();
							}});
					}});
					return;
				};
			};
			cb ();
		}
	], function (err, results) {
		response.send (JSON.stringify (allData));
	});
};

module.exports = {
	stat
};