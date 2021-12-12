/*
	todo:
	$CURRENT_TIMESTAMP$
	unknown sessionId
	req.session object,
	req.fn,
	req.args,
	req.code - storage code
	session.storage
	
	backward compatibility:
	projects.setAttrs.beforeCommit
	/objectum/obj_news -> /projects/*

upload file

// Журнал
2018-11-23 понял что в данный момент делаю rebuild базы "insert records"
2018-11-24 оптимизация импорта
2019-04-06 надо доработать создание объектов
* insert into tobject -> insert into toc ...
* отключение set null на время импорта. tclass_attr_after_insert не создает not null при импорте.
* Что делать с уникальным индексом? моджет прийти временное значение конфликтное - пусть правят уникальные в файле или БД перед импортом.

current transaction is aborted появляется при старте следующей странзакции => если ошибка то rollback. При старте транзакции если транзакция прошлая не завершена то давать ошибку.

2019-04-16 если node-4 не запущен то objectum-app бесконечно пытается подключиться, делает быстро. fixed

2019-04-26
{"name":"objectum","hostname":"MacBook-Pro-Dmitrij.local","pid":33912,"level":50,"fn":"postgres.query",
"error":{"name":"error","length":579,"severity":"ERROR","code":"23503","detail":"Key (certificate_2184)=(4447944) is not present in table \"certificate_1291\".","where":"SQL statement \"alter table declaration_1290 add constraint declaration_1290_certificate_2184_fk foreign key (certificate_2184) references certificate_1291 (fobject_id) on delete set null\"\nPL/pgSQL function column_util(bigint,text) line 83 at EXECUTE","schema":"klgd_dop","table":"declaration_1290","constraint":"declaration_1290_certificate_2184_fk","file":"ri_triggers.c","line":"3266","routine":"ri_ReportViolation"},"msg":"postgres.query: select column_util (2184, 'setNotNull,createIndex,createForeignKey'); ","time":{"type":"datetime","value":"2019-04-26T19:48:51.164Z"},"v":0}
2019-04-27
"error":{"name":"error","length":369,"severity":"ОШИБКА","code":"23502","where":"SQL-оператор: \"alter table contest_1138 alter column contestType_1599 set not null\"\nфункция PL/pgSQL column_util(bigint,text), строка 62, оператор EXECUTE","schema":"klgd_dop","table":"contest_1138","column":"contesttype_1599","file":"tablecmds.c","line":"4573","routine":"ATRewriteTable"},"msg":"postgres.query: select column_util (1599, 'setNotNull,createIndex,createForeignKey'); ","time":{"type":"datetime","value":"2019-04-27T11:10:31.118Z"},"v":0}
(node:40056) UnhandledPromiseRejectionWarning: error: столбец "contesttype_1599" содержит значения NULL
klgd_dop=> select *
	from tobject o
left join tobject_attr oa on (oa.fobject_id = o.fid and oa.fend_id = 2147483647 and oa.fclass_attr_id = 1599)
where o.fclass_id = 1138 and o.fend_id = 2147483647 and oa.fid is null;
fid   | fclass_id | fstart_id |  fend_id   | fschema_id | frecord_id | fid | fobject_id | fclass_attr_id | fstring | fnumber | ftime | fstart_id | fend_id | fschema_id | frecord_id
---------+-----------+-----------+------------+------------+------------+-----+------------+----------------+---------+---------+-------+-----------+---------+------------+------------
1516036 |      1138 |   1334756 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1362241 |      1138 |   1130261 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
2841610 |      1138 |   2692349 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
2841606 |      1138 |   2692336 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
2841602 |      1138 |   2692310 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1348590 |      1138 |   1112628 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1461427 |      1138 |   1254512 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1515311 |      1138 |   1333641 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1434115 |      1138 |   1222105 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1623341 |      1138 |   1462075 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
2841216 |      1138 |   2691609 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1469486 |      1138 |   1268010 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
2841485 |      1138 |   2692177 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1348707 |      1138 |   1112832 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1361978 |      1138 |   1129801 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1434085 |      1138 |   1222051 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
2841646 |      1138 |   2692409 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1461609 |      1138 |   1254675 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1348544 |      1138 |   1112511 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
2841288 |      1138 |   2691760 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1622747 |      1138 |   1461557 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
2841327 |      1138 |   2691841 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1238560 |      1138 |    978455 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
2841611 |      1138 |   2692352 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1362179 |      1138 |   1130118 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1506768 |      1138 |   1321291 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
2841608 |      1138 |   2692342 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
2594404 |      1138 |   2376519 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1434057 |      1138 |   1221991 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1515351 |      1138 |   1333702 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
971938 |      1138 |    573144 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1433993 |      1138 |   1221785 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1361916 |      1138 |   1129691 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1461367 |      1138 |   1254422 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1362209 |      1138 |   1130172 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
1515824 |      1138 |   1334289 | 2147483647 |            |            |     |            |                |         |         |       |           |         |            |
updateNullNotNull - в проуессе удаляет объекты на которые есть ссылки

2019-05-28 Убрать в легаси readAuthInfo. Сделать просто по objectum.user, objectum.role, objectum.menu

 */