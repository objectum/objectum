# Objectum
Objectum platform makes it easy to create realtime single page applications that run in both Node.js and browsers.
 
Requirements: [Redis](https://redis.io/), [PostgreSQL >= 9.x](https://www.postgresql.org/download/) (datestyle = dmy, iso)

Isomorhic javascript client https://github.com/objectum/objectum-client  
React components https://github.com/objectum/objectum-react  
Command-line interface (CLI) https://github.com/objectum/objectum-cli  
Objectum project example https://github.com/objectum/catalog 
 
## Quick start

Install CLI:
```bash
npm i -g objectum-cli forever
```

Create objectum project:
```bash
mkdir -p /opt/objectum 
objectum-cli --create-project my_project --path /opt/objectum 

```
objectum-cli defaults: 
```
--redis-host 127.0.0.1
--redis-port 6379
--objectum-port 8200
--project-port 3100
--db-host 127.0.0.1
--db-port 5432
--db-dbPassword 1
--db-dbaPassword 12345
--password admin
```
db-dbaPassword - postgres password.  
password - password of project 'admin'. 

Start project:
```bash
cd /opt/objectum/server 
./start.sh 
cd /opt/objectum/projects/my_project 
./start.sh 
npm run start
```

## Learn by Example project "Catalog"

* [Platform initialization](#platform_init)  
* [Project initialization](#project_init)
    * [Create react application](#create_react_application)
    * [Add project configuration](#add_project_configuration)
    * [Add project web-server](#add_project_web_server)
    * [Add project proxy](#add_project_proxy)
    * [Prepare tablespace folder](#prepare_tablespace_folder)
    * [Create store](#create_store)
    * [Import store structure](#import_store_structure)
    * [Start project (DevServer)](#start_project)
    * [Remove store](#remove_store)
* [Development](#development)
    * [Model "item"](#model_item)
    * [Model properties](#model_properties)
    * [Dictionary "d.item.type"](#model_item_type)
    * [Tabular part "t.item.comment" of "item"](#model_comment)
    * [ModelList, ModelRecord](#model_list)
    * [Menus](#menus)
    * [Roles](#roles)
    * [Users](#users)    
    * [Deployment](#deployment)
        * [Export store](#export_store)
        * [Import store](#import_store)
        * [Cluster](#cluster)

<a name="platform_init" />

## Platform initialization

Install platform:
```bash
mkdir -p /opt/objectum/server
cd /opt/objectum/server
npm i objectum
```

Add platform configuration:
```bash
cat > /opt/objectum/server/config.js
```
```js
module.exports = {
	"rootDir": "/opt/objectum/server",
	"projectsDir": "/opt/objectum/projects",
	"startPort": 8200,
	"redis": {
		"host": "127.0.0.1",
		"port": 6379
	},
	"query": {
		"maxRowNum": 2000000,
		"maxCount": 700000
	},
	"log": {
		"level": "info"
	}
}
```

Add script:
```bash
cat > /opt/objectum/server/index.js
```
```js
require ("objectum").start (require ("./config"));
```

Add script:
```bash
cat > /opt/objectum/server/objectum.js
```
```js
let Objectum = require ("objectum").Objectum;

module.exports = new Objectum (require ("./config"));
```

Start platform:
```bash
cd /opt/objectum/server
node index.js
```

<a name="project_init" />

## Project initialization

<a name="create_react_application" />

### Create react application
```bash
mkdir -p /opt/objectum/projects/catalog
cd /opt/objectum/projects/catalog
npx create-react-app .
npm i -S express express-http-proxy objectum-client objectum-react
```

<a name="add_project_configuration" />

### Add project configuration
postgres password: 12345
```bash
cat > /opt/objectum/projects/catalog/config.json
```
```json
{
	"code": "catalog",
	"rootDir": "/opt/objectum/projects/catalog",
	"adminPassword": "D033E22AE348AEB5660FC2140AEC35850C4DA997",
	"port": 3100,
	"database": {
		"host": "localhost",
		"port": 5432,
		"db": "catalog",
		"dbUser": "catalog",
		"dbPassword": "1",
		"dbaUser": "postgres",
		"dbaPassword": "12345"
	},
	"objectum": {
		"host": "localhost",
		"port": 8200
	}
}
```
Admin password "admin" <= require ("crypto").createHash ("sha1").update ("admin").digest ("hex").toUpperCase ();

<a name="add_project_web_server" />

### Add project web-server
Add script:
```bash
cat > /opt/objectum/projects/catalog/index.js
```
```js
const config = require ("./config");
const path = require ("path");
const express = require ("express");
const proxy = require ("express-http-proxy");
const app = express ();

app.use (`/api`, proxy (`http://${config.objectum.host}:${config.objectum.port}`, {
	proxyReqPathResolver: function (req) {
		let parts = req.url.split('?');
		let queryString = parts [1];

		return `/projects/${config.code}${parts [0]}${queryString ? "?" + queryString : ""}`;
	}
}));
app.use ("/public/*", proxy (`http://${config.objectum.host}:${config.objectum.port}`, {
	proxyReqPathResolver: function (req) {
		return req.baseUrl;
	}
}));
app.use (express.static (path.join (__dirname, "build")));
app.get ("/*", function (req, res) {
	res.sendFile (path.join (__dirname, "build", "index.html"));
});
app.listen (config.port, function () {
	console.log (`server listening on port ${config.port}`);
});
```

<a name="add_project_proxy" />

### Add project proxy
Add script:
```bash
cat > /opt/objectum/projects/catalog/src/setupProxy.js
```
```js
const proxy = require ("http-proxy-middleware");
const config = require ("./../config");

module.exports = function (app) {
    app.use (proxy ("/api",
        {target: `http://localhost:${config.port}/`}
    ));
    app.use (proxy ("/public",
        {target: `http://localhost:${config.port}/`}
    ));
};
```

<a name="prepare_tablespace_folder" />

### Prepare tablespace folder
```bash
mkdir /opt/objectum/projects/catalog/db
chown postgres:postgres /opt/objectum/projects/catalog/db
```

<a name="create_store" />

### Create store:
"catalog" is developer store.
Add script:
```bash
cat > /opt/objectum/projects/catalog/bin/create.js
```
```js
let $o = require ("/opt/objectum/server/objectum");

$o.db.execute ({
	code: "catalog",
	fn: "create",
	path: "/opt/objectum/projects/catalog/db"
});
```

Create store:
```bash
cd /opt/objectum/projects/catalog/bin
node create.js
```

<a name="import_store_structure" />

### Import store structure
Import objectum classes and views.
Add script:
```bash
cat > /opt/objectum/projects/catalog/bin/import.js
```
```js
let $o = require ("/opt/objectum/server/objectum");

$o.db.execute ({
	code: "catalog",
	fn: "import",
	file: "schema-objectum.json"
});
```

Import store structure:
```bash
cd /opt/objectum/projects/catalog/bin
node import.js
```

<a name="start_project" />

### Start project (DevServer)
```bash
cd /opt/objectum/projects/catalog
node index.js
npm start
```

Open URL: http://localhost:3000  
Login: admin  
Password: admin  

<a name="remove_store" />

### Remove store
Add script:
```bash
cat > /opt/objectum/projects/catalog/bin/remove.js
```
```js
let $o = require ("/opt/objectum/server/objectum");

$o.db.execute ({
	code: "catalog",
	fn: "remove"
});
```

You can remove store (drop tablespace, role, user from PostgreSQL):
```bash
cd /opt/objectum/projects/catalog/bin
node remove.js
```

<a name="development" />

## Development
Start objectum platform:
```bash
cd /opt/objectum/server
node index.js

```
Start project server:
```bash
cd /opt/objectum/projects/catalog
node index.js
```
Start project development server:
```bash
cd /opt/objectum/projects/catalog
npm run start
```

Open URL: http://localhost:3000  
Login: admin  
Password: admin  

<a name="model_item" />

### Model "item"
Click "Models" in menu. Click "Create". Edit and save.
objectum-cli: 
```bash
cd /opt/objectum/projects/catalog 
objectum-cli --create-model '{"name": "Item", "code": "item"}'
```

<a name="model_properties" />

### Model properties
Select tab "Properties" in model. Click "Create". Edit and save. Do it for all properties.
objectum-cli: 
```bash
cd /opt/objectum/projects/catalog 
objectum-cli --create-property '{"model": "item", "name": "Date", "code": "date", "type": "date"}'
objectum-cli --create-property '{"model": "item", "name": "Name", "code": "name", "type": "string"}'
objectum-cli --create-property '{"model": "item", "name": "Weight", "code": "weight", "type": "number"}'
objectum-cli --create-property '{"model": "item", "name": "Hidden", "code": "hidden", "type": "boolean"}'
objectum-cli --create-property '{"model": "item", "name": "File", "code": "file", "type": "file"}'
```

<a name="model_item_type" />

### Dictionary "d.item.type"
Create model "d.item" for grouping dictionaries of model "item". Create model "d.item.type" with property "name".
Add property "type" to model "item".
objectum-cli: 
```bash
cd /opt/objectum/projects/catalog 
objectum-cli --create-model '{"name": "Item", "code": "item", "parent": "d"}'
objectum-cli --create-model '{"name": "Type", "code": "type", "parent": "d.item"}'
objectum-cli --create-property '{"model": "d.item.type", "name": "Name", "code": "name", "type": "string"}'
objectum-cli --create-property '{"model": "item", "name": "Type", "code": "type", "type": "d.item.type"}'
```

<a name="model_comment" />

### Tabular part "t.item.comment" of "item"
Create model "t.item" for grouping tabular parts of model "item". Create model "t.item.comment" with properties: item, text.
objectum-cli: 
```bash
cd /opt/objectum/projects/catalog 
objectum-cli --create-model '{"name": "Item", "code": "item", "parent": "t"}'
objectum-cli --create-model '{"name": "Comment", "code": "comment", "parent": "t.item"}'
objectum-cli --create-property '{"model": "t.item.comment", "name": "Item", "code": "item", "type": "item"}'
objectum-cli --create-property '{"model": "t.item.comment", "name": "Text", "code": "text", "type": "string"}'
```

<a name="model_list" />

### ModelList, ModelRecord
All models can view using /model_list. Allowed actions: create, edit, remove.
Items path: /model_list/item
Dictionary path: /model_list/d_item_type 

<a name="menus" />

### Menus
Menu used in role. You can create multi level menu.

<a name="roles" />

### Roles
Roles of users.

<a name="users" />

### Users
Users.
    
<a name="deployment" />

### Deployment

<a name="export_store" />

### Export store
"catalog" is developer store.
```js
let $o = require ("/opt/objectum/server/objectum");

$o.db.execute ({
	code: "catalog",
	fn: "export",
	filterClasses: [],
	file: "../schema/schema-catalog.json"
});
```

<a name="import_store" />

### Import store
Create client store and import schema-catalog.json. Example "catalog_client".
```js
let $o = require ("/opt/objectum/server/objectum");

$o.db.execute ({
	code: "catalog",
	fn: "import",
	file: "../schema/schema-catalog.json"
});
```

<a name="cluster" />

### Cluster
Change /opt/objectum/server/config.js
```js
module.exports = {
	"rootDir": "/opt/objectum/server",
	"projectsDir": "/opt/objectum/projects",
	"startPort": 8200,
	"redis": {
		"host": "127.0.0.1",
		"port": 6379
	},
	"query": {
		"maxRowNum": 2000000,
		"maxCount": 700000
	},
	"log": {
		"level": "info"
	},
	cluster: {
		www: {
			workers: 3
		},
		app: {
			workers: 3
		}
	}
}
```
Change file /opt/objectum/server/index.js
```js
require ("objectum").startCluster (require ("./config"));
```

## Author

**Dmitriy Samortsev**

+ http://github.com/objectum


## Copyright and license

MIT
