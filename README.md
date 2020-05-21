# Objectum
Objectum platform makes it easy to create realtime single page applications that run in both Node.js and browsers.
 
Requirements: [Redis](https://redis.io/), [PostgreSQL](https://www.postgresql.org/download/) (datestyle = dmy, iso)

Objectum ecosystem:
* Isomorhic javascript client https://github.com/objectum/objectum-client  
* Proxy for server methods and access control https://github.com/objectum/objectum-proxy  
* React components https://github.com/objectum/objectum-react  
* Command-line interface (CLI) https://github.com/objectum/objectum-cli  
* Objectum project example https://github.com/objectum/catalog 

## Quick start
Project name "catalog".  
Install CLI:
```bash
npm install -g objectum-cli
```

Install platform:
```bash
mkdir -p /opt/objectum 
objectum-cli --create-platform --path /opt/objectum 

```
Create objectum project:
```bash
objectum-cli --create-project catalog --path /opt/objectum 

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
db-dbPassword - database user "catalog" password.  
password - password of project "admin". 

Start platform:
```bash
cd /opt/objectum/server 
node index-8200.js
```
Start project:
```bash
cd /opt/objectum/projects/catalog 
node index-3100.js
npm run start
```
Open URL: http://localhost:3000  
Login: admin  
Password: admin  

## Learn by Example project "Catalog"
Basic level of development (rapid).

* [Specification](#specification)  
* [Model "item"](#model_item)
* [Model properties](#model_properties)
* [Dictionary "d.item.category"](#model_item_category)
* [Tabular part "t.item.comment" of "item"](#model_comment)
* [ModelList, ModelTree, ModelRecord](#model_list)
* [Menus](#menus)
* [Roles](#roles)
* [Users](#users)    
* [ItemModel](#item_model)    
* [Access control](#access_control)    
* [Deployment](#deployment)
    * [Export store](#export_store)
    * [Import store](#import_store)
    * [Cluster](#cluster)

<a name="specification" />

## Specification

* List of items. Clients can create items and guests can view items.
* Model "Item" properties:
    * Name - string field
    * Description - string field. WYSIWYG editor
    * Photo - file field. Image cropping
    * Cost - number field
    * Date - date field
    * Category - dictionary field
    * User - item owner
    * Hidden - boolean field. Guests can't view hidden items
* Comments - comments to items    
* User roles
    * client - can create items
    * guest - can view all items
* User registration

<a name="platform_init" />

<a name="model_item" />

## Model "item"
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
objectum-cli --create-property '{"model": "item", "name": "Name", "code": "name", "type": "string"}'
objectum-cli --create-property '{"model": "item", "name": "Description", "code": "description", "type": "string"}'
objectum-cli --create-property '{"model": "item", "name": "Photo", "code": "photo", "type": "file"}'
objectum-cli --create-property '{"model": "item", "name": "Cost", "code": "cost", "type": "number"}'
objectum-cli --create-property '{"model": "item", "name": "Date", "code": "date", "type": "date"}'
objectum-cli --create-property '{"model": "item", "name": "User", "code": "user", "type": "objectum.user"}'
objectum-cli --create-property '{"model": "item", "name": "Hidden", "code": "hidden", "type": "boolean"}'
```
Property "Photo" cropping options add in field "Options":
```bash
{
    "image": {
        "width": 450,
        "height": 300,
        "aspect": 1.5        
    }
}
```

<a name="model_item_category" />

### Dictionary "d.item.category"
Create model "d.item" for grouping dictionaries of model "item". Create model "d.item.category" with property "name". 
Add property "category" to model "item".  
objectum-cli: 
```bash
cd /opt/objectum/projects/catalog 
objectum-cli --create-model '{"name": "Item", "code": "item", "parent": "d"}'
objectum-cli --create-model '{"name": "Type", "code": "category", "parent": "d.item"}'
objectum-cli --create-property '{"model": "d.item.category", "name": "Name", "code": "name", "type": "string"}'
objectum-cli --create-property '{"model": "item", "name": "Category", "code": "category", "type": "d.item.category"}'
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
All modell records can view using /model_list or /model_tree (need "parent" property). Allowed actions: create, edit, remove.
Items path: /model_list/item
Dictionary path: /model_list/d_item_type 

<a name="menus" />

### Menus
Menu used in role. You can create multi level menu.
Create menu for role "client":
* Click "Menus" in menu. Click "Create".
    * Name "Client"
* Click "Menu items". Click "Create".
    * Name "Items", path "/model_list/item"
* Click "Menus" in menu. Click "Create".
    * Name "Guest"
* Click "Menu items". Click "Create".
    * Name "Items", path "/model_list/item"

<a name="roles" />

### Roles
Roles of users.
Create role "client":
* Click "Roles" in menu. Click "Create".
    * Name "Client"
    * Menu - select menu "Client"
* Click "Roles" in menu. Click "Create".
    * Name "Guest"
    * Menu - select menu "Guest"

<a name="users" />

### Users
Create users:
* Login "client", password "client" with role "Client".
* Login "guest", password "guest" with role "Guest".

<a name="item_model" />

### ItemModel
/src/models/ItemModel.js:
```js
import {Record} from "objctum-client";

class ItemModel extends Record {
    
}
```

<a name="access_control" />

### Access control
    
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
	code: "catalog_client",
	fn: "import",
	file: "../schema/schema-catalog.json"
});
```

<a name="cluster" />

### Cluster
You can start platform in cluster mode.  
Change /opt/objectum/server/config.js:
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
	"cluster": {
		"www": {
			"workers": 3
		},
		"app": {
			"workers": 3
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
