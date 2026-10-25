import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.__FRAKTUM_CONFIG__={VITE_SUPABASE_URL:'https://project.supabase.co/',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_browser_test'};

test('OTP is posted directly to Supabase with the runtime publishable key',async()=>{
  let request;
  globalThis.fetch=async(url,options)=>{request={url:String(url),options};return new Response('{}',{status:200});};
  const {requestOtp}=await import(`../../src/cloud.js?otp=${Date.now()}`);
  await requestOtp({method:'email',identifier:'reader@example.com',createUser:true,metadata:{role:'reader'}});
  assert.equal(request.url,'https://project.supabase.co/auth/v1/otp');
  assert.equal(request.options.method,'POST');
  assert.equal(request.options.headers.apikey,'sb_publishable_browser_test');
  assert.equal(request.options.headers['Content-Type'],'application/json');
  assert.deepEqual(JSON.parse(request.options.body),{email:'reader@example.com',create_user:true,data:{role:'reader'}});
});

test('OTP surfaces the useful Supabase Auth response without exposing the key',async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify({message:'Invalid API key'}),{status:401,headers:{'content-type':'application/json'}});
  const {requestOtp}=await import(`../../src/cloud.js?otpError=${Date.now()}`);
  await assert.rejects(requestOtp({method:'email',identifier:'reader@example.com'}),error=>{
    assert.equal(error.message,'Supabase Auth 401: Invalid API key');
    assert.doesNotMatch(error.message,/sb_publishable_browser_test/);
    return true;
  });
});

test('logout clears the local session even when remote logout fails and reports the failure',async()=>{
  globalThis.localStorage={getItem:()=>JSON.stringify({access_token:'fixture-session',user:{id:'fixture-user'}}),setItem(){},removeItem(){}};
  const {signOut,getSession}=await import(`../../src/cloud.js?logoutFailure=${Date.now()}`);
  globalThis.fetch=async()=>Response.json({message:'Remote logout unavailable'},{status:503});
  await assert.rejects(signOut(),/503.*Remote logout unavailable/);
  assert.equal(getSession(),null);
});
