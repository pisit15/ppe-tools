const {spawn} = require('node:child_process');
const path = require('node:path');
const {startFixture} = require('./chemical-db-fixture.cjs');
const root = path.join(__dirname,'..');
(async()=>{
  const fixture = await startFixture();
  console.log('Isolated chemical test database ready on 127.0.0.1:4311');
  const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port','4310'],{cwd:root,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:4311',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-test-anon',SUPABASE_SERVICE_ROLE_KEY:'local-test-service-secret',TOOLS_SESSION_SECRET:'local-test-session-secret',ANTHROPIC_API_KEY:''},stdio:'inherit',windowsHide:true});
  const stop=()=>{child.kill();fixture.server.close();fixture.db.close();};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  child.on('exit',code=>{fixture.server.close();fixture.db.close().then(()=>process.exit(code||0));});
})().catch(e=>{console.error(e);process.exit(1);});
