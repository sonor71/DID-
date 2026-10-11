const runtime=globalThis.__FRAKTUM_CONFIG__||{};
const fromMeta=import.meta.env||{};
export const config=Object.freeze({
  supabaseUrl:String(runtime.VITE_SUPABASE_URL||fromMeta.VITE_SUPABASE_URL||'').replace(/\/$/,''),
  supabasePublishableKey:String(runtime.VITE_SUPABASE_PUBLISHABLE_KEY||fromMeta.VITE_SUPABASE_PUBLISHABLE_KEY||''),
  pushPublicKey:String(runtime.VITE_PUSH_PUBLIC_KEY||fromMeta.VITE_PUSH_PUBLIC_KEY||''),
  demoEnabled:String(runtime.VITE_ENABLE_DEMO_DATA||fromMeta.VITE_ENABLE_DEMO_DATA||'false')==='true'
});
