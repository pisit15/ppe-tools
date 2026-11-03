const base=require('./playwright.ppe-requests.config.cjs');
module.exports={...base,testMatch:'ppe-employees.spec.cjs',webServer:[
  {...base.webServer[0],command:'node tests/ppe-employees-fixture.cjs',url:'http://127.0.0.1:4338/health'},
  {...base.webServer[1],command:'node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 4337',url:'http://127.0.0.1:4337/ppe',env:{...base.webServer[1].env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:4338'}}
],use:{...base.use,baseURL:'http://127.0.0.1:4337'}};
