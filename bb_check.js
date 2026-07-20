// End-to-end 校验:把 blackbody.html 的核心物理原样重跑,和解析公式对比
"use strict";

function buildModes(nMax){
  const f=[];
  for(let x=1;x<=nMax;x++)for(let y=1;y<=nMax;y++)for(let z=1;z<=nMax;z++){
    const nu=Math.sqrt(x*x+y*y+z*z);
    if(nu>nMax) continue;
    f.push(nu); f.push(nu); // ×2 偏振
  }
  return Float64Array.from(f);
}

function run({T,h,nMax,quantum,equil,sample}){
  const freq=buildModes(nMax);
  const M=freq.length;
  const nq=new Float64Array(M), ec=new Float64Array(M);
  const sweep=()=>{
    if(quantum){
      for(let i=0;i<M;i++){
        const dn=Math.random()<0.5?1:-1; const n2=nq[i]+dn; if(n2<0)continue;
        const dE=dn*h*freq[i];
        if(dE<=0||Math.random()<Math.exp(-dE/T)) nq[i]=n2;
      }
    }else{
      const s=Math.max(0.5,1.5*T);
      for(let i=0;i<M;i++){
        const dE=(Math.random()*2-1)*s; const e2=ec[i]+dE; if(e2<0)continue;
        if(dE<=0||Math.random()<Math.exp(-dE/T)) ec[i]=e2;
      }
    }
  };
  const E=i=> quantum? nq[i]*h*freq[i] : ec[i];
  for(let s=0;s<equil;s++) sweep();
  // 时间平均每个模式的能量
  const avgE=new Float64Array(M);
  for(let s=0;s<sample;s++){ sweep(); for(let i=0;i<M;i++) avgE[i]+=E(i); }
  for(let i=0;i<M;i++) avgE[i]/=sample;
  return {freq,M,avgE};
}

function planckOsc(nu,T,h){ const x=h*nu/T; return x<40? h*nu/(Math.exp(x)-1):0; }

console.log("=== A. 单模式平均能量 vs 普朗克振子 hν/(e^{hν/T}-1) [量子] ===");
{
  const T=2,h=1,nMax=14;
  const {freq,M,avgE}=run({T,h,nMax,quantum:true,equil:3000,sample:6000});
  // 按频率分箱取代表模式
  const targets=[2,4,6,8,10,12];
  for(const nt of targets){
    let sumE=0,cnt=0;
    for(let i=0;i<M;i++) if(Math.abs(freq[i]-nt)<0.4){ sumE+=avgE[i]; cnt++; }
    if(cnt){ const meas=sumE/cnt, th=planckOsc(nt,T,h);
      console.log(`  ν≈${nt}: 实测⟨E⟩=${meas.toFixed(4)}  理论=${th.toFixed(4)}  比=${(meas/th).toFixed(3)}  (模式数${cnt})`); }
  }
}

