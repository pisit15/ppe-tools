const { defineConfig } = require('@playwright/test');
module.exports=defineConfig({
  testDir:'./tests',testMatch:'ppe-requests.spec.cjs',workers:1,timeout:90000,expect:{timeout:15000},
  webServer:[
    {command:'node tests/ppe-requests-fixture.cjs',url:'http://127.0.0.1:4328/health',timeout:60000},
    {command:'node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 4327',url:'http://127.0.0.1:4327/ppe',timeout:180000,
      env:{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:4328',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-ppe-anon',SUPABASE_SERVICE_ROLE_KEY:'local-ppe-service',TOOLS_SESSION_SECRET:'local-ppe-test-session-secret',NEXT_TELEMETRY_DISABLED:'1'}}
  ],
  use:{baseURL:'http://127.0.0.1:4327',channel:'chrome',headless:true,viewport:{width:1280,height:900},screenshot:'only-on-failure',trace:'retain-on-failure'},reporter:[['list']],
});
