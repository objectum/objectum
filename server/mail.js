"use strict"

const _ = require ("lodash");
const nodemailer = require ("nodemailer");

let defaultSmtpTransport = nodemailer.createTransport ("SMTP", config.mail.smtp);
let smtpTransport = {};

function send ({session, from, to, subject, message, text, html, attachments}, cb) {
	let storage = session ? session.storage : null;

	if (!config.mail) {
		return cb ();
	}
	let st = defaultSmtpTransport;
	let storageSmtp = storage.config.smtp;

	if (storage && storageSmtp && storageSmtp.host) {
		from = storageSmtp.sender || from;

		if (!smtpTransport [storage.code]) {
			let smtpCfg = {
				host: storageSmtp.host,
				maxConnections: 50,
				port: 25,
				forceSender: storageSmtp.sender,
				auth: storageSmtp.username ? {
					user: storageSmtp.username,
					pass: storageSmtp.password
				} : undefined
			};

			smtpTransport [storage.code] = nodemailer.createTransport ("SMTP", smtpCfg);
		};
		st = smtpTransport [storage.code];
	} else {
		from = config.mail.smtp.forceSender || from;
	}

	let opts = {
		from,
		to,
		envelope: {
			from,
			to
		},
		subject,
		text: message || text,
		html: html || message,
		attachments
	};

	st.sendMail (opts, function (err, res) {
		if (err) {
			log.error ({cls: "mail", fn: "send"}, `Mail to (${to}) error: ${err}`);
			cb (err);
		} else {
			log.info ({cls: "mail", fn: "send"}, `Message sent (${to}): ${res.message}`);
			cb ();
		}
	});
};

module.exports = {
	send
};
