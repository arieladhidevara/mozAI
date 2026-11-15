const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const mobile=read('workspace-mobile.js');
const css=read('workspace-mobile.css');
const header=read('index.html');
const app=read('app.js');
const auth=read('auth.js');

test('mobile navigation has only Groups and Assistant, no Settings or panel expand',()=>{
  assert.match(mobile,/const tabs=\['groups','ai'\]/);
  const nav=mobile.slice(mobile.indexOf('nav.innerHTML=[',mobile.indexOf('/* Mobile v2:')),mobile.indexOf('function syncAssistantContext()'));
  assert.equal((nav.match(/data-mobile-tab=/g)||[]).length,2);
  assert.match(nav,/Groups/);
  assert.match(nav,/Assistant/);
  assert.doesNotMatch(nav,/Settings|selected area|mobileExpandPane/i);
  assert.doesNotMatch(mobile,/const aiChoices|function aiView|const expandButton|toggleExpand\(/);
});

test('contextual Assistant switches between the saved selection and the full-image composer without tabs',()=>{
  assert.match(mobile,/function syncAssistantContext\(\)/);
  assert.match(mobile,/showQuickPrompt\?\.\(undefined,true,false\)/);
  assert.match(mobile,/editPane\.dataset\.composer=/);
  assert.match(css,/#mobileEditPane\[data-composer=area\]>\.composition-chat\{display:none!important\}/);
  assert.match(css,/#mobileEditPane\[data-composer=full\]>#quickAreaPromptForm\{display:none!important\}/);
  assert.match(css,/#mobileEditPane \.chat-prompt-row,\s*#mobileEditPane #quickAreaPromptForm \.prompt-input-row/);
});

test('keyboard relocates only the composer while the canvas viewport keeps its stable height',()=>{
  assert.match(mobile,/let restingHeight=window\.innerHeight/);
  assert.match(mobile,/--moz-mobile-visible-bottom/);
  assert.match(mobile,/--moz-mobile-screen-height/);
  assert.match(css,/top:calc\(var\(--moz-mobile-visible-bottom,100svh\) - 101px\)!important/);
  assert.match(css,/html\.moz-keyboard-open #inspectorPanel\s*\{\s*position:fixed!important/);
  assert.match(css,/html\.moz-keyboard-open #mobileEditPane \.quick-group-options/);
  assert.doesNotMatch(mobile,/requestAnimationFrame\(keepComposerVisible\)/);
});

test('project rename uses icon and autosaves on blur or Enter, without extra rename button',()=>{
  assert.match(header,/id="projectRenameToggle"[^>]*aria-label="Rename project"/);
  assert.match(header,/id="projectNameInput"[^>]*hidden/);
  assert.doesNotMatch(header,/id="projectRenameForm"|>Rename<\/button>/);
  assert.match(app,/projectNameInput\.addEventListener\('blur',finishProjectRename\)/);
  assert.match(app,/setProjectTitle\(name,true\)/);
  assert.match(app,/MosaicRecovery\?\.markChanged\?\.\(\)/);
  assert.match(app,/projectNameInput\.blur\(\)/);
});

test('top-bar Image AI text is removed but encrypted-key management remains keyboard accessible',()=>{
  assert.doesNotMatch(header,/>Image AI<\/button>/);
  assert.match(header,/id="apiKeyStatusBtn"[^>]*aria-label="Manage OpenAI API key"/);
  assert.match(auth,/button\.innerHTML=/);
  assert.match(auth,/button\.setAttribute\('aria-label',button\.title\)/);
});
