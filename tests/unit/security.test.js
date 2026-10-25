import test from 'node:test';import assert from 'node:assert/strict';
globalThis.location={origin:'https://fraktum.test'};const {safeUrl}=await import('../../src/security/SanitizeHtml.js');
test('URL policy rejects scriptable protocols',()=>{assert.equal(safeUrl('javascript:alert(1)'),'');assert.equal(safeUrl('data:text/html,x'),'');assert.equal(safeUrl('https://example.com/x'),'https://example.com/x');});
test('blob URLs are restricted to image contexts',()=>{assert.equal(safeUrl('blob:preview'),'');assert.equal(safeUrl('blob:preview',{image:true}),'blob:preview');});
