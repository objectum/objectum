-- _view before delete
create or replace function trigger_view_before_delete () returns trigger as
$$
declare
	num bigint;
begin
	select count (*) into num from _view where fparent_id = OLD.fid;

    if (num > 0) then
        raise exception 'view has child views';
    end if;

	return OLD;
end;
$$ language plpgsql;

drop trigger if exists _view_before_delete on _view;
create trigger _view_before_delete
before delete on _view for each row
execute procedure trigger_view_before_delete ();

-- _class before delete
create or replace function trigger_class_before_delete () returns trigger as
$$
declare
	num bigint;
begin
	select count (*) into num from _class where fparent_id = OLD.fid;

    if (num > 0) then
        raise exception 'class has child classes';
    end if;

	select count (*) into num from _class_attr where fclass_id = OLD.fid;

    if (num > 0) then
        raise exception 'class has attributes';
    end if;

	return OLD;
end;
$$ language plpgsql;

drop trigger if exists _class_before_delete on _class;
create trigger _class_before_delete
before delete on _class for each row
execute procedure trigger_class_before_delete ();

-- tclass after insert
create or replace function trigger_tclass_after_insert () returns trigger as
$$
declare
	tableName varchar (256);
	classCode varchar (256);
	parentId bigint;
	unlogged bigint;
begin
	if (NEW.fend_id = 0) then
		tableName = NEW.fcode || '_' || NEW.fid;

		select fcode, fparent_id, funlogged into classCode, parentId, unlogged from _class where fid = NEW.fid;

		if (classCode is null) then
			insert into _class (
				fid, fparent_id, fname, fcode, fdescription, forder, fformat, fview_id, funlogged, fopts, fstart_id
			) values (
				NEW.fid, NEW.fparent_id, NEW.fname, NEW.fcode, NEW.fdescription, NEW.forder, NEW.fformat, NEW.fview_id, NEW.funlogged, NEW.fopts, NEW.fstart_id
			);

			if (NEW.fid >= 1000) then
			    perform table_util (NEW.fid, 'createTable,createForeignKey');
			end if;

			perform trigger_factory (NEW.fid);
		else
			if (classCode <> NEW.fcode) then
				raise exception 'can''t change after creation: code';
			end if;

			if (parentId <> NEW.fparent_id or (parentId is null and NEW.fparent_id is not null) or (parentId is not null and NEW.fparent_id is null)) then
				raise exception 'can''t change after creation: parent_id';
			end if;

			if (unlogged <> NEW.funlogged or (unlogged is null and NEW.funlogged is not null) or (unlogged is not null and NEW.funlogged is null)) then
				raise exception 'can''t change after creation: unlogged';
			end if;

			update _class set
				fname = NEW.fname,
				fdescription = NEW.fdescription,
				forder = NEW.forder,
				fformat = NEW.fformat,
				fview_id = NEW.fview_id,
				fopts = NEW.fopts,
				fstart_id = NEW.fstart_id
			where
				fid = NEW.fid;

			perform trigger_factory (NEW.fid);
		end if;
	end if;

	return NEW;
end;
$$ language plpgsql;

drop trigger if exists tclass_after_insert on tclass;

create trigger tclass_after_insert
after insert on tclass for each row
execute procedure trigger_tclass_after_insert ();

-- tclass after update
create or replace function trigger_tclass_after_update () returns trigger as
$$
declare
	startId bigint;
begin
	select fstart_id into startId from _class where fid = NEW.fid;

	if (NEW.fstart_id = startId) then
		execute 'delete from _class where fid = ' || NEW.fid;

		if (NEW.fid >= 1000) then
			execute 'drop table ' || NEW.fcode || '_' || NEW.fid;
		end if;

    	raise notice 'class removed: %', NEW.fid;
	end if;

	return NEW;
end;
$$ language plpgsql;

drop trigger if exists tclass_after_update on tclass;

create trigger tclass_after_update
after update on tclass for each row
execute procedure trigger_tclass_after_update ();

