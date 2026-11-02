// Production-server E2E build with isolated fixture credentials. Never deploy this output.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const result=spawnSync(process.execPath,[path.join(__dirname,'../node_modules/next/dist/bin/next'),'build'],{
 cwd:path.join(__dirname,'..'),stdio:'inherit',windowsHide:true,
 env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_PERMIT_DEMO:'true',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:4321',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-test-anon',SUPABASE_SERVICE_ROLE_KEY:'local-test-service-secret',TOOLS_SESSION_SECRET:'local-test-session-secret'},
});process.exit(result.status??1);
