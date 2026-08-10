// 无头 UI 测试台: 用 THREE/DOM 桩真实执行 complex_landscape.html 的模块脚本,
// 模拟预设点击, 检查曲面高度是否真的切换 / 是否有异常被吞。
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../demo/complex_analysis/complex_landscape.html', 'utf8');

// ---------- THREE 桩 ----------
class V3 { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} }
class PosAttr {
  constructor(arr){ this.arr = arr; }
  get count(){ return this.arr.length/3; }
  getX(i){ return this.arr[i*3]; } getY(i){ return this.arr[i*3+1]; } getZ(i){ return this.arr[i*3+2]; }
  setY(i,v){ this.arr[i*3+1] = v; }
}
class PlaneGeometry {
  constructor(w,h,ws,hs){
    const arr=[];
    for(let iy=0;iy<=hs;iy++)for(let ix=0;ix<=ws;ix++){
      arr.push(-w/2+w*ix/ws, h/2-h*iy/hs, 0);
    }
    this.attributes={position:new PosAttr(arr)};
  }
  rotateX(a){
    const p=this.attributes.position.arr;
    for(let i=0;i<p.length;i+=3){
      const y=p[i+1],z=p[i+2];
      p[i+1]=y*Math.cos(a)-z*Math.sin(a);
      p[i+2]=y*Math.sin(a)+z*Math.cos(a);
    }
  }
  setAttribute(){} computeVertexNormals(){} dispose(){}
}
class Color {
  constructor(){this.r=0;this.g=0;this.b=0;}
  setRGB(r,g,b){this.r=r;this.g=g;this.b=b;} setHSL(){0;}
}
const noop = class { constructor(g, m){ this.position=new V3(); this.domElement=mkEl('canvas');
    this.geometry = g || { dispose(){} }; this.material = m || { dispose(){} }; }
  add(){} remove(){} setPixelRatio(){} setSize(){} render(){} update(){}
  setFromPoints(){return this;} dispose(){} setFromCamera(){} intersectObject(){return [];}
  updateProjectionMatrix(){} };
const THREE = new Proxy({PlaneGeometry, Color, Vector3:V3, Vector2:V3}, {
  get(t,k){ return t[k] || noop; }
});

// ---------- DOM 桩 ----------
function mkCtx() {
  return new Proxy({ createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4), width:w, height:h}),
    putImageData(){}, measureText:()=>({width:0}) },
    { get(t,k){ return t[k] !== undefined ? t[k] : ()=>{}; },
      set(){ return true; } });
}
function mkEl(tag) {
  return { tag, style:{}, dataset:{}, value:'', textContent:'', innerHTML:'',
    width:280, height:280, listeners:{},
    addEventListener(ev,fn){ this.listeners[ev]=fn; },
    getContext(){ return mkCtx(); },
    getBoundingClientRect(){ return {left:0,top:0,width:280,height:280}; },
    appendChild(){}, remove(){} };
}
const els = {};
const elIds = ['err','status','fin','range','cx','cy','hmode','rho','rhoShow','probe','probeInfo','probeCv','ctCv','go','ui','loading','probeClose','hscale','gsize','glift'];
for (const id of elIds) els[id] = mkEl('div');
els.fin.value = '(z^2-1)/z'; els.range.value = '2.5'; els.cx.value = '0'; els.cy.value = '0';
els.hmode.value = 'log'; els.rho.value = '12';
els.hscale.value = '100'; els.gsize.value = '100'; els.glift.value = '0';
els.probeCv.width = 380; els.probeCv.height = 236;
global.document = {
  getElementById: id => els[id] || mkEl(id),
  querySelectorAll: () => [],
  createElement: () => mkEl('div'),
  body: { appendChild(){} },
};
global.window = global;
global.innerWidth = 1000; global.innerHeight = 700;
global.devicePixelRatio = 1;
global.requestAnimationFrame = () => {};   // 不进渲染循环
global.performance = { now: () => Date.now() };
global.addEventListener = () => {};

// ---------- 组装并执行页面脚本 ----------
const classic = html.match(/<script>\n\/\/ =+ 复数运算[\s\S]*?<\/script>/)[0]
  .replace(/<\/?script>/g, '');
let mod = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
mod = mod.replace(/import \* as THREE from 'three';/, '')
         .replace(/import { OrbitControls } from [^;]+;/, 'const OrbitControls = THREE.OrbitControls;');
let MESH_HEIGHTS = null;
// 钩子: 捕获每次 rebuild 后的 mesh 高度
mod = mod.replace(/world\.add\(mesh\);/, 'world.add(mesh); MESH_HEIGHTS = Array.from(geo.attributes.position.arr.filter((_,i)=>i%3===1));');

try {
  const fn = new Function('THREE', 'let MESH_HEIGHTS = null;\n' + classic + '\n' + mod + '\nreturn { getH: () => MESH_HEIGHTS, els: null };');
  // MESH_HEIGHTS 在闭包内, 用 getH 取
  var api = fn(THREE);
} catch (e) {
  console.log('模块执行抛异常:', e.message);
  console.log(e.stack.split('\n').slice(0, 4).join('\n'));
  process.exit(1);
}

function heightsSig(h) {
  if (!h) return 'null';
  let s = 0, s2 = 0;
  for (const v of h) { if (isFinite(v)) { s += v; s2 += v*v; } }
  return `sum=${s.toFixed(2)} sumsq=${s2.toFixed(2)} n=${h.length}`;
}

console.log('初始 (z^2-1)/z:', heightsSig(api.getH()));

// 模拟预设点击: 直接复刻 ui click handler 的行为
function clickPreset(f, cx, cy, r) {
  els.fin.value = f;
  els.cx.value = cx || 0; els.cy.value = cy || 0; els.range.value = r || 2.5;
  try {
    els.ui.listeners.click({ target: { dataset: { f, cx, cy, r }, classList: { add(){}, remove(){} } } });
    console.log(`点击 ${f}:`, heightsSig(api.getH()), els.err.textContent || '(无错误)');
  } catch (e) {
    console.log(`点击 ${f}: 异常!`, e.message);
  }
}
clickPreset('z^5-1');
clickPreset('sin(z)');
clickPreset('zeta(z)', '0', '17', '18');
clickPreset('gamma(z)', '0', '0', '4.5');