-- tclass_attr after insert
create or replace function trigger_tclass_attr_after_insert () returns trigger as
$$
declare
	classCode varchar (256);
	tableName varchar (256);
	columnName varchar (256);
	columnType varchar (64);
	caCode varchar (256);
	caClassId bigint;
	caTypeId bigint;
	caUnique bigint;
	caNotNull bigint;
	caRemoveRule varchar (64);
	removeRule varchar (64);
	unlogged bigint;
	revisionId bigint;
begin
	select fcode into classCode from _class where fid = NEW.fclass_id;

	if (classCode is not null and NEW.fend_id = 0) then
		select fcode, fclass_id, ftype_id, funique, fnot_null, fremove_rule, funlogged into caCode, caClassId, caTypeId, caUnique, caNotNull, caRemoveRule, unlogged from _class_attr where fid = NEW.fid;

		columnName := NEW.fcode || '_' || NEW.fid;
		tableName := classCode || '_' || NEW.fclass_id;

		if (caCode is null) then
			insert into _class_attr (
				fid, fclass_id, fclass_code, fname, fcode, fdescription, forder, ftype_id, fnot_null, fsecure, funique, fremove_rule, funlogged, fopts, fstart_id
			) values (
				NEW.fid, NEW.fclass_id, classCode, NEW.fname, NEW.fcode, NEW.fdescription, NEW.forder, NEW.ftype_id, NEW.fnot_null, NEW.fsecure, NEW.funique, NEW.fremove_rule, NEW.funlogged, NEW.fopts, NEW.fstart_id
			);

			perform column_util (NEW.fid, 'createColumn,createTable,setNotNull,createIndex,createForeignKey');
		else
			if (caCode <> NEW.fcode) then
				raise exception 'can''t change after creation: code - %, %. classAttr: %', caCode, NEW.fcode, NEW.fid;
			end if;
			if (caClassId <> NEW.fclass_id) then
				raise exception 'can''t change after creation: class - %, %. classAttr: %', caClassId, NEW.fclass_id, NEW.fid;
			end if;
			if (caTypeId <> NEW.ftype_id) then
				raise exception 'can''t change after creation: type - %, %. classAttr: %', caTypeId, NEW.ftype_id, NEW.fid;
			end if;
			if (unlogged <> NEW.funlogged or (unlogged is null and NEW.funlogged is not null) or (unlogged is not null and NEW.funlogged is null)) then
				raise exception 'can''t change after creation: unlogged. classAttr: %',NEW.fid;
			end if;
			if (caUnique <> NEW.funique or (caUnique is null and NEW.funique is not null) or (caUnique is not null and NEW.funique is null)) then
			    if (NEW.funique is null or NEW.funique = 0) then
                    execute 'drop index if exists ' || tableName || '_' || columnName;
			    else
                    execute 'create unique index ' || tableName || '_' || columnName || ' on ' || tableName || ' (' || columnName || ')';
			    end if;
			end if;
			if (caNotNull <> NEW.fnot_null or (caNotNull is null and NEW.fnot_null is not null) or (caNotNull is not null and NEW.fnot_null is null)) then
                select current_setting ('objectum.revision_id') into revisionId;

                if (revisionId > 0) then
                    if (NEW.fnot_null is null or NEW.fnot_null = 0) then
                        execute 'alter table ' || tableName || ' alter column ' || columnName || ' drop not null';
                    else
                        execute 'alter table ' || tableName || ' alter column ' || columnName || ' set not null';
                    end if;
                end if;
			end if;

			update _class_attr set
				fname = NEW.fname,
				fdescription = NEW.fdescription,
				forder = NEW.forder,
				fnot_null = NEW.fnot_null,
				fsecure = NEW.fsecure,
				fremove_rule = NEW.fremove_rule,
				fopts = NEW.fopts,
				fstart_id = NEW.fstart_id
			where
				fid = NEW.fid;

            -- foreign key
			if (caTypeId >= 1000 and (caRemoveRule <> NEW.fremove_rule or (caRemoveRule is null and NEW.fremove_rule is not null))) then
			    removeRule := 'set null';

			    if (NEW.fremove_rule = 'cascade') then
			        removeRule := 'cascade';
			    end if;

			    if (NEW.fremove_rule = 'set null') then
			        removeRule := 'set null';
			    end if;

                if (NEW.fremove_rule = 'no action') then
                    removeRule := '';
                end if;

            	select fcode into classCode from _class where fid = NEW.ftype_id;

			    execute format ('alter table %s drop constraint %1$s_%s_fk', tableName, columnName);

			    if (removeRule <> '') then
                    execute format ('alter table %s add constraint %1$s_%s_fk foreign key (%2$s) references %s (fobject_id) on delete %s',
                        tableName, columnName, classCode || '_' || NEW.ftype_id, removeRule
                    );
                end if;
			end if;
		end if;

		perform trigger_factory (NEW.fclass_id);
	end if;

	return NEW;
