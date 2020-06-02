# Objectum
Objectum platform makes it easy to create realtime single page applications that run in both Node.js and browsers.
 
Requirements: [PostgreSQL](https://www.postgresql.org/download/), [Redis](https://redis.io/)

Objectum ecosystem:
* Javascript platform https://github.com/objectum/objectum  
* Isomorhic javascript client https://github.com/objectum/objectum-client  
* Proxy for server methods and access control https://github.com/objectum/objectum-proxy  
* React components https://github.com/objectum/objectum-react  
* Command-line interface (CLI) https://github.com/objectum/objectum-cli  
* Objectum project example https://github.com/objectum/catalog 

## Quick start
Project name "catalog" (https://github.com/objectum/catalog)  
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
* [Model creation](#model_creation)  
* [ModelList, ModelTree, ModelRecord](#model_list)
* [Menus](#menus)
* [Roles](#roles)
* [Users](#users)    
* [ItemModel (client)](#item_model_client)    
* [ItemModel (server)](#item_model_server)    
* [Access control](#access_control)    
* [Admin actions](#admin_actions)
* [Deployment](#deployment)
    * [Export store](#export_store)
    * [Import store](#import_store)
    * [Cluster](#cluster)

<a name="specification" />

## Specification

* List of items. Users can create items and guests can view items.
* Model "Item" properties:
    * Name - string field
    * Description - string field. WYSIWYG editor
    * Photo - file field. Image cropping
    * Cost - number field
    * Date - date field
    * Type - dictionary field
* Comments - comments to items    
* User roles
    * user - can create items
    * guest - can view all items

<a name="platform_init" />

<a name="model_creation" />

## Model creation
Dictionary "d.item.category".  
cli.json:
```json
{
    "createModel": [
        {
            "name": "Item", 
            "code": "item",
            "parent": "d"
        },
        {
            "name": "Type", 
            "code": "type",
            "parent": "d.item"
        }
    ],
    "createProperty": [
        {
            "model": "d.item.type", 
            "name": "Name", 
            "code": "name",
            "type": "string"
        }
    ]
}
```
  
```bash
cd /opt/objectum/projects/catalog
objectum-cli --file cli.json 
```

Model "item".  
cli.json:
```json
{
    "createModel": [
        {
            "name": "Item", 
            "code": "item"
        }
    ],
    "createProperty": [
        {
            "model": "item", 
            "name": "Date", 
            "code": "date",
            "type": "date"
        },
        {
            "model": "item", 
            "name": "Name", 
            "code": "name",
            "type": "string"
        },
        {
            "model": "item",
            "name": "Description",
            "code": "description",
            "type": "string",
            "opts": {
                "wysiwyg": true
            }
        },
        {
            "model": "item", 
            "name": "Cost", 
            "code": "cost",
            "type": "number",
            "opts": {
                "min": 0
            }
        },
        {
            "model": "item", 
            "name": "Type", 
            "code": "type",
            "type": "d.item.type"
        },
        {
            "model": "item", 
            "name": "Photo", 
            "code": "photo",
            "type": "file",
            "opts": {
                "image": {
                    "width": 400,
                    "height": 300,
                    "aspect": 1.5
                }
            }
        }
    ]
}
```

Tabular part "t.item.comment" of "item".  
cli.json:
```json
{
    "createModel": [
        {
            "name": "Item", 
            "code": "item",
            "parent": "t"
        },
        {
            "name": "Comment", 
            "code": "comment",
            "parent": "t.item"
        }
    ],
    "createProperty": [
        {
            "model": "t.item.comment", 
            "name": "Item", 
            "code": "item",
            "type": "item"
        },
        {
            "model": "t.item.comment", 
            "name": "Date",
            "code": "date",
            "type": "date"
        },
        {
            "model": "t.item.comment",
            "name": "Text",
            "code": "text",
            "type": "string"
        }
    ]
}
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
    * Name "User"
* Click "Menu items". Click "Create".
    * Name "Items", path "/model_list/item"
* Click "Menus" in menu. Click "Create".
    * Name "Guest"

<a name="roles" />

### Roles
Roles of users.
Create role "user":
* Click "Roles" in menu. Click "Create".
    * Name "User"
    * Code "user"
    * Menu - select menu "User"
* Click "Roles" in menu. Click "Create".
    * Name "Guest"
    * Code "Guest"
    * Menu - select menu "Guest"

<a name="users" />

### Users
Create users:
* Login "user", password "user" with role "User".
* Login "guest", password "guest" with role "Guest".

<a name="item_model_client" />

### ItemModel (client)
src/models/ItemModel.js:
```jsx
import React from "react";
import {Record, factory} from "objectum-client";
import {Action} from "objectum-react";

class ItemModel extends Record {
    static _renderGrid ({grid, store}) {
        // Additional buttons in grid
        let actions = [
            ...grid.props.children,
            <Action label="Server action: getComments" onClickSelected={async ({progress, id}) => {
                let recs = await store.remote ({
                    model: "item",
                    method: "getComments",
                    id,
                    progress
                });
                return JSON.stringify (recs)
            }} />
        ];
        return React.cloneElement (grid, {
            label: "Items", // grid label
            query: "item.list", // grid query
            onRenderTable: ItemModel.onRenderTable, // grid table custom render
            children: store.roleCode === "guest" ? null : actions
        });
    }
    
    static onRenderTable ({grid, cols, colMap, recs, store}) {
        return (
            <div className="p-1">
                {recs.map ((rec, i) => {
                    let record = factory ({rsc: "record", data: Object.assign (rec, {_model: "item"}), store});
                    
                    return (
                        <div key={i} className={`row border-bottom my-1 p-1 no-gutters ${grid.state.selected === i ? "bg-secondary text-white" : ""}`} onClick={() => grid.onRowClick (i)} >
                            <div className="col-6">
                                <div className="p-1">
                                    <div>
                                        <strong className="mr-1">Name:</strong>{rec.name}
                                    </div>
                                    <div>
                                        <strong className="mr-1">Date:</strong>{rec.date && rec.date.toLocaleString ()}
                                    </div>
                                    <div>
                                        <strong className="mr-1">Type:</strong>{rec.type && store.dict ["d.item.type"][rec.type].name}
                                    </div>
                                    <div>
                                        <strong className="mr-1">Cost:</strong>{rec.cost}
                                    </div>
                                    <div>
                                        <strong>Description:</strong>
                                    </div>
                                    <div dangerouslySetInnerHTML={{__html: `${record.description || ""}`}} />
                                </div>
                            </div>
                            <div className="col-6 text-right">
                                {record.photo && <div>
                                     <img src={record.getRef ("photo")} className="img-fluid" width={400} height={300} alt={record.photo} />
                                </div>}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }
    
    // item form layout
    static _layout () {
        return {
            "Information": [
                "id",
                [
                    "name", "date"
                ],
                [
                    "type", "cost"
                ],
                [
                    "description"
                ],
                [
                    "photo"
                ],
                [
                    "t.item.comment"
                ]
            ]
        };
    }
    
    // new item render
    static _renderField ({field, store}) {
        if (field.props.property === "date") {
            return React.cloneElement (field, {value: new Date (), showTime: true});
        } else {
            return field;
        }
    }

    // item render
    _renderField ({field, store}) {
        if (field.props.property === "date") {
            return React.cloneElement (field, {showTime: true});
        } else {
            return field;
        }
    }
};

export default ItemModel;
```
src/App.js:
```js
import ItemModel from "./models/ItemModel";

store.register ("item", ItemModel);
```

<a name="item_model_server" />

### ItemModel (server)
src/models/ItemServerModel.js:
```jsx
import objectumClient from "objectum-client";
const {Record} = objectumClient;

function timeout (ms = 500) {
    return new Promise (resolve => setTimeout (() => resolve (), ms));
};

class ItemModel extends Record {
    async getComments ({progress}) {
        let me = this;
      
        // show progress on client side
        for (let i = 0; i < 10; i ++) {
            await timeout (1000);
            progress ({label: "processing", value: i + 1, max: 10});
        }
        return await me.store.getRecs ({
            model: "t.item.comment",
            filters: [
                ["item", "=", me.id]
            ]
        });
    }
};

export default ItemModel;
```
index.js:
```js
import ItemModel from "./src/models/ItemServerModel.js";

proxy.register ("item", ItemModel);
```

<a name="access_control" />

### Access control
src/modules/access.js:
```js
let map = {
    "guest": {
        "data": {
            "model": {
                "item": true, "d.item.type": true, "t.item.comment": true
            },
            "query": {
                "objectum.userMenuItems": true
            }
        },
        "read": {
            "objectum.role": true, "objectum.user": true, "objectum.menu": true, "objectum.menuItem": true
        }
    }
};
// Module initialization
async function _init ({store}) {
};
// Access to store.getData
function _accessData ({store, data}) {
    if (store.roleCode == "guest") {
        if (data.model) {
            return map.guest.data.model [store.getModel (data.model).getPath ()];
        }
        if (data.query) {
            return map.guest.data.query [store.getQuery (data.query).getPath ()];
        }
    } else {
        return true;
    }
};
// Access to store.getData. Executed for all models in query
function _accessFilter ({store, model, alias}) {
};
// Access to store.createRecord
function _accessCreate ({store, model, data}) {
    return store.roleCode != "guest";
};
// Access to store.getRecord
function _accessRead ({store, model, record}) {
    let modelPath = model.getPath ();
    
    if (store.roleCode == "guest") {
        if (modelPath == "objectum.user") {
            return record.login == "guest";
        }
        return map.guest.read [modelPath];
    }
    return true;
};
// Access to store.updateRecord
function _accessUpdate ({store, model, record, data}) {
    return store.roleCode != "guest";
};
// Access to store.removeRecord
function _accessDelete ({store, model, record}) {
    return store.roleCode != "guest";
};

export default {
    _init,
    _accessData,
    _accessFilter,
    _accessCreate,
    _accessRead,
    _accessUpdate,
    _accessDelete
};
```    
<a name="admin_actions" />

### Admin actions
src/modules/admin.js:
```js
import fs from "fs";
import util from "util";

fs.readFileAsync = util.promisify (fs.readFile);

function timeout (ms = 500) {
    return new Promise (resolve => setTimeout (() => resolve (), ms));
};

async function readFile ({store, progress, filename}) {
    for (let i = 0; i < 10; i ++) {
        await timeout (1000);
        progress ({label: "processing", value: i + 1, max: 10});
    }
    return await fs.readFileAsync (filename, "utf8");
};

async function increaseCost ({store, progress}) {
    await store.startTransaction ("demo");
    
    let records = await store.getRecords ({model: "item"});
    
    for (let i = 0; i < records.length; i ++) {
        let record = records [i];
        
        record.cost = record.cost + 1;
        await record.sync ();
    }
    await store.commitTransaction ();
    
    return "ok";
};

export default {
    readFile,
    increaseCost
};
```
 
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
    exceptRecords: ["item"],
    file: "../schema/schema-catalog.json"
});
```

<a name="import_store" />

### Import store
Create client store and import schema-catalog.json. Example "catalog_client".  
Create:
```js
let $o = require ("/opt/objectum/server/objectum");

$o.db.execute ({
    "code": "catalog_client",
    "fn": "create"
});
```
Import:
```js
let $o = require ("/opt/objectum/server/objectum");

$o.db.execute ({
    code: "catalog_client",
    fn: "import",
    file: "../schema/schema-catalog.json"
});
```
Now "catalog_client" contains store "catalog". Import again to get changes from "catalog".

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
