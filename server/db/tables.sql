create table tschema (
	fid bigserial not null,
	fparent_id bigint,
	fname text,
	fcode text,
	forder numeric
);

create table trevision (
	fid bigserial not null,
	fsubject_id bigint,
	fdate timestamp (6),
	fdescription text,
	fremote_addr text,
	fschema_id bigint,
	frecord_id bigint
);

create table tview (
	fid bigserial not null,
	fparent_id bigint,
	fname varchar (256),
	fcode varchar (256),
	fdescription text,
	forder numeric,
	fquery text,
	flayout text,
	ficon_cls varchar (256),
	fsystem bigint,
	fclass_id bigint,
	fopts text,
	fstart_id bigint,
	fend_id bigint,
	fschema_id bigint,
	frecord_id bigint
);

create table tview_attr (
	fid bigserial not null,
	fview_id bigint,
	fname varchar (256),
	fcode varchar (256),
	fdescription text,
	forder numeric,
	fclass_attr_id bigint,
	farea bigint,
	fcolumn_width bigint,
	fopts text,
	fstart_id bigint,
	fend_id bigint,
	fschema_id bigint,
	frecord_id bigint
);

create table taction (
	fid bigserial not null,
	fclass_id bigint,
	fname varchar (256),
	fcode varchar (256),
	fdescription text,
	forder numeric,
	fbody text,
	flayout text,
	fopts text,
	fstart_id bigint,
	fend_id bigint,
	fschema_id bigint,
	frecord_id bigint
);

create table tclass (
	fid bigserial not null,
	fparent_id bigint,
	fname varchar (256),
	fcode varchar (256),
	fdescription text,
	forder numeric,
	fformat text,
	fview_id bigint,
	funlogged bigint,
	fopts text,
	fstart_id bigint,
	fend_id bigint,
	fschema_id bigint,
	frecord_id bigint
);

create table tclass_attr (
	fid bigserial not null,
	fclass_id bigint,
	fname varchar (256),
	fcode varchar (256),
	fdescription text,
	forder numeric,
	ftype_id bigint,
	fnot_null bigint,
	fsecure bigint,
	funique bigint,
	fvalid_func text,
	fremove_rule varchar (256),
	funlogged bigint,
	fopts text,
	fstart_id bigint,
	fend_id bigint,
	fschema_id bigint,
	frecord_id bigint
);

create table tobject (
	fid bigserial not null,
	fclass_id bigint,
	fstart_id bigint,
	fend_id bigint,
	fschema_id bigint,
	frecord_id bigint
);

create table tobject_attr (
	fid bigserial not null,
	fobject_id bigint,
	fclass_attr_id bigint,
	fstring text,
	fnumber numeric,
	ftime timestamp (6),
	fstart_id bigint,
	fend_id bigint,
	fschema_id bigint,
	frecord_id bigint
);

