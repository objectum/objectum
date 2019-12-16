create unique index tschema_fid on tschema (fid);
create unique index tschema_fcode on tschema (fcode);

create index trevision_fdate on trevision (fdate);
create unique index trevision_fid on trevision (fid);
create index trevision_fschema_id on trevision (fschema_id);
create index trevision_frecord_id on trevision (frecord_id);

create index tview_fid on tview (fid);
create index tview_fcode on tview (fcode);
create unique index tview_ufid on tview (fid,fstart_id,fend_id);
create index tview_fname on tview (fname);
create index tview_fparent_id on tview (fparent_id);
create index tview_fsystem on tview (fsystem);
create index tview_fclass_id on tview (fclass_id);
create index tview_fstart_id on tview (fstart_id);
create index tview_fend_id on tview (fend_id);
create index tview_fschema_id on tview (fschema_id);
create index tview_frecord_id on tview (frecord_id);

create index tview_attr_fid on tview_attr (fid);
create index tview_attr_fclass_attr_id on tview_attr (fclass_attr_id);
create index tview_attr_fcode on tview_attr (fcode);
create unique index tview_attr_ufid on tview_attr (fid,fstart_id,fend_id);
create index tview_attr_fname on tview_attr (fname);
create index tview_attr_fview_id on tview_attr (fview_id);
create index tview_attr_farea on tview_attr (farea);
create index tview_attr_fstart_id on tview_attr (fstart_id);
create index tview_attr_fend_id on tview_attr (fend_id);
create index tview_attr_fschema_id on tview_attr (fschema_id);
create index tview_attr_frecord_id on tview_attr (frecord_id);

create index taction_fid on taction (fid);
create index taction_fclass_id on taction (fclass_id);
create index taction_fcode on taction (fcode);
create unique index taction_ufid on taction (fid,fstart_id,fend_id);
create index taction_fname on taction (fname);
create index taction_fstart_id on taction (fstart_id);
create index taction_fend_id on taction (fend_id);
create index taction_fschema_id on taction (fschema_id);
create index taction_frecord_id on taction (frecord_id);

create index tclass_fid on tclass (fid);
create index tclass_fcode on tclass (fcode);
create index tclass_fname on tclass (fname);
create index tclass_fparent_id on tclass (fparent_id);
create index tclass_fview_id on tclass (fview_id);
create index tclass_fstart_id on tclass (fstart_id);
create index tclass_fend_id on tclass (fend_id);
create index tclass_fschema_id on tclass (fschema_id);
create index tclass_frecord_id on tclass (frecord_id);

create index tclass_attr_fid on tclass_attr (fid);
create index tclass_attr_fclass_id on tclass_attr (fclass_id);
create index tclass_attr_ftype_id on tclass_attr (ftype_id);
create index tclass_attr_fcode on tclass_attr (fcode);
create index tclass_attr_fname on tclass_attr (fname);
create index tclass_attr_fstart_id on tclass_attr (fstart_id);
create index tclass_attr_fend_id on tclass_attr (fend_id);
create index tclass_attr_fschema_id on tclass_attr (fschema_id);
create index tclass_attr_frecord_id on tclass_attr (frecord_id);

create index tobject_fid on tobject (fid);
create index tobject_fclass_id on tobject (fclass_id);
create unique index tobject_ufid on tobject (fid,fstart_id,fend_id);
create index tobject_fstart_id on tobject (fstart_id);
create index tobject_fend_id on tobject (fend_id);
create index tobject_fschema_id on tobject (fschema_id);
create index tobject_frecord_id on tobject (frecord_id);

create index tobject_attr_fid on tobject_attr (fid);
create index tobject_attr_fobject_id on tobject_attr (fobject_id);
create index tobject_attr_fclass_attr_id on tobject_attr (fclass_attr_id);
create index tobject_attr_fend_id on tobject_attr (fend_id);
create index tobject_attr_fschema_id on tobject_attr (fschema_id);
create index tobject_attr_frecord_id on tobject_attr (frecord_id);
