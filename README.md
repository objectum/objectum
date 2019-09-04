Under construction.

# Objectum
Javascript platform for NodeJS: PostgreSQL 

Objectum platform makes it easy to create realtime single page applications that run in both Node.js and browsers.
 
Isomorhic javascript client https://github.com/objectum/objectum-client  
React components https://github.com/objectum/objectum-react  
Objectum project example https://github.com/objectum/catalog 
 
## Learn by Example project "Catalog"

* [Initialization](#init)  

<a name="init" />

## Initialization

Install platform:
```bash
mkdir /opt/objectum/server
cd /opt/objectum/server
npm install objectum
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

Need to create project now.

Init project:
```bash
mkdir -p /opt/objectum/projects/catalog/bin
cd /opt/objectum/projects
npx create-react-app catalog
npm install fastify fastify-http-proxy objectum-client objectum-react react-dropzone react-modal react-router-dom
```

Add project configuration (postgres password: 12345):
```bash
cat > /opt/objectum/projects/catalog/config.json
{
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
	prefix: "/api/projects/catalog/",
	rewritePrefix: "/projects/catalog/",
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

Prepare tablespace folder:
```bash
mkdir /opt/objectum/projects/catalog/db
chown postgres:postgres /opt/objectum/projects/catalog/db
```

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

Start project:
```bash
cd /opt/objectum/projects/catalog
node index.js
```

Open URL: http://localhost:3000
Login: admin  
Password: admin  

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
