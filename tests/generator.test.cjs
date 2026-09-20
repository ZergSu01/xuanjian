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
  navigator: {}, setTimeout, clearTimeout, console
});
vm.runInContext(scripts[0][1] + '\n globalThis.api = {SUBTYPE_OPTIONS, STYLE_LABELS, state, generate, updateCategoryControls, toggleFavorite};', context);
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
assert.ok(api.state.favorites.includes(favorite));
assert.ok(JSON.parse(storage.get('xuanjian-favorites')).includes(favorite));
api.toggleFavorite(favorite); assert.ok(!api.state.favorites.includes(favorite));
console.log(JSON.stringify({categories:Object.keys(api.SUBTYPE_OPTIONS).length,subtypes,batches,names,status:'passed'},null,2));
