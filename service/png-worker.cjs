'use strict';
const {parentPort,workerData}=require('node:worker_threads');
try{const result=require('./png-image.cjs').normalizePng(Buffer.from(workerData));parentPort.postMessage({ok:true,...result});}catch{parentPort.postMessage({ok:false});}
