import {
  TcfApiRequest,
  TcfContext,
  Router,
  bodyParser,
  cookieParser
} from 'tcf-router';
import * as path from 'path';
import apiRouter from './routers/demo.router';

const createApp = (
  request: TcfApiRequest,
  context: Record<string, any>
): Router => {
  const app = new Router(request, {
    templateFolder: path.join(__dirname, 'templates'),
    defaultTemplateData: { translation: {}, namespace: '' }
  });

  app.use(bodyParser);
  app.use(cookieParser);

  // middleware
  app.use(async (req, res, next) => {
    // todo something such as logging
    console.log(req.httpMethod, req.path);
    await next();
  });

  app.get('/', async (req, res, next) => {
    res.text('Welcome!');
  });

  app.extends(apiRouter);

  app.get(async (req, res, next) => {
    res.statusCode = 404;
    res.text('not-found');
    // res.render('your ejs 404 page name');
  });

  return app;
};

const main = async (request: TcfApiRequest, context: TcfContext) => {
  const app = createApp(request, context);
  return app.serve();
};

export { main, createApp };
