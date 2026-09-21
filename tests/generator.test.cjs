// Run with Node.js: node tests/generator.test.cjs
// Tests actual inline script with a minimal DOM; not a browser compatibility test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
assert.equal(scripts.length, 1);
assert.ok(!/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref\s*=/i.test(html));
let seed = 20260920;
function next() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; }
function element() {
  return {value: '', hidden: false, children: [], style: {}, classList: {add(){}, remove(){}},
    set textContent(v) { this.text = v; this.children = []; }, get textContent(){ return this.text || ''; },
    appendChild(v) { this.children.push(v); if (this.children.length === 1) this.value = v.value; },
    append(...v){ this.children.push(...v); }, setAttribute(){}, addEventListener(){}, select(){}, remove(){}};
}
const nodes = new Map();
const get = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
Object.entries({category:'skill', style:'mixed', placement:'auto', gender:'random'}).forEach(([k,v])=>get('#'+k).value=v);
const storage = new Map();
const context = vm.createContext({
  document: {querySelector:get, createElement:element, body:element()},
  window: {crypto:{getRandomValues(a){ for(let i=0;i<a.length;i++) a[i]=next(); return a; }}},
  localStorage: {getItem:k=>storage.get(k)||null, setItem:(k,v)=>storage.set(k,v)},
  navigator: {}, setTimeout: () => 0, clearTimeout(){}, console
});
vm.runInContext(scripts[0][1] + '\n globalThis.api = {SUBTYPE_OPTIONS, STYLE_LABELS, state, generate, updateCategoryControls, toggleFavorite, toggleLock, importFavorites, normalizeFavorites, exportData, changeFavorites, undoFavorites, saveEditedFavorite, saveFavorites, loadFavorites, PERSON_STYLES, buildPerson, glue, copyText};', context);
const api = context.api;
let batches=0, names=0, subtypes=0;
function check(category, subtype, style, placement, keyword, gender='random', surname='') {
  for (const [k,v] of Object.entries({category,subtype,style,placement,keyword,gender,surname})) get('#'+k).value=v;
  api.generate();
  const result=Array.from(api.state.results);
  const label=JSON.stringify({category,subtype,style,placement,keyword,gender,surname});
  assert.equal(result.length,10,label);
  assert.equal(new Set(result).size,10,label);
  for(const name of result) {
    assert.equal(typeof name,'string'); assert.ok(name && !/undefined|null/.test(name),label);
    if(keyword) {
      if(placement==='front') assert.ok(name.startsWith(keyword),label+name);
      else if(placement==='end') assert.ok(name.endsWith(keyword),label+name);
      else if(placement==='middle') assert.ok(name.includes(keyword)&&!name.startsWith(keyword)&&!name.endsWith(keyword),label+name);
      else assert.ok(name.includes(keyword),label+name);
    }
  }
  batches++; names+=result.length;
}
for(const [category,config] of Object.entries(api.SUBTYPE_OPTIONS)) {
  get('#category').value=category; api.updateCategoryControls();
  assert.deepEqual(get('#subtype').children.map(x=>x.value), Array.from(config.items,x=>x[0]));
  assert.equal(get('#surnameField').hidden,category!=='person');
  for(const [subtype] of config.items) {
    subtypes++;
    for(const style of Object.keys(api.STYLE_LABELS))
      for(const placement of ['front','middle','end','auto'])
        for(const keyword of ['', '鲲','北冥','玄玄','山']) check(category,subtype,style,placement,keyword);
  }
}
for(const [subtype] of api.SUBTYPE_OPTIONS.person.items)
  for(const gender of ['male','female','random'])
    for(const placement of ['front','middle','end','auto'])
      for(const keyword of ['','北冥','玄玄']) check('person',subtype,'mixed',placement,keyword,gender,'司马');
const favorite=api.state.results[0]; api.toggleFavorite(favorite);
assert.ok(api.state.favorites.some(f => f.name === favorite));
assert.ok(JSON.parse(storage.get('xuanjian-favorites-v2')).some(f => f.name === favorite));
api.toggleFavorite(favorite); assert.ok(!api.state.favorites.some(f => f.name === favorite));
// Interaction contracts: preserve slots, refresh only the requested candidate, reset locks on settings changes.
for (const [k,v] of Object.entries({category:'artifact',subtype:'sword',style:'jianghu',keyword:'',surname:'',placement:'auto'})) get('#'+k).value=v;
api.generate();
const firstBatch = Array.from(api.state.results);
api.toggleLock(firstBatch[2]); api.toggleLock(firstBatch[7]); api.generate();
assert.equal(api.state.results[2],firstBatch[2]); assert.equal(api.state.results[7],firstBatch[7]);
assert.equal(api.state.results.filter(n => firstBatch.includes(n)).length,2);
const beforeSingle = Array.from(api.state.results); api.generate(4);
assert.notEqual(api.state.results[4], beforeSingle[4]);
assert.deepEqual(Array.from(api.state.results).filter((_,i)=>i!==4), beforeSingle.filter((_,i)=>i!==4));
api.generate(2); assert.equal(api.state.results[2],firstBatch[2]);
api.state.results.forEach(api.toggleLock); // toggle already-locked entries, then ensure every row is locked
api.state.results.forEach(n => { if (!api.state.locked.has(n)) api.toggleLock(n); });
const allLocked=Array.from(api.state.results); api.generate();
assert.deepEqual(Array.from(api.state.results),allLocked); assert.equal(get('#generateButton').disabled,true);
get('#style').value='daoist'; api.generate(); assert.equal(api.state.locked.size,0);
assert.equal(get('#generateButton').disabled,false);

