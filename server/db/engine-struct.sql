create table _class (
	fid bigserial not null,
	fparent_id bigint,
	fname varchar (256),
	fcode varchar (256) not null,
	fdescription text,
	forder numeric,
	fformat text,
	fview_id bigint,
	funlogged bigint,
	fopts text,
	fstart_id bigint
);

create table _class_attr (
	fid bigserial not null,
	fclass_id bigint not null,
	fclass_code varchar (256) not null,
	fname varchar (256),
	fcode varchar (256) not null,
	fdescription text,
	forder numeric,
	ftype_id bigint not null,
	fnot_null bigint,
	fsecure bigint,
	funique bigint,
	fremove_rule varchar (256),
	funlogged bigint,
	fopts text,
	fstart_id bigint
);

create table _view (
	fid bigserial not null,
	fparent_id bigint,
	fname varchar (256),
	fcode varchar (256) not null,
	fdescription text,
	forder numeric,
	flayout text,
	fquery text,
	fopts text,
	fstart_id bigint
);

create table _view_attr (
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
	fstart_id bigint
);

create table _object (
	fid bigserial not null,
	fclass_id bigint,
	fstart_id bigint
);

create table _opts (
	fid bigserial,
	fcode varchar (256) not null,
	fvalue text
);

create unlogged table _log (
	fid bigint,
	frsc_id bigint,
	foper_id bigint
);

alter table _class add primary key (fid);
alter table _class_attr add primary key (fid);
alter table _view add primary key (fid);
alter table _view_attr add primary key (fid);
alter table _object add primary key (fid);
alter table _opts add primary key (fid);

create unique index _class_fcode on _class (fparent_id, fcode);
create unique index _class_fcode_null on _class (fcode)  where fparent_id is null;
create unique index _class_attr_fcode on _class_attr (fclass_id, fcode);
create unique index _view_fcode on _view (fparent_id, fcode);
create unique index _view_fcode_null on _view (fcode) where fparent_id is null;
create unique index _view_attr_fcode on _view_attr (fview_id, fcode);
create unique index _opts_fcode on _opts (fcode);
