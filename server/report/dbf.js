"use strict"

const common = require ("./../common");

class Dbf {
	constructor ({fields, rows, options}) {
		let me = this;

		me.options = {};
		me.fields = fields;
		me.rows = rows;
		me.options = options;
	}
	convertDate (d) {
		let s, r;

		if (!d) {
			r = "      ";
		} else {
			r = String (d.getFullYear ());
			s = d.getMonth () + 1;

			if (s < 10) {
				s = "0" + s;
			}
			r += String (s);
			s = d.getDate ();

			if (s < 10) {
				s = "0" + s;
			}
			r += String (s);
		}
		return r;
	}
	winToDos (buf) {
		let me = this;

		if (!me.dos) {
			let dos2 = {};

			dos2 ["А"] = 0x80;
			dos2 ["Б"] = 0x81;
			dos2 ["В"] = 0x82;
			dos2 ["Г"] = 0x83;
			dos2 ["Д"] = 0x84;
			dos2 ["Е"] = 0x85;
			dos2 ["Ё"] = 0xf0;
			dos2 ["Ж"] = 0x86;
			dos2 ["З"] = 0x87;
			dos2 ["И"] = 0x88;
			dos2 ["Й"] = 0x89;
			dos2 ["К"] = 0x8a;
			dos2 ["Л"] = 0x8b;
			dos2 ["М"] = 0x8c;
			dos2 ["Н"] = 0x8d;
			dos2 ["О"] = 0x8e;
			dos2 ["П"] = 0x8f;
			dos2 ["Р"] = 0x90;
			dos2 ["С"] = 0x91;
			dos2 ["Т"] = 0x92;
			dos2 ["У"] = 0x93;
			dos2 ["Ф"] = 0x94;
			dos2 ["Х"] = 0x95;
			dos2 ["Ц"] = 0x96;
			dos2 ["Ч"] = 0x97;
			dos2 ["Ш"] = 0x98;
			dos2 ["Щ"] = 0x99;
			dos2 ["Ы"] = 0x9b;
			dos2 ["Ь"] = 0x9c;
			dos2 ["Ъ"] = 0x9a;
			dos2 ["Э"] = 0x9d;
			dos2 ["Ю"] = 0x9e;
			dos2 ["Я"] = 0x9f;
			dos2 ["а"] = 0xa0;
			dos2 ["б"] = 0xa1;
			dos2 ["в"] = 0xa2;
			dos2 ["г"] = 0xa3;
			dos2 ["д"] = 0xa4;
			dos2 ["е"] = 0xa5;
			dos2 ["ё"] = 0xf1;
			dos2 ["ж"] = 0xa6;
			dos2 ["з"] = 0xa7;
			dos2 ["и"] = 0xa8;
			dos2 ["й"] = 0xa9;
			dos2 ["к"] = 0xaa;
			dos2 ["л"] = 0xab;
			dos2 ["м"] = 0xac;
			dos2 ["н"] = 0xad;
			dos2 ["о"] = 0xae;
			dos2 ["п"] = 0xaf;
			dos2 ["р"] = 0xe0;
			dos2 ["с"] = 0xe1;
			dos2 ["т"] = 0xe2;
			dos2 ["у"] = 0xe3;
			dos2 ["ф"] = 0xe4;
			dos2 ["х"] = 0xe5;
			dos2 ["ц"] = 0xe6;
			dos2 ["ч"] = 0xe7;
			dos2 ["ш"] = 0xe8;
			dos2 ["щ"] = 0xe9;
			dos2 ["ы"] = 0xeb;
			dos2 ["ь"] = 0xec;
			dos2 ["ъ"] = 0xea;
			dos2 ["э"] = 0xed;
			dos2 ["ю"] = 0xee;
			dos2 ["я"] = 0xef;

			me.dos = {};

			for (let key in dos2) {
				me.dos [key] = dos2 [key];
				me.dos [common.UnicodeToWin1251 (key)] = dos2 [key];
			}
		}
		for (let i = 0; i < buf.length; i ++) {
			let c = String.fromCharCode (buf [i]);

			if (me.dos [c]) {
				buf [i] = me.dos [c];
			}
		}
	}
	getBuffer (coding) {
		let me = this;
		let i, recordSize;
		let headerSize = 32 + 32 * me.fields.length + 1;
		let header = new Buffer (headerSize);
		let dateLastUpdate = new Date ();

		header [0] = 0x03; // нет примечаний
		header [1] = dateLastUpdate.getFullYear () - 1900;
		header [2] = dateLastUpdate.getMonth () + 1;
		header [3] = dateLastUpdate.getDate ();
		// Число записей в файле
		header.writeUInt32LE (me.rows.length, 4);
		// Число байт в заголовке
		header.writeUInt16LE (headerSize, 8);
		// Число байт в записи
		recordSize = 1;

		for (i = 0; i < me.fields.length; i ++) {
			recordSize += me.fields [i].size;
		}
		header.writeUInt16LE (recordSize, 10);

		for (i = 12; i <= 31; i ++) {
			header [i] = 0x00;
		}
		// Вектора описания полей
		for (i = 0; i < me.fields.length; i ++) {
			header.fill (0, 32 + 32 * i, 32 + 32 * i + 32);
			header.write (me.fields [i].name, 32 + 32 * i, me.fields [i].name.length);
			header.write (me.fields [i].type, 32 + 32 * i + 11, 1);
			header [32 + 32 * i + 16] = me.fields [i].size;
			header [32 + 32 * i + 17] = me.fields [i].dec;
		}
		// Конец векторов описания полей
		header [32 + 32 * i] = 0x0D;
		// Записи с данными
		let s, format, j, records = [header];

		for (i = 0; i < me.rows.length; i ++) {
			let record = new Buffer (recordSize);

			record.fill (0x20);
			j = 1;

			for (let k = 0; k < me.fields.length; k ++) {
				let field = me.fields [k];

				if (field.type == 'C') {
					s = me.rows [i][field.name] || "";

					if (s.length > field.size) {
						s = s.substr (0, field.size);
					}
				}
				if (field.type == 'N') {
					s = me.rows [i][field.name];
					//format = "%" + ToStr (it->size) + "s";
				}
				if (field.type == 'D') {
					s = me.convertDate (me.rows [i][field.name]);
				}
				let r;

				if (coding == "DOS") {
					r = new Buffer (common.UnicodeToWin1251 (s), "binary");
					me.winToDos (r);
				} else {
					r = new Buffer (common.UnicodeToWin1251 (s), "binary");
				}
				r.copy (record, j);
				j += field.size;
			}
			records.push (record);
		}
		let bufAll = Buffer.concat (records);

		if (records.length > 1) {
			for (let i = 0; i < records.length; i ++) {
				delete records [i];
			}
		}
		return bufAll;
	}
};

function report (request, response, next) {
	if (request.url.indexOf ('/report?') > -1 && request.query.format == "dbf") {
		let options = {};
		let fields = request.body.split ("&");

		for (let i = 0; i < fields.length; i ++) {
			let tokens = fields [i].split ("=");

			tokens [1] = tokens [1].split ("+").join ("%20");
			tokens [1] = unescape (tokens [1]);
			tokens [1] = new Buffer (tokens [1], "ascii").toString ("utf8");
			options [tokens [0]] = JSON.parse (tokens [1]);
		}
		let d = new Dbf (options);
		let b = d.getBuffer (options.options.coding);

		response
			.code (200)
			.header ("Content-Type", "application/x-download;")
			.header ("Content-Disposition", "attachment; filename=" + (options.options.filename || "data.dbf"))
			.header ("Expires", "-1")
			.header ("Content-Length", b.length)
			.send (b);
	} else {
		next ();
	}
}

module.exports = {
	report
};

