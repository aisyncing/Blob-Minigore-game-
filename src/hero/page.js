// The game page's markup: canvas, HUD, menus, the tuning panel and the controller setup screen. main.js mounts it; the modules
// that drive each part look their elements up by id.
export const PAGE = `
<canvas id="c" tabindex="0"></canvas><div id="vig"></div>
<div id="top">
  <button id="bMode" class="primary">Play</button>
  <button id="bPad">Controller</button>
  <button id="bPractice">Practice range</button>
  <span class="pill" id="chipSrc">Keyboard + mouse</span>
</div>
<div id="turntableNames"></div>
<button id="bPlayNow" class="primary big">Play Now</button>
<div id="hint"></div>
<div id="hud"><div id="hearts"></div><div id="scoreBox"><b id="scoreV">0</b><span id="comboV"></span></div><div id="waveV"></div></div>
<div id="banner"><b></b><small></small></div>
<div id="arrows"></div>
<div id="tutorial" data-step="move" data-dev="pad"><div class="card">
  <svg class="pad" viewBox="0 0 200 120" width="168" height="101">
    <g class="trig l2"><rect x="32" y="12" width="36" height="15" rx="6"/><text x="50" y="23">L2</text></g>
    <g class="trig r2"><rect x="132" y="12" width="36" height="15" rx="6"/><text x="150" y="23">R2</text></g>
    <rect class="hl r2ring" x="128" y="8" width="44" height="23" rx="9"/>
    <path class="body" d="M60 30H140C165 30 182 50 190 85C194 102 184 112 172 108C162 105 156 92 148 84H52C44 92 38 105 28 108C16 112 6 102 10 85C18 50 35 30 60 30Z"/>
    <circle class="well" cx="58" cy="56" r="17"/><circle class="hl ring" cx="58" cy="56" r="22"/>
    <g class="orbit"><circle class="knob" cx="65" cy="56" r="11"/></g>
    <circle class="well" cx="122" cy="84" r="13"/><circle class="knob dim" cx="122" cy="84" r="9"/>
    <path class="dpad" d="M84 76h8v6h6v8h-6v6h-8v-6h-6v-8h6z"/>
    <g class="face"><circle cx="148" cy="42" r="5"/><circle cx="148" cy="62" r="5"/><circle cx="138" cy="52" r="5"/><circle cx="158" cy="52" r="5"/></g>
  </svg>
  <div class="keys">
    <div class="kmove"><b class="k kw">W</b><div><b class="k ka">A</b><b class="k ks">S</b><b class="k kd">D</b></div></div>
    <svg class="kshoot" viewBox="0 0 40 56" width="46" height="64"><rect class="mbody" x="3" y="3" width="34" height="50" rx="16"/><path class="mbtn" d="M20 3A17 17 0 0 0 3 20V26H20Z"/><path class="mline" d="M3 26H37M20 3V26"/></svg>
  </div>
  <b class="cap">Move</b>
</div></div>
<div id="over"><div class="box"><h2>Game over</h2><p id="overStats"></p><p id="overBest"></p><button id="bRetry" class="primary big">Play again</button><small>Press <b>A</b> on the controller or Enter</small></div></div>
<div id="ammo"><div id="shells"></div><div id="reloadBar"><i></i></div></div>
<aside id="panel">
  <h2>Game feel</h2>
  <div id="sliders"></div>
  <div class="actions"><button id="bReset">Reset</button><button id="bHide">Hide</button></div>
  <details><summary>Advanced</summary>
    <div class="actions"><button id="bCopy">Copy my settings</button><button id="bRange">Reset range</button></div>
    <h2>Movement presets</h2><div class="actions" id="presets"></div><div class="stat" id="stats"></div>
    <h2>Last shot</h2><div class="stat" id="shotStat">Fire at a dummy.</div>
    <label class="chk"><input type="checkbox" id="dbg"> Show colliders and numbers</label>
    <textarea id="copyBox" readonly hidden></textarea>
    <h2>Diagnostics</h2><div class="diag" id="diag"></div>
  </details>
</aside>
<button id="panelBtn">Tuning</button>
<div id="focus"><div class="setup">
  <h1>Blob Shooter</h1>
  <div class="conn" id="conn"><i class="dot"></i><div><b id="connName">No controller found</b><small id="connSub">Press any button on your controller so the browser can see it.</small></div></div>
  <div class="cols">
    <section>
      <h3>Vibration</h3>
      <div id="vibSliders"></div>
    </section>
    <section>
      <h3>PS5 adaptive triggers</h3>
      <div class="hint" id="dsStatus"></div>
      <div class="actions"><button id="bDs">Connect adaptive triggers</button></div>
      <details><summary>Bluetooth layout</summary><div class="actions"><select id="dsLayout" title="Only matters over Bluetooth"><option value="auto">Automatic</option><option value="usb">Force USB layout</option><option value="bt-a">Bluetooth layout A</option><option value="bt-b">Bluetooth layout B</option></select></div></details>
    </section>
  </div>
  <details id="feel"><summary>Try the feel</summary>
    <div class="hint" id="dsRumble"></div>
    <div class="actions"><button data-rt="barrel1">1st barrel</button><button data-rt="barrel2">2nd barrel</button><button data-rt="reload">Reload</button><button data-rt="dry">Empty click</button><button id="bRamp">Strength ramp</button></div>
    <div class="actions"><button data-tt="first">Trigger: 1st barrel</button><button data-tt="second">Trigger: 2nd barrel</button><button data-tt="locked">Locked</button><button data-tt="kick">Buzz</button><button data-tt="off">Normal</button></div>
  </details>
  <details><summary>Sticks and trigger</summary><div id="inputSliders"></div></details>
  <div class="go"><button id="bStart" class="primary big">Start game</button><span id="goHint">Press <b>A</b> on the controller, or click. No controller? WASD moves, mouse aims and fires.</span></div>
</div></div>`;

export { $, fmt } from '../engine/dom.js';
