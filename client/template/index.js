const { Router, bodyParser, cookieParser } = require('tcf-router');
const path = require('path');
const demoRouter = require('./routers/demo.router');

const createApp = (request, context) => {
  const app = new Router(request, {
    templateFolder: path.join(__dirname, 'templates'),
    defaultTemplateData: { translation: {}, namespace: '' }
  });

  app.use(bodyParser);
  app.use(cookieParser);

  // middleware
  app.use(async (req, res, next) => {
    // TODO something such as logging
    console.log(req.httpMethod, req.path);
    await next();
  });

  app.get('/', async (req, res, next) => {
    res.text('Welcome!');
  });

  app.extends(demoRouter);

  app.get(async (req, res, next) => {
    res.statusCode = 404;
    res.text('not-found');
  });

  return app;
};

const main = async (request, context) => {
  const app = createApp(request, context);
  return app.serve();
};

module.exports = { main, createApp };