end;
$$ language plpgsql;

drop trigger if exists tclass_attr_after_insert on tclass_attr;

create trigger tclass_attr_after_insert
after insert on tclass_attr for each row
execute procedure trigger_tclass_attr_after_insert ();

-- tclass_attr after update
create or replace function trigger_tclass_attr_after_update () returns trigger as
$$
declare
	startId bigint;
	classCode varchar (256);
begin
	select fstart_id, fclass_code into startId, classCode from _class_attr where fid = NEW.fid;

	if (NEW.fstart_id = startId) then
		execute 'delete from _class_attr where fid = ' || NEW.fid;
		execute 'alter table ' || classCode || '_' || NEW.fclass_id || ' drop column ' || NEW.fcode || '_' || NEW.fid || ' cascade';

		perform trigger_factory (NEW.fclass_id);
	end if;

	return NEW;
end;
$$ language plpgsql;

drop trigger if exists tclass_attr_after_update on tclass_attr;

create trigger tclass_attr_after_update
after update on tclass_attr for each row
execute procedure trigger_tclass_attr_after_update ();

-- tview after insert
create or replace function trigger_tview_after_insert () returns trigger as
$$
declare
	viewCode varchar (256);
begin
	select fcode into viewCode from _view where fid = NEW.fid;

	if (NEW.fsystem is null and NEW.fend_id = 0) then
		if (viewCode is null) then
			insert into _view (
				fid, fparent_id, fname, fcode, fdescription, forder, flayout, fquery, fopts, fstart_id
			) values (
				NEW.fid, NEW.fparent_id, NEW.fname, NEW.fcode, NEW.fdescription, NEW.forder, NEW.flayout, NEW.fquery, NEW.fopts, NEW.fstart_id
			);
		else
			update _view set
				fparent_id = NEW.fparent_id,
				fname = NEW.fname,
				fcode = NEW.fcode,
				fdescription = NEW.fdescription,
				forder = NEW.forder,
				flayout = NEW.flayout,
				fquery = NEW.fquery,
				fopts = NEW.fopts,
				fstart_id = NEW.fstart_id
			where
				fid = NEW.fid;
		end if;
	end if;

	return NEW;
end;
$$ language plpgsql;

drop trigger if exists tview_after_insert on tview;

create trigger tview_after_insert
after insert on tview for each row
execute procedure trigger_tview_after_insert ();

-- tview after update
create or replace function trigger_tview_after_update () returns trigger as
$$
declare
	startId bigint;
begin
	select fstart_id into startId from _view where fid = NEW.fid;

	if (NEW.fsystem is null and startId is not null and NEW.fstart_id = startId) then
		execute 'delete from _view where fid = ' || NEW.fid;
	end if;

	return NEW;
end;
$$ language plpgsql;

drop trigger if exists tview_after_update on tview;

create trigger tview_after_update
after update on tview for each row
execute procedure trigger_tview_after_update ();

-- tobject after insert
create or replace function trigger_tobject_after_insert () returns trigger as
$$
declare
	id bigint;
	startId bigint;
	classId bigint;
	revisionId bigint;
begin
    id = NEW.fid;
    classId = NEW.fclass_id;
    startId = NEW.fstart_id;

	begin
		select current_setting ('objectum.revision_id') into revisionId;

		if (revisionId > 0) then
    		return NEW;
    	end if;
	exception when others then
	end;

    if (NEW.fend_id = 0) then
        insert into _object (fid, fclass_id, fstart_id) values (id, classId, startId);
        insert into _log (fid, frsc_id, foper_id) values (id, 12, 1);
        perform create_object_record (classId, id, classId);
    end if;

	return NEW;