console.log("\n=== B. 分箱能谱 实测 vs 理论 [量子, nBins=64 同 HTML] ===");
{
  const T=2,h=1,nMax=18,nBins=64;
  const {freq,M,avgE}=run({T,h,nMax,quantum:true,equil:3000,sample:4000});
  const dnu=nMax/nBins;
  const meas=new Float64Array(nBins), cnt=new Float64Array(nBins);
  for(let i=0;i<M;i++){ let b=Math.floor(freq[i]/nMax*nBins); if(b>=nBins)b=nBins-1; meas[b]+=avgE[i]; cnt[b]++; }
  // 对每格模式数做二次拟合 密度 g(ν)=aν²+bν+c (含边界修正), 得到光滑正确的密度
  // 正规方程 (加权=按 cnt, 强调有模式的区域)
  let S=[0,0,0,0,0], Sy=[0,0,0]; // Σw x^k, Σw y x^k
  for(let b=0;b<nBins;b++){ const nu=(b+0.5)*dnu; const dens=cnt[b]/dnu; const w=1;
    const x=nu; let xp=1; for(let k=0;k<5;k++){ S[k]+=w*xp; xp*=x; }
    Sy[0]+=w*dens; Sy[1]+=w*dens*x; Sy[2]+=w*dens*x*x; }
  // 解 3x3: [[S0,S1,S2],[S1,S2,S3],[S2,S3,S4]] [c,b,a]=Sy
  const A=[[S[0],S[1],S[2]],[S[1],S[2],S[3]],[S[2],S[3],S[4]]];
  const solve3=(A,y)=>{ const M=A.map((r,i)=>[...r,y[i]]);
    for(let i=0;i<3;i++){ let p=i; for(let r=i+1;r<3;r++) if(Math.abs(M[r][i])>Math.abs(M[p][i]))p=r; [M[i],M[p]]=[M[p],M[i]];
      for(let r=0;r<3;r++) if(r!==i){ const f=M[r][i]/M[i][i]; for(let c=i;c<4;c++) M[r][c]-=f*M[i][c]; } }
    return [M[0][3]/M[0][0],M[1][3]/M[1][1],M[2][3]/M[2][2]]; };
  const [c0,b0,a0]=solve3(A,Sy);
  const gfit=nu=> Math.max(0,a0*nu*nu+b0*nu+c0)*dnu;
  console.log(`  拟合密度 g(ν)=${a0.toFixed(2)}ν² + ${b0.toFixed(2)}ν + ${c0.toFixed(2)}  (πν² 会给 a=${Math.PI.toFixed(2)}, b=0)`);
  let jag=0,nb=0,sPi=0,sFit=0,nn=0;
  for(let b=2;b<nBins;b++){ const nu=(b+0.5)*dnu; if(cnt[b]<3) continue;
    const thPi=Math.PI*nu*nu*dnu*planckOsc(nu,T,h), thFit=gfit(nu)*planckOsc(nu,T,h);
    if(meas[b]>0.3){ sPi+=meas[b]/thPi; sFit+=meas[b]/thFit; nn++; } }
  // 绿线光滑度
  for(let b=1;b<nBins;b++){ const nu=(b+0.5)*dnu; const t=gfit(nu)*planckOsc(nu,T,h), tp=gfit((b-0.5)*dnu)*planckOsc((b-0.5)*dnu,T,h);
    if(t>0.5){ jag+=Math.abs(t-tp)/((t+tp)/2); nb++; } }
  console.log(`  平均比值 实测/理论 :  旧πν²=${(sPi/nn).toFixed(3)}   新二次拟合=${(sFit/nn).toFixed(3)}  (越接近1越好)`);
  console.log(`  绿线相邻相对跳变(二次拟合)=${(jag/nb*100).toFixed(2)}% (二次曲线本就光滑)`);
}

console.log("\n=== C. 维恩位移 ν_peak/T (理论≈2.821) ===");
{
  const h=1,nMax=26,nBins=200;
  for(const T of [1.5,2.5,3.5]){
    let pk=0,pknu=0; const dnu=nMax/nBins;
    for(let b=0;b<nBins;b++){ const nu=(b+0.5)*dnu; const s=Math.PI*nu*nu*dnu*planckOsc(nu,T,h);
      if(s>pk){pk=s;pknu=nu;} }
    console.log(`  T=${T}: ν_peak≈${pknu.toFixed(2)}  ν_peak/T=${(pknu/T).toFixed(3)}`);
  }
}

console.log("\n=== D. 斯特藩-玻尔兹曼 E∝T⁴ [量子,大 nMax] ===");
{
  const h=1,nMax=22;
  const res=[];
  for(const T of [1.5,3.0]){
    const {M,avgE}=run({T,h,nMax,quantum:true,equil:2500,sample:2500});
    let E=0; for(let i=0;i<M;i++) E+=avgE[i];
    res.push({T,E});
    console.log(`  T=${T}: E总=${E.toFixed(0)}  E/T⁴=${(E/Math.pow(T,4)).toFixed(1)}`);
  }
  console.log(`  温度翻倍 E 应≈×16, 实测×${(res[1].E/res[0].E).toFixed(1)}`);
}

console.log("\n=== E. 经典单模式⟨E⟩应=kT=T (能量均分) ===");
{
  const T=2,h=1,nMax=12;
  const {M,avgE}=run({T,h,nMax,quantum:false,equil:3000,sample:5000});
  let s=0; for(let i=0;i<M;i++) s+=avgE[i];
  console.log(`  经典平均每模式⟨E⟩=${(s/M).toFixed(4)}  (应=${T})`);
}
