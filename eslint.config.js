export default [{
  files:['src/**/*.js','build.mjs','server.mjs','tests/**/*.js'],
  ignores:['dist/**'],
  languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:{window:'readonly',document:'readonly',navigator:'readonly',localStorage:'readonly',fetch:'readonly',FormData:'readonly',File:'readonly',Image:'readonly',URL:'readonly',CSS:'readonly',crypto:'readonly',structuredClone:'readonly',requestAnimationFrame:'readonly',getComputedStyle:'readonly',alert:'readonly',prompt:'readonly',getSelection:'readonly',RTCPeerConnection:'readonly',RTCSessionDescription:'readonly',RTCIceCandidate:'readonly',MediaStream:'readonly',setTimeout:'readonly',clearTimeout:'readonly',setInterval:'readonly',clearInterval:'readonly',console:'readonly',process:'readonly',Buffer:'readonly'}},
  rules:{'no-undef':'error','no-unreachable':'error','no-dupe-keys':'error','no-constant-binary-expression':'error'}
}];
