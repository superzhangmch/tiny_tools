const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../demo/fourier2d_image.html', 'utf8');
const core = html.match(/\/\/ =+ FFT 核心[\s\S]*?\/\/ =+ 核心结束 =+/)[0];
const { fft, fft2d } = new Function(core + '\nreturn {fft, fft2d};')();

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('ok  ', name); }
  else { fail++; console.log('FAIL', name, extra); }
};
// 1. 1D 往返
{
  const n = 64;
  const re = Float64Array.from({length: n}, () => Math.random());
  const im = new Float64Array(n);
  const r0 = Float64Array.from(re);
  fft(re, im, false); fft(re, im, true);
  let err = 0;
  for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(re[i] - r0[i]), Math.abs(im[i]));
  check('1D FFT 往返 < 1e-12', err < 1e-12, err);
}
// 2. 单频正弦的谱应集中在 ±k
{
  const n = 64, k = 5;
  const re = Float64Array.from({length: n}, (_, i) => Math.cos(2 * Math.PI * k * i / n));
  const im = new Float64Array(n);
  fft(re, im, false);
  let big = [];
  for (let i = 0; i < n; i++) if (Math.hypot(re[i], im[i]) > 1) big.push(i);
  check('cos(2πkx) 谱 = {k, n−k}', big.length === 2 && big[0] === k && big[1] === n - k, big);
}
// 3. Parseval
{
  const n = 128;
  const re = Float64Array.from({length: n}, () => Math.random() - 0.5);
  const im = new Float64Array(n);
  const e0 = re.reduce((s, v) => s + v * v, 0);
  fft(re, im, false);
  let e1 = 0;
  for (let i = 0; i < n; i++) e1 += re[i] ** 2 + im[i] ** 2;
  check('Parseval: Σ|f|² = Σ|F|²/n', Math.abs(e0 - e1 / n) < 1e-10, [e0, e1 / n]);
}
// 4. 2D 往返
{
  const N2 = 32, T = N2 * N2;
  const re = Float64Array.from({length: T}, () => Math.random());
  const im = new Float64Array(T);
  const r0 = Float64Array.from(re);
  fft2d(re, im, N2, false); fft2d(re, im, N2, true);
  let err = 0;
  for (let i = 0; i < T; i++) err = Math.max(err, Math.abs(re[i] - r0[i]), Math.abs(im[i]));
  check('2D FFT 往返 < 1e-11', err < 1e-11, err);
}
// 5. 保留全部基 = 无损
{
  const N2 = 16, T = N2 * N2;
  const px = Float64Array.from({length: T}, () => Math.random() * 255);
  const re = Float64Array.from(px), im = new Float64Array(T);
  fft2d(re, im, N2, false);
  fft2d(re, im, N2, true);
  let err = 0;
  for (let i = 0; i < T; i++) err = Math.max(err, Math.abs(re[i] - px[i]));
  check('全基重建无损', err < 1e-10, err);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