// Person style must affect actual given-name characters, not only metadata.
for (const style of Object.keys(api.PERSON_STYLES)) {
  for(let i=0;i<30;i++) {
    const n=api.buildPerson('', 'auto', 'double', 'male', '苏', style);
    assert.ok(api.PERSON_STYLES[style][0].includes([...n][1]));
  }
}
assert.equal(api.glue('玄冰','冰剑'),'玄冰剑');
assert.equal(api.glue('北冥','北冥'),'北冥');

// Astral CJK characters must remain whole, including a supplied compound surname.
for (const placement of ['front','middle','end','auto']) check('person','double','daoist',placement,'𠮷山','male','𠮷野');
assert.ok(api.state.results.every(n=>!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(n)));

// Legacy migration, exact-name dedupe, export/import round trip, and atomic failures.
api.changeFavorites([]);
storage.set('xuanjian-favorites',JSON.stringify(['旧收藏','旧收藏']));
storage.delete('xuanjian-favorites-v2');
assert.equal(api.loadFavorites().length,1); assert.equal(api.loadFavorites()[0].name,'旧收藏');
api.importFavorites(['旧收藏','北冥剑']);
api.saveEditedFavorite('北冥剑','北冥剑','主角佩剑');
api.importFavorites({app:'xuanjian',version:2,favorites:[{name:'北冥剑',note:'不应覆盖'},{name:'青莲丹',note:'备用'}]});
assert.equal(api.state.favorites.find(f=>f.name==='北冥剑').note,'主角佩剑');
const exported=JSON.stringify(api.exportData());
assert.throws(()=>api.importFavorites([{name:'有效名字'}, {name:12}]));
assert.equal(JSON.stringify(api.exportData()),exported);
assert.throws(()=>api.importFavorites({app:'other',version:2,favorites:[]}));
assert.throws(()=>api.saveEditedFavorite('青莲丹','北冥剑','重复'));
api.changeFavorites([]); api.undoFavorites(); assert.equal(JSON.stringify(api.exportData()),exported);
api.changeFavorites([]); api.importFavorites(JSON.parse(exported));
assert.equal(JSON.stringify(api.exportData()),exported);
assert.equal(storage.get('xuanjian-favorites'),JSON.stringify(['旧收藏','旧收藏']));
api.changeFavorites(Array.from({length:500},(_,i)=>({name:'名'+i,note:''})));
const full=JSON.stringify(api.exportData()); api.toggleFavorite('不能加入');
assert.equal(JSON.stringify(api.exportData()),full);
assert.throws(()=>api.importFavorites(['超额收藏'])); assert.equal(JSON.stringify(api.exportData()),full);
api.changeFavorites([]);
api.importFavorites([{name:'<script>alert(1)</script>',note:'<img src=x onerror=alert(1)>'}]);
assert.equal(api.state.favorites.length,1); // Renderer uses textContent throughout.

// Storage write failure keeps the in-memory data and makes the warning visible.
const writeStorage=context.localStorage.setItem;
context.localStorage.setItem=()=>{throw new Error('quota');};
api.toggleFavorite('不会丢失'); assert.ok(api.state.favorites.some(f=>f.name==='不会丢失'));
assert.equal(get('#storageWarning').hidden,false);
context.localStorage.setItem=writeStorage; api.saveFavorites(); assert.equal(get('#storageWarning').hidden,true);
storage.set('xuanjian-favorites-v2','{"broken":true}'); api.loadFavorites();
const corrupt=storage.get('xuanjian-favorites-v2'); api.saveFavorites();
assert.equal(storage.get('xuanjian-favorites-v2'),corrupt); assert.equal(get('#storageWarning').hidden,false);

// Copy fallback must never report success when execCommand returns false.
(async()=>{
  context.document.execCommand=()=>false;
  await api.copyText('test','成功'); assert.match(get('#toast').textContent,/复制失败/);
  context.document.execCommand=()=>true;
  await api.copyText('test','成功'); assert.equal(get('#toast').textContent,'成功');
  console.log(JSON.stringify({categories:Object.keys(api.SUBTYPE_OPTIONS).length,subtypes,batches,names,features:'locks, single refresh, styles, migration, import/export, edit, undo, capacity, storage failure, clipboard failure',status:'passed'},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
