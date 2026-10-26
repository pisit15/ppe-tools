const base=require('./playwright.ppe-requests.config.cjs');
module.exports={...base,testMatch:'ppe-reports.spec.cjs',webServer:[
  {...base.webServer[0],command:'node tests/ppe-reports-fixture.cjs'},base.webServer[1]
]};