end;
$$ language plpgsql;

drop trigger if exists tobject_after_insert on tobject;

create trigger tobject_after_insert
after insert on tobject for each row
execute procedure trigger_tobject_after_insert ();

-- tobject after update
create or replace function trigger_tobject_after_update () returns trigger as
$$
declare
	startId bigint;
	classCode varchar (256);
	classId bigint;
	id bigint;
	revisionId bigint;
begin
	begin
		select current_setting ('objectum.revision_id') into revisionId;

		if (revisionId > 0) then
    		return NEW;
    	end if;
	exception when others then
	end;

    id = NEW.fid;
    classId = NEW.fclass_id;

	select fstart_id into startId from _object where fid = id;

	if (NEW.fstart_id = startId) then
		delete from _object where fid = id;

		select fcode into classCode from _class where fid = classId;

        execute 'delete from ' || classCode || '_' || classId || ' where fobject_id = ' || id;

    	insert into _log (fid, frsc_id, foper_id) values (id, 12, 3);
	end if;

	return NEW;
end;
$$ language plpgsql;

drop trigger if exists tobject_after_update on tobject;

create trigger tobject_after_update
after update on tobject for each row
execute procedure trigger_tobject_after_update ();

-- tobject_attr after insert
create or replace function trigger_tobject_attr_after_insert () returns trigger as
$$
declare
	classCode varchar (256);
	classId bigint;
	caCode varchar (256);
	val text;
	revisionId bigint;
begin
	begin
		select current_setting ('objectum.revision_id') into revisionId;

		if (revisionId > 0) then
    		return NEW;
    	end if;
	exception when others then
	end;

	select fclass_code, fclass_id, fcode into classCode, classId, caCode from _class_attr where fid = NEW.fclass_attr_id;

--	if (classCode is not null) then
		val = 'null';

		if (NEW.fstring is not null) then
			val = '''' || replace (NEW.fstring, '''', '''''') || '''';
		end if;

		if (NEW.ftime is not null) then
			val = '''' || to_char (NEW.ftime, 'DD.MM.YYYY HH24:MI:SS.MS') || '''';
		end if;

		if (NEW.fnumber is not null) then
			val = '''' || NEW.fnumber::text || '''';
		end if;

--		begin
        if (classCode is not null) then
			execute 'update ' || classCode || '_' || classId || ' set ' || caCode || '_' || NEW.fclass_attr_id || ' = ' || val || ' where fobject_id = ' || NEW.fobject_id;
		end if;
--		exception when others then
--		end;
--	end if;
	return NEW;
end;
$$ language plpgsql;

drop trigger if exists tobject_attr_after_insert on tobject_attr;

create trigger tobject_attr_after_insert
after insert on tobject_attr for each row
execute procedure trigger_tobject_attr_after_insert ();

create or replace function trigger_factory (classId bigint) returns void as
$$
declare
	tableName varchar (256);
	columnName varchar (256);
	classCode varchar (256);
	parentId bigint;
	prevClassId bigint;
	revisionId bigint;
	taiu text;
	tad text;
	rec record;
	pos bigint;
