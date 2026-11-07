'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/workspace-resize.js'),'utf8');
function boot(editorSetupReady){const events={},options={};let reads=0;vm.runInNewContext(source,{editorSetupReady,window:{addEventListener:(name,fn,opts)=>{events[name]=fn;options[name]=opts}},document:{getElementById:()=>{reads++;return null}}});return {events,options,get reads(){return reads}};}
test('workspace resize waits for editor readiness and initializes only once',()=>{const f=boot(false);assert.equal(f.reads,0);assert.equal(f.options['avatar-editor-ready'].once,true);f.events['avatar-editor-ready']();assert.equal(f.reads,3);f.events['avatar-editor-ready']();assert.equal(f.reads,3)});
test('workspace resize handles a script arriving after editor readiness',()=>{const f=boot(true);assert.equal(f.reads,3);f.events['avatar-editor-ready']();assert.equal(f.reads,3)});
