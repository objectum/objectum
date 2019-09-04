"use strict"
/*
	Генератор XLSX
	Только текст, объединение ячеек, рамки, выравнивание (вертикаль, горизонталь)
*/
const XLSX = require ("xlsx");
const _ = require ("lodash");

class ReportXSLX {
	addStyle (name, style) {
		let me = this;

		me.styles = me.styles || {};

		let o = {
			alignment: {
				horizontal: "left",
				vertical: "top"
			},
			font: {
				name: "Arial",
				sz: "9"
			}
		};
		_.each (style.split (","), function (pair) {
			let attr = pair.split (":")[0];
			let value = pair.split (":")[1];

			if (attr == "hAlign") {
				o.alignment.horizontal = {"Left": "left", "Center": "center", "Right": "right"}[value];
			}
			if (attr == "vAlign") {
				o.alignment.vertical = {"Left": "top", "Center": "center", "Right": "bottom"}[value];
			}
			if (attr == "wrap") {
				o.alignment.wrapText = true;
			}
			if (attr == "rotate") {
				o.alignment.textRotation = 90;
			}
			if (attr == "fontSize") {
				o.font.sz = value;
			}
			if (attr == "fontName") {
				o.font.name = value;
			}
			if (attr == "bold") {
				o.font.bold = true;
			}
			if (attr == "italic") {
				o.font.italic = true;
			}
			if (attr == "underline") {
				o.font.underline = true;
			}
			if (attr == "borders") {
				o.border = {
					left: {style: "thin", color: {auto: 1}},
					right: {style: "thin", color: {auto: 1}},
					top: {style: "thin", color: {auto: 1}},
					bottom: {style: "thin", color: {auto: 1}}
				};
			}
		});
		me.styles [name] = o;
	}
	addCell (ws, x, y, cell) {
		let me = this;
		let w = cell.colspan > 1 ? cell.colspan - 1 : 0;
		let h = cell.rowspan > 1 ? cell.rowspan - 1 : 0;

		if (w || h) {
			ws ["!merges"]  = ws ["!merges"] || [];
			ws ["!merges"].push ({s: {c: x, r: y}, e: {c: x + w, r: y + h}});
		}
		for (let i = x; i <= x + w; i ++) {
			for (let j = y; j <= y + h; j ++) {
		        ws [XLSX.utils.encode_cell ({c: i, r: j})] = {
					v: cell.text === null ? "" : cell.text,
					t: "s",
					s: me.styles [cell.style]
				};
			}
		}
	}
	addCols (ws, columns) {
		let me = this;

		ws ["!cols"] = _.map (columns, function (o) {
			let w;

			if (_.isObject (o)) {
				w = o.width;
			} else {
				w = o;
			}
			return {wch: w};
		});
	}
	addSheet (sheet) {
		let me = this;
		let ws = {}, y = 0, xMax = 0;

		_.each (sheet.rows, function (row) {
			let x = row.startIndex ? (row.startIndex - 1) : 0;

			_.each (row.cells, function (cell) {
				if (cell.startIndex) {
					x = cell.startIndex - 1;
				}
				me.addCell (ws, x, y, cell);
				x += cell.colspan || 1;
			});
			xMax = x > xMax ? x : xMax;
			y ++;
		});
		me.addCols (ws, sheet.columns);
		ws ["!ref"] = XLSX.utils.encode_range ({s: {c: 0, r: 0}, e: {c: xMax, r: y}});
		me.workbook.SheetNames.push (sheet.name);
		me.workbook.Sheets [sheet.name] = ws;
	}
	build (opts) {
		let me = this;

		me.workbook = {
			SheetNames: [],
			Sheets: {}
		};
		_.each (opts ["styles"], function (style, name) {
			me.addStyle (name, style);
		});
		_.each (opts ["sheets"], function (sheet) {
			me.addSheet (sheet);
		});
	}
};

function report (req, res, next) {
	if (req.url.indexOf ("/report?") > -1 && req.query.format == "xlsx" && !req.query.view) {
		let opts = {};
		let body = req.body;

		if (body) {
			let fields = body.split ("&");

			for (let i = 0; i < fields.length; i ++) {
				let tokens = fields [i].split ("=");
				tokens [1] = tokens [1].split ("+").join ("%20");
				tokens [1] = unescape (tokens [1]);
				tokens [1] = new Buffer (tokens [1], "ascii").toString ("utf8");
				opts [tokens [0]] = JSON.parse (tokens [1]);
			}
		}
		let rep = new ReportXSLX ();

		rep.build (opts);
		fs.writeFile (config.rootDir + "/debug.json", JSON.stringify (opts, null, "\t"));
		log.debug ({workbook: rep.workbook});

		if (req.query.convert_csv) {
			let csv = XLSX.utils.sheet_to_csv (rep.workbook.Sheets [rep.workbook.SheetNames [0]], {FS: ";"});

			if (req.query.win1251) {
				let r = new Buffer (common.UnicodeToWin1251 (csv), "binary");
				res.header ("Content-Type", "application/x-download; charset=windows-1251");
				res.header ("Content-Disposition", "attachment; filename=report.csv");
				res.header ("Expires", "-1");
				res.header ("Content-Length", r.length);
				res.statusCode = 200;
				res.end (r);
			} else {
				res.header ("Content-Type", "application/x-download;");
				res.header ("Content-Disposition", "attachment; filename=report.csv");
				res.header ("Expires", "-1");
				res.header ("Content-Length", csv.length);
				res.statusCode = 200;
				res.end (csv);
			}
		} else {
			let buf = XLSX.write (rep.workbook, {
			    type: "base64"
			});
			let r = new Buffer (buf, "base64");

			res.header ("Content-Type", "application/x-download;");
			res.header ("Content-Disposition", "attachment; filename=report.xlsx");
			res.header ("Expires", "-1");
			res.header ("Content-Length", r.length);
			res.statusCode = 200;
			res.end (r);
		}
	} else {
		next ();
	}
};

module.exports = {
	report,
	ReportXSLX
};
