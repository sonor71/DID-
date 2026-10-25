import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('manifest PNG declarations match real square icon dimensions',()=>{
  const manifest=JSON.parse(fs.readFileSync('public/manifest.webmanifest','utf8'));
  assert.deepEqual(manifest.icons.map(icon=>icon.sizes).sort(),['192x192','512x512']);
  for(const icon of manifest.icons) {
    assert.equal(icon.type,'image/png');
    const png=fs.readFileSync(`public${icon.src}`);
    assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    assert.equal(png.toString('ascii',12,16),'IHDR');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`,icon.sizes);
  }
});

test('favicon and Apple touch icon use valid explicit PNG sizes',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.match(html,/<link rel="icon" type="image\/png" sizes="192x192" href="\/assets\/icons\/icon-192\.png">/);
  assert.match(html,/<link rel="apple-touch-icon" sizes="180x180" href="\/assets\/icons\/icon-180\.png">/);
  const icon=fs.readFileSync('public/assets/icons/icon-180.png');
  assert.equal(icon.readUInt32BE(16),180);assert.equal(icon.readUInt32BE(20),180);
});
