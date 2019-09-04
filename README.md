Under construction.

# Objectum
Javascript platform for NodeJS: PostgreSQL 

Objectum platform makes it easy to create realtime single page applications that run in both Node.js and browsers.
 
Isomorhic javascript client https://github.com/objectum/objectum-client  
React components https://github.com/objectum/objectum-react  
Objectum project example https://github.com/objectum/catalog 
 
## Learn by Example project "Catalog"

* [Platform initialization](#platform_init)  
* [Project initialization (objectum-react)](#project_init)
    * [Create react application](#create_react_application)
    * [Add project configuration](#add_project_configuration)
    * [Add project web-server](#add_project_web_server)
    * [Add project proxy](#add_project_proxy)
    * [Prepare tablespace folder](#prepare_tablespace_folder)
    * [Create store](#create_store)
    * [Import store structure](#import_store_structure)
    * [Start project](#start_project)
    * [Remove store](#remove_store)

<a name="platform_init" />

## Platform initialization

Install platform:
```bash
mkdir -p /opt/objectum/server
cd /opt/objectum/server
npm i objectum
```

You must have installed [Redis](https://redis.io/), [PostgreSQL >= 9.x](https://www.postgresql.org/download/) (datestyle = dmy, iso)

Add platform configuration:
```bash
cat > /opt/objectum/server/config.js
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
require ("objectum").start (require ("./config"));
```

Add script:
```bash
cat > /opt/objectum/server/objectum.js
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
npm i -S fastify fastify-http-proxy objectum-client objectum-react react-dropzone react-modal react-router-dom
```

<a name="add_project_configuration" />

### Add project configuration
postgres password: 12345
```bash
cat > /opt/objectum/projects/catalog/config.json
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
const fastify = require ("fastify") ();
const proxy = require ("fastify-http-proxy");
const config = require ("./config");

fastify.addHook ("onError", async (req, res, error) => {
	console.error (error);
});

fastify.register (proxy, {
	upstream: `http://${config.objectum.host}:${config.objectum.port}`,
	prefix: `/api/projects/${config.code}/`,
	rewritePrefix: `/projects/${config.code}/`,
	http2: false
});

fastify.register (proxy, {
	upstream: `http://${config.objectum.host}:${config.objectum.port}`,
	prefix: "/public",
	rewritePrefix: "/public",
	http2: false
});

async function start () {
	await fastify.listen (config.port);
	console.log (`server listening on ${fastify.server.address ().port}`);
};

start ().catch (err => {
	console.error (err);
	process.exit (1);
});
```

<a name="add_project_proxy" />

### Add project proxy
Add script:
```bash
cat > /opt/objectum/projects/catalog/src/setupProxy.js
const proxy = require ("http-proxy-middleware");

module.exports = function (app) {
    app.use (proxy ("/api",
        {target: "http://localhost:3100/"}
    ));
	app.use (proxy ("/public",
		{target: "http://localhost:3100/"}
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
Add script:
```bash
cat > /opt/objectum/projects/catalog/bin/create.js
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
Add script:
```bash
cat > /opt/objectum/projects/catalog/bin/import.js
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

### Start project
```bash
cd /opt/objectum/projects/catalog
node index.js
```

Open URL: http://localhost:3000  
Login: admin  
Password: admin  

<a name="remove_store" />

### Remove store
Add script:
```bash
cat > /opt/objectum/projects/catalog/bin/remove.js
let $o = require ("/opt/objectum/server/objectum");

$o.db.execute ({
	code: "catalog",
	fn: "remove"
});
```

You can remove storage (drop tablespace, role, user from PostgreSQL):
```bash
cd /opt/objectum/projects/catalog/bin
node remove.js
```

