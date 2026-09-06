import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
// Run tests/observer-flow.ts first to create an isolated gallery.
const fixture = JSON.parse(
  readFileSync(".gallery-twin/observer-check.json", "utf8"),
);
mkdirSync("work/camera-controls", { recursive: true });
const run = (...args) =>
  execFileSync(
    "npx",
    ["--yes", "agent-browser", "--session", "camera-controls", ...args],
    { encoding: "utf8" },
  ).trim();
const evaluate = (code) => JSON.parse(run("eval", code));
const click = (label) =>
  evaluate(
    `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('button missing');b.click();return true})()`,
  );
const wait = () =>
  evaluate("new Promise(resolve=>setTimeout(()=>resolve(true),300))");
run(
  "open",
  (process.env.GALLERY_TEST_BASE_URL ?? "http://127.0.0.1:3000") +
    "/gallery/" +
    fixture.galleryId,
);
run("set", "viewport", "1440", "1100");
try {
  wait();
  click("자유 모드");
  wait();
  const shot = async (name) => {
    run("screenshot", `work/camera-controls/${name}.png`);
    return sharp(`work/camera-controls/${name}.png`)
      .extract({ left: 300, top: 325, width: 730, height: 620 })
      .removeAlpha()
      .raw()
      .toBuffer();
  };
  const difference = (a, b) =>
    a.reduce((n, v, i) => n + Math.abs(v - b[i]), 0) / a.length;
  for (const [code, key] of [
    ["KeyW", "ㅈ"],
    ["KeyS", "ㄴ"],
    ["KeyA", "ㅁ"],
    ["KeyD", "ㅇ"],
    ["KeyE", "ㄷ"],
    ["KeyQ", "ㅂ"],
  ]) {
    click("시점 초기화");
    wait();
    evaluate(
      `(()=>{[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='자유 모드').focus();return document.activeElement.tagName})()`,
    );
    const before = await shot(code + "-before");
    evaluate(
      `new Promise(resolve=>{const target=document.activeElement;target.dispatchEvent(new KeyboardEvent('keydown',{code:'${code}',key:'${key}',bubbles:true,cancelable:true}));setTimeout(()=>{window.dispatchEvent(new KeyboardEvent('keyup',{code:'${code}',key:'${key}',bubbles:true}));resolve(true)},350)})`,
    );
    const after = await shot(code + "-after");
    const diff = difference(before, after);
    assert(diff > 0.5, `${code} did not move camera: ${diff}`);
    console.log(
      `PASS ${code}, Korean key, toolbar focus (pixel delta ${diff.toFixed(2)})`,
    );
  }
  click("시점 초기화");
  wait();
  evaluate(
    `(()=>{document.querySelector('input[type=number]').focus();return true})()`,
  );
  const before = await shot("input-before");
  evaluate(
    `new Promise(resolve=>{document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',key:'e',bubbles:true,cancelable:true}));setTimeout(()=>{window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyE',key:'e'}));resolve(true)},350)})`,
  );
  const after = await shot("input-after");
  assert(difference(before, after) < 0.1, "Typing in input moved camera");
  console.log("PASS input focus prevents camera movement");

  const widths = evaluate(
    'document.querySelector("canvas").getBoundingClientRect().width',
  );
  click("왼쪽 패널 숨기기");
  click("오른쪽 패널 숨기기");
  click("조작 버튼 숨기기");
  wait();
  assert(
    evaluate('document.querySelector("canvas").getBoundingClientRect().width') >
      widths + 400,
    "Hidden panels did not expand canvas",
  );
  assert(
    evaluate(
      'getComputedStyle(document.getElementById("gallery-space-tools")).display === "none"',
    ),
  );
  assert(
    evaluate(
      'getComputedStyle(document.getElementById("gallery-artwork-tools")).display === "none"',
    ),
  );
  assert(
    evaluate('!document.querySelector(`[aria-label="자유 카메라 이동"]`)'),
  );
  click("왼쪽 패널 보기");
  click("오른쪽 패널 보기");
  click("조작 버튼 보기");
  wait();
  assert(
    Math.abs(
      evaluate(
        'document.querySelector("canvas").getBoundingClientRect().width',
      ) - widths,
    ) < 2,
  );
  assert(
    evaluate('!!document.querySelector(`[aria-label="자유 카메라 이동"]`)'),
  );
  assert.equal(run("errors"), "", "Browser errors");
  console.log("PASS panel and camera-control hide/show");
} finally {
  run("close");
}
