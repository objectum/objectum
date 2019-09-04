"use strict"

let Objectum = require ("./server/objectum").Objectum;
let config = require ("./config");

module.exports = new Objectum (config);
