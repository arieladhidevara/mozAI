const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'project-recovery.js'), 'utf8');

function mockBrowser(storage = new Map(), user = null) {
  const state = {master:null,reference:null,patches:new Map(),busy:false};
  const timers = new Map();
  const nodes = new Map();
  const counters = {loaded:0,reloaded:0,written:0,confirmations:0,filePickers:0};
  let nextTimer = 0;
  let confirmResult = true;
  let created = false;

  const element = id => {
    if (!nodes.has(id)) nodes.set(id, {
      id,disabled:false,textContent:'',
      open:false,
      showModal(){this.open=true;},
      close(){this.open=false;},
      click(){if(id==='projectOpenInput')counters.filePickers++;this.onclick?.();},
      addEventListener(event,handler) { this['on' + event] = handler; },
      closest(){ return null; }
    });
    return nodes.get(id);
  };
  const idb = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          objectStoreNames: {contains: () => created},
          createObjectStore(){created=true;},
          close(){},
          transaction(){
            const tx = {};
            tx.objectStore = () => ({
              get(key){ return action(() => storage.get(key)); },
              put(value,key){ return action(() => {storage.set(key,value);counters.written++;}); },
              delete(key){ return action(() => {storage.delete(key);}); }
            });
            function action(fn) {
              const operation = {};
              queueMicrotask(() => {
                try {operation.result=fn();operation.onsuccess?.();tx.oncomplete?.();}
                catch(e){operation.error=e;operation.onerror?.();tx.onerror?.();}
              });
              return operation;
            }
            return tx;
          }
        };
        if (!created) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
  const win = {
    MosaicCore:{state,toast(){}},
    MosaicProjects:{
      async buildProjectData(){
        return {format:'MOSAIC_PROJECT',version:1,state:{image:!!state.master||!!state.reference},
          premium:{},images:[]};
      },
      async loadProjectFile(file,{recovery}={}){
        assert.equal(recovery,true);
        counters.loaded++;
        state.master={width:16,height:16};
        return true;
      }
    },
    MosaicAccount:{ready:async()=>{},current:()=>user},
    MosaicSourceEditor:{isEditing:()=>false},
    confirm(){counters.confirmations++;return confirmResult;},
    addEventListener(){}
  };
  win.indexedDB = idb;
  const context = {
    window:win,document:{
      getElementById:element,
      addEventListener(){},
      visibilityState:'visible'
    },
    MutationObserver:class {observe(){}},
    indexedDB:idb,
    location:{reload(){counters.reloaded++;}},
    Blob,File,Date,Promise,Error,console,
    setTimeout(handler,delay){const id=++nextTimer;timers.set(id,{handler,delay});return id;},
    clearTimeout(id){timers.delete(id);},
    setInterval(){return ++nextTimer;}
  };
  vm.runInNewContext(source,context,{filename:'project-recovery.js'});
  return {
    state,storage,counters,window:win,element,
    setConfirm(v){confirmResult=v;},
    async settle(){
      for(let i=0;i<30;i++)await Promise.resolve();
    },
    async nextTimer(){
      const entry=[...timers.entries()].sort((a,b)=>a[1].delay-b[1].delay)[0];
      assert.ok(entry, 'autosave timer scheduled');
      timers.delete(entry[0]);
      entry[1].handler();
      for(let i=0;i<40;i++)await Promise.resolve();
    }
  };
}

test('local recovery script is valid JavaScript', () => {
  assert.doesNotThrow(()=>new vm.Script(source));
});

test('autosaves to browser disk and waits for explicit Load project before restoring', async () => {
  const storage=new Map();
  const first=mockBrowser(storage);
  first.state.reference={width:16,height:16};
  await first.settle();
  await first.nextTimer();
  assert.equal(first.counters.written,1);
  assert.ok(storage.has('guest'));
  const entry=storage.get('guest');
  assert.equal(entry.expiresAt-entry.updatedAt,24*60*60*1000);

  const reopened=mockBrowser(storage);
  await reopened.settle();
  assert.equal(reopened.counters.loaded,0);
  assert.equal(reopened.state.master,null);
  assert.equal(reopened.element('projectLoadDialog').open,false);
  assert.equal(reopened.window.MosaicRecovery.offerRecovery(),true);
  assert.equal(reopened.element('projectLoadDialog').open,true);
  assert.equal(reopened.counters.loaded,0);
  await reopened.window.MosaicRecovery.restoreRecovery();
  assert.equal(reopened.counters.loaded,1);
  assert.ok(reopened.state.master);
  assert.equal(reopened.element('projectLoadDialog').open,false);
  assert.equal(reopened.window.MosaicRecovery.offerRecovery(),false);

  storage.get('guest').expiresAt=Date.now()-1;
  const expired=mockBrowser(storage);
  await expired.settle();
  assert.equal(expired.counters.loaded,0);
  assert.equal(storage.has('guest'),false);
});

test('Load project can choose a file without restoring or deleting the previous session', async () => {
  const storage=new Map([['guest',{blob:new Blob(['{}']),updatedAt:Date.now(),expiresAt:Date.now()+60000}]]);
  const browser=mockBrowser(storage);
  await browser.settle();
  assert.equal(browser.window.MosaicRecovery.offerRecovery(),true);
  browser.element('projectLoadFileBtn').click();
  assert.equal(browser.element('projectLoadDialog').open,false);
  assert.equal(browser.counters.filePickers,1);
  assert.equal(browser.counters.loaded,0);
  assert.equal(storage.has('guest'),true);
  assert.equal(browser.window.MosaicRecovery.offerRecovery(),true);
  browser.element('projectLoadDialog').close();
  assert.equal(browser.state.master,null);
  assert.equal(browser.counters.loaded,0);
});

test('Load project goes straight to a file when no recovery exists or a project is already open', async () => {
  const browser=mockBrowser();
  await browser.settle();
  assert.equal(browser.window.MosaicRecovery.offerRecovery(),false);
  const storage=new Map([['guest',{blob:new Blob(['{}']),updatedAt:Date.now(),expiresAt:Date.now()+60000}]]);
  const active=mockBrowser(storage);
  await active.settle();
  active.state.reference={width:16,height:16};
  assert.equal(active.window.MosaicRecovery.offerRecovery(),false);
  assert.equal(active.counters.loaded,0);
});

test('New Project warns for unsaved recovery and clears the old snapshot only on confirmation', async () => {
  const storage=new Map();
  const browser=mockBrowser(storage);
  browser.state.master={width:16,height:16};
  await browser.settle();
  await browser.nextTimer();
  browser.setConfirm(false);
  await browser.window.MosaicRecovery.newProject();
  assert.equal(browser.counters.confirmations,1);
  assert.equal(browser.counters.reloaded,0);
  assert.equal(storage.has('guest'),true);

  browser.setConfirm(true);
  await browser.window.MosaicRecovery.newProject();
  assert.equal(storage.has('guest'),false);
  assert.equal(browser.counters.reloaded,1);
});

test('recovery entries are scoped by signed-in account', async () => {
  const storage=new Map();
  const a=mockBrowser(storage,{id:'user-a'});
  a.state.master={width:10,height:10};
  await a.settle();
  await a.nextTimer();
  assert.ok(storage.has('user:user-a'));

  const b=mockBrowser(storage,{id:'user-b'});
  await b.settle();
  assert.equal(b.counters.loaded,0);
  assert.equal(storage.has('user:user-a'),true);
});
