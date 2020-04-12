const _ = require ("lodash");

class StatData {
	constructor () {
		let me = this;
		
		me.all = {
			num: 0, sum: 0
		};
		me.hour = {
			num: 0, sum: 0
		};
		me.min = {
			num: 0, sum: 0
		};
		me.time = new Date ();
	}
	
	collect (data, duration) {
		data.num ++;
		data.sum += duration;
		data.avg = data.sum / data.num | 0;
		
		if (data.min === undefined || data.min > duration) {
			data.min = duration;
		}
		if (data.max === undefined || data.max < duration) {
			data.max = duration;
		}
	}
	
	add (duration) {
		let me = this;

		me.collect (me.all, duration);
		me.collect (me.hour, duration);
		me.collect (me.min, duration);
		
		let time = new Date ();
		
		if (time.getHours () != me.time.getHours ()) {
			me.hour = {num: 0, sum: 0};
		}
		if (time.getMinutes () != me.time.getMinutes ()) {
			me.hour = {num: 0, sum: 0};
		}
		me.time = time;
	}

	getData () {
		let me = this;
		
		return {
			all: me.all,
			hour: me.hour,
			min: me.min
		};
	}
};

class StatCollection {
	constructor () {
		let me = this;
		
		me.data = {};
	}

	add ({rsc, fn, duration}) {
		let me = this;
		let code = `${rsc ? `${rsc}-` : ""}${fn}`;
		
		me.data [code] = me.data [code] || new StatData ();
		me.data [code].add (duration);
	}
	
	getData () {
		let me = this;
		let result = {};
		
		_.each (me.data, (o, code) => {
			result [code] = o.getData ();
		});
		return result;
	}
};

let stat = {
	all: new StatCollection ()
};

function collectStat ({project, rsc, fn, duration}) {
	stat [project] = stat [project] || new StatCollection ();
	
	stat [project].add ({rsc, fn, duration});
	stat ["all"].add ({rsc, fn, duration});
};


function getData () {
	let result = {};
	
	_.each (stat, (o, code) => {
		result [code] = o.getData ();
	});
	return result;
}
async function statHandler ({req, res, sessions, stat}) {
	let data = getData ();
	let r = "<table border='1'>";
	
	_.each (data, (projectStat, project) => {
		r += `
			<tr>
				<th colspan="13">${project}</th>
			</tr>
			<tr>
				<th rowspan="2">fn</th>
				<th colspan="4">all</th>
				<th colspan="4">hour</th>
				<th colspan="4">minute</th>
			</tr>
			<tr>
				<th>num</th>
				<th>min (msec)</th>
				<th>avg (msec)</th>
				<th>max (msec)</th>
				<th>num</th>
				<th>min (msec)</th>
				<th>avg (msec)</th>
				<th>max (msec)</th>
				<th>num</th>
				<th>min (msec)</th>
				<th>avg (msec)</th>
				<th>max (msec)</th>
			</tr>
		`;
		_.each (projectStat, (stat, fn) => {
			r += `
				<tr>
					<td>${fn}</td>
					<td>${stat.all.num || ""}</td>
					<td>${stat.all.min || ""}</td>
					<td>${stat.all.avg || ""}</td>
					<td>${stat.all.max || ""}</td>
					<td>${stat.hour.num || ""}</td>
					<td>${stat.hour.min || ""}</td>
					<td>${stat.hour.avg || ""}</td>
					<td>${stat.hour.max || ""}</td>
					<td>${stat.min.num || ""}</td>
					<td>${stat.min.min || ""}</td>
					<td>${stat.min.avg || ""}</td>
					<td>${stat.min.max || ""}</td>
				</tr>
			`;
		});
	});
	r += "</table>";
	
	res.header ("Content-Type", "text/html; charset=utf-8").send (r);
};

module.exports = {
	collectStat,
	statHandler
};