const cds = require('@sap/cds');
//(const proxy = require('@sap/cds-odata-v4-adapter-proxy');

cds.on('bootstrap', (app) => {
  //app.use(proxy());
});

module.exports = cds.server;