begin
	begin
		select current_setting ('objectum.revision_id') into revisionId;

		if (revisionId = 0) then
		    return;
		end if;
	exception when others then
		return;
	end;

	select fcode, fparent_id into classCode, parentId from _class where fid = classId;

	if (classCode is null) then
		raise exception 'unknown classId: %', classId;
	end if;

	perform update_class_triggers (classId);

	tableName := classCode || '_' || classId;

	-- header
	taiu := format (
'create or replace function trigger_%s_after_insert_or_update () returns trigger as
$t1$
declare
	revisionId bigint;
	value text;
	changed boolean;
begin
	begin
		select current_setting (''objectum.revision_id'') into revisionId;

		if (revisionId = 0) then
		    return NEW;
		end if;
	exception when others then
		return NEW;
	end;
	changed := False;

    if (TG_OP = ''INSERT'' and NEW.fclass_id = %s) then
        insert into _object (fid, fclass_id, fstart_id) values (NEW.fobject_id, NEW.fclass_id, revisionId);
	    insert into _log (fid, frsc_id, foper_id) values (NEW.fobject_id, 12, 1);
	    insert into tobject (fid, fclass_id, fstart_id, fend_id) values (NEW.fobject_id, NEW.fclass_id, revisionId, 0);
    end if;', tableName, classId);

    tad := format (
'create or replace function trigger_%s_after_delete () returns trigger as
$t1$
declare
    revisionId bigint;
begin
    begin
        select current_setting (''objectum.revision_id'') into revisionId;
        if (revisionId = 0) then
            return OLD;
        end if;
    exception when others then
        return OLD;
    end;
    if (OLD.fclass_id = %s) then
        delete from _object where fid = OLD.fobject_id;
        insert into _log (fid, frsc_id, foper_id) values (OLD.fobject_id, 12, 3);
        execute ''update tobject set fend_id = '' || revisionId || '' where fend_id = 0 and fid = '' || OLD.fobject_id;', tableName, classId);

    loop
        exit when parentId is null;

        prevClassId := parentId;
        select fcode, fparent_id into classCode, parentId from _class where fid = parentId;

        tad := tad || format ('
        execute ''delete from %s_%s where fobject_id = '' || OLD.fobject_id;', classCode, prevClassId);
    end loop;

    tad := tad || format ('
    end if;
    return OLD;
end;
$t1$ language plpgsql;
drop trigger if exists %s_after_delete on %1$s;
create trigger %1$s_after_delete
after delete on %1$s for each row
execute procedure trigger_%1$s_after_delete ();', tableName);

	-- class attributes
	for rec in select fid, fcode, ftype_id from _class_attr where fclass_id = classId
    loop
    	columnName := rec.fcode || '_' || rec.fid;
 		taiu := taiu || format ('
    if ((TG_OP = ''INSERT'' and NEW.%s is not null) or
	    (TG_OP = ''UPDATE'' and ((OLD.%1$s is null and NEW.%1$s is not null) or (OLD.%1$s is not null and NEW.%1$s is null) or (OLD.%1$s <> NEW.%1$s)))
	) then
	    if (TG_OP = ''UPDATE'') then
		    execute ''update tobject_attr set fend_id = '' || revisionId || '' where fend_id = 0 and fobject_id = '' || NEW.fobject_id || '' and fclass_attr_id = %s'';
        end if;

		value := ''null'';
		changed := True;', columnName, rec.fid);

 		if (rec.ftype_id = 1 or rec.ftype_id = 5) then
 			taiu := taiu || format ('
		if (NEW.%s is not null) then
			value = '''''''' || replace (NEW.%1$s, '''''''', '''''''''''') || '''''''';
		end if;', columnName);
		elsif (rec.ftype_id = 3) then
		    select position ('DMY' in current_setting ('datestyle')) into pos;

		    if (pos > 0) then
 			    taiu := taiu || format ('
		if (NEW.%s is not null) then
			value = '''''''' || to_char (NEW.%1$s, ''DD.MM.YYYY HH24:MI:SS.MS'') || '''''''';
		end if;', columnName);
		    else
 			    taiu := taiu || format ('
		if (NEW.%s is not null) then
			value = '''''''' || to_char (NEW.%1$s, ''MM.DD.YYYY HH24:MI:SS.MS'') || '''''''';
		end if;', columnName);
		    end if;
		else
 			taiu := taiu || format ('
		if (NEW.%s is not null) then
			value = '''''''' || NEW.%1$s::text || '''''''';
		end if;', columnName);
		end if;

        taiu := taiu || '
		execute ''insert into tobject_attr (fobject_id, fclass_attr_id, ';

 		if (rec.ftype_id = 1 or rec.ftype_id = 5) then
 			taiu := taiu || 'fstring, ';
 		elsif (rec.ftype_id = 3) then
 			taiu := taiu || 'ftime, ';
 		else
 			taiu := taiu || 'fnumber, ';
 		end if;

 		taiu := taiu || format ('fstart_id, fend_id) values ('' || NEW.fobject_id || '', %s, '' || value || '', '' || revisionId || '', 0)'';
	end if;', rec.fid);

    end loop;

	-- footer
	taiu := taiu || format ('
	if (changed = True) then
		execute ''insert into _log (fid, frsc_id, foper_id) values ('' || NEW.fobject_id || '', 12, 2)'';
	end if;

	return NEW;
end;
$t1$ language plpgsql;

drop trigger if exists %s_after_insert_or_update on %1$s;
create trigger %1$s_after_insert_or_update
after insert or update on %1$s for each row
execute procedure trigger_%1$s_after_insert_or_update ();', tableName);

	execute taiu;
	raise notice '%', taiu;
	execute tad;
	raise notice '%', tad;
end;
$$ language plpgsql;

create or replace function table_util (classId bigint, opts text) returns void as
$$
declare
	tableName varchar (256);
	classCode varchar (256);
	parentId bigint;
begin
    select fcode, fparent_id into classCode, parentId from _class where fid = classId;

    tableName = classCode || '_' || classId;

    if (position ('createTable' in opts) > 0) then
        execute format ('create table %s (fobject_id bigint not null default nextval (''tobject_fid_seq''), fclass_id bigint not null)', tableName);
        execute format ('alter table %s add primary key (fobject_id)', tableName);
    end if;

    if (position ('createForeignKey' in opts) > 0) then
        if (parentId is not null) then
            select fcode into classCode from _class where fid = parentId;
            execute format ('alter table %s add constraint %1$s_fobject_id_fk
                foreign key (fobject_id) references %s_%s (fobject_id) on delete cascade', tableName, classCode, parentId);
        end if;
    end if;
end;
$$ language plpgsql;

create or replace function column_util (classAttrId bigint, opts text) returns void as
$$
declare
	classCode varchar (256);
	tableName varchar (256);
	columnName varchar (256);
	columnType varchar (64);
	caCode varchar (256);
	caClassId bigint;
	caTypeId bigint;
	caUnique bigint;
	caNotNull bigint;
	caRemoveRule varchar (64);
	removeRule varchar (64);
	caUnlogged bigint;
	cUnlogged bigint;
	createOA bigint;
begin
    select fclass_code, fcode, fclass_id, ftype_id, funique, fnot_null, fremove_rule, funlogged into classCode, caCode, caClassId, caTypeId, caUnique, caNotNull, caRemoveRule, caUnlogged from _class_attr where fid = classAttrId;
    select funlogged into cUnlogged from _class where fid = caClassId;

    columnName := caCode || '_' || classAttrId;
    tableName := classCode || '_' ||caClassId;

    if (position ('createColumn' in opts) > 0) then
        columnType := 'bigint';

        if (caTypeId = 3) then
            columnType := 'timestamp (6)';
        end if;
        if (caTypeId = 2) then
            columnType := 'numeric';
        end if;
        if (caTypeId = 1 or caTypeId = 5) then
            columnType := 'text';
        end if;

        execute 'alter table ' || tableName || ' add column ' || columnName || ' ' || columnType;
    end if;

    if (position ('createTable' in opts) > 0) then
        createOA := 1;

        if (cUnlogged = 1 or ((cUnlogged is null or cUnlogged = 0) and caUnlogged = 1)) then
            createOA := 0;
        end if;

        execute 'create table tobject_attr_' || classAttrId || ' (like tobject_attr including all)';
        execute 'alter table tobject_attr_' || classAttrId || ' inherit tobject_attr';
        execute 'create rule tobject_attr_' || classAttrId || '_insert as on insert to tobject_attr where fclass_attr_id = ' || classAttrId || ' do instead insert into tobject_attr_' || classAttrId || ' values (NEW.*)';
        execute 'create trigger tobject_attr_' || classAttrId || '_after_insert after insert on tobject_attr_' || classAttrId || ' for each row execute procedure trigger_tobject_attr_after_insert ()';
    end if;

    if (position ('createIndex' in opts) > 0) then
        if (caUnique is not null and caUnique = 1) then
            execute 'create unique index ' || tableName || '_' || columnName || ' on ' || tableName || ' (' || columnName || ')';
        elsif (caTypeId = 12 or caTypeId >= 1000) then
            -- 	execute 'create index ' || tableName || '_' || columnName || ' on ' || tableName || ' (' || columnName || ') (substr (' || columnName || ', 1, 1024))';
            execute 'create index ' || tableName || '_' || columnName || ' on ' || tableName || ' (' || columnName || ')';
        end if;
    end if;

    if (position ('setNotNull' in opts) > 0 and caNotNull = 1) then
        execute 'alter table ' || tableName || ' alter column ' || columnName || ' set not null';
    end if;

    if (position ('createForeignKey' in opts) > 0 and caTypeId >= 1000) then
        removeRule := 'set null';

        if (caRemoveRule = 'cascade') then
            removeRule := 'cascade';
        end if;

        if (caRemoveRule = 'set null') then
            removeRule := 'set null';
        end if;

        if (caRemoveRule = 'no action') then
            removeRule := '';
        end if;

		if (removeRule <> '') then
            select fcode into classCode from _class where fid = caTypeId;

            execute format ('alter table %s add constraint %1$s_%s_fk foreign key (%2$s) references %s (fobject_id) on delete %s',
                tableName, columnName, classCode || '_' || caTypeId, removeRule
            );
        end if;
    end if;
end;
$$ language plpgsql;

create or replace function create_object_record (classId bigint, objectId bigint, originalClassId bigint) returns void as
$$
declare
	classCode varchar (256);
	parentId bigint;
begin
	select fcode, fparent_id into classCode, parentId from _class where fid = classId;

    if (classCode is not null) then
        if (parentId is not null) then
            perform create_object_record (parentId, objectId, originalClassId);
        end if;

        execute 'insert into ' || classCode || '_' || classId || ' (fobject_id, fclass_id) values (' || objectId || ',' || originalClassId || ')';
    end if;
end;
$$ language plpgsql;

create or replace function remove_object_record (classId bigint, objectId bigint) returns void as
$$
declare
	classCode varchar (256);
	parentId bigint;
begin
	select fcode, fparent_id into classCode, parentId from _class where fid = classId;

    if (classCode is not null) then
        if (parentId is not null) then
            perform remove_object_record (parentId, objectId);
        end if;

        execute 'delete from ' || classCode || '_' || classId || ' where fobject_id = ' || objectId;
    end if;
end;
$$ language plpgsql;

create or replace function update_class_triggers (classId bigint) returns void as
$$
declare
    names text[] = array['before_insert_or_update', 'before_insert', 'before_update', 'before_delete', 'after_insert_or_update', 'after_insert', 'after_update', 'after_delete'];
    name text;
    i integer;
    body text;
    triggerSQL text;
	columnName varchar (256);
    rec record;
    classCode text;
    tableName text;
    action text;
    returnValue text;
begin
    select fcode into classCode from _class where fid = classId;
    tableName = classCode || '_' || classId;

    for i in 1 .. array_upper(names, 1)
    loop
        name = names [i];
        action = replace (name, '_', ' ');

        execute 'select fopts::json->''trigger''->>''' || name || ''' from _class where fid=' || classId into body;

        if (body is not null) then
            for rec in select fid, fcode from _class_attr where fclass_id = classId
            loop
                columnName = rec.fcode || '_' || rec.fid;
                body = replace (body, '{' || rec.fcode || '}', columnName);
            end loop;

            returnValue = 'NEW';

            if (name = 'before_delete' or name = 'after_delete') then
                returnValue = 'OLD';
            end if;

            triggerSQL = format ('
create or replace function user_trigger_%s_%s () returns trigger as ''
begin
%s
return %s;
end;
'' language plpgsql;

drop trigger if exists user_trigger_%1$s_%2$s on %1$s;
create trigger user_trigger_%1$s_%2$s', tableName, name, body, returnValue, action) || format ('
%s on %s for each row
execute procedure user_trigger_%2$s_%s ();
', action, tableName, name);
            execute triggerSQL;
        else
            execute 'drop trigger if exists user_trigger_' || tableName || '_' || name || ' on ' || tableName;
        end if;
    end loop;
end;
$$ language plpgsql;
