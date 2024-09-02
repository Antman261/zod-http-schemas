import * as bodyParser from 'body-parser';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import * as useragent from 'express-useragent';
import * as http from 'http';
import * as morgan from 'morgan';
import { createRequestHandler, decorateExpressRouter, z } from '../../server';
import { testGetOnlySchema, testSchema } from './test-schema';

export function createTestServer() {
  const RequestProps = z.object({
    // `req.useragent` prop added by useragent middleware
    useragent: z.object({
      isMobile: z.boolean(),
      isDesktop: z.boolean(),
      browser: z.string(),
      os: z.string(),
      platform: z.string(),
      // ...and more
    }),
  });

  // Implement the HTTP schema using an Express Router instance.
  const typedRoutes = decorateExpressRouter({
    schema: testSchema,
    requestProps: RequestProps,
    onValidationError: (err, _, res) => {
      console.log(err);
      res
        .status(200)
        .send({ success: false, code: 'MY_CUSTOM_VALIDATION_ERROR' });
    },
  });

  // Specify some route handlers inline
  typedRoutes.get('/random-numbers', (req, res) => {
    req.useragent.isMobile;
    res.send([Math.random(), Math.random(), Math.random()]);
  });

  typedRoutes.post('/sum', (req, res) => {
    let result = req.body.reduce((sum, n) => sum + n, 0);
    res.send(result);
  });

  typedRoutes.get('/404', (req, res) => {
    res.status(404).json({ error: 'Resource not found' });
  });

  // Specify some route handlers separately and then add them to the app.
  const handleProduct = createRequestHandler({
    schema: testSchema,
    route: 'POST /product',
    requestProps: RequestProps,
    handler: (req, res) => {
      req.useragent.isMobile;
      let result = req.body.reduce((sum, n) => sum * n, 1);
      res.status(200).send(result);
    },
  });
  const handleWildcard = createRequestHandler(
    testSchema,
    'GET *',
    (req, res) => {
      if (req.params['0'] === '/hello') {
        res.status(200).send(`Hello, ${req.body.name}!`);
      } else {
        res.status(500).send('Server error');
      }
    }
  );
  const handleMultiply = createRequestHandler({
    schema: testSchema,
    route: 'PUT /multiply',
    requestProps: RequestProps,
    handler: (req, res) => {
      const { first, second } = req.body;
      const result = first * second;
      res.send(result);
    },
  });
  typedRoutes.post('/product', handleProduct);
  typedRoutes.put('/multiply', handleMultiply);
  typedRoutes.get('*', handleWildcard);

  const handleSumNegative = createRequestHandler({
    schema: testSchema,
    route: 'POST /sum/negative',
    handler: (req, res) => {
      const numbers = req.body;
      const result = numbers.reduce((acc, val) => acc + val, 0);
      res.send(result);
    },
  });
  typedRoutes.post('/sum/negative', handleSumNegative);

  const handleSumNegativeBuggy = createRequestHandler({
    schema: testSchema,
    route: 'POST /sum/negative',
    handler: (req, res) => {
      const numbers = req.body;
      const result = numbers.reduce((acc, val) => acc - val, 0);
      res.send(result);
    },
  });
  typedRoutes.post('/sum/negative-broken', handleSumNegativeBuggy);
  typedRoutes.post('/sum/transform-string', async (req, res) => {
    const numbers = req.body;
    const result = numbers.reduce((acc, val) => acc + val, 0);
    res.send(result);
  });
  typedRoutes.post('/sum/transform-response', async (req, res) => {
    const numbers = req.body;
    const result = numbers.reduce((acc, val) => acc + val, 0);
    res.send(result);
  });
  typedRoutes.post('/sum/with-query-param', async (req, res) => {
    const numbers = req.body;
    const result = numbers.reduce((acc, val) => acc + val, 0) + parseInt(req.query.alsoAdd as string);
    res.send(result);
  });

  // Create an Express Application and add middleware to it, including our HTTP schema implementation.
  const app = express();
  app.use(compression());
  app.use(cookieParser());
  app.use(morgan('combined'));
  app.use(useragent.express());
  app.use(bodyParser.json());
  app.use('/api', typedRoutes);

  // Return an object that allows the caller to start and stop the HTTP server.
  return {
    start() {
      return new Promise<void>((resolve) => {
        server = app.listen(8000, () => resolve());
      });
    },
    stop() {
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

let server: http.Server;

const log: express.RequestHandler = (req, _, next) => {
  console.log(`Incoming request: ${req.path}`);
  next();
};

export const createGetOnlyServer = () => {
  // Implement the HTTP schema using an Express Router instance.
  const typedRoutes = decorateExpressRouter({
    schema: testGetOnlySchema,
  });

  // Specify some route handlers inline
  typedRoutes.get('/random-numbers', [log], (req, res) => {
    res.send([Math.random(), Math.random(), Math.random()]);
  });

  // Create an Express Application and add middleware to it, including our HTTP schema implementation.
  const app = express();
  app.use(compression());
  app.use(cookieParser());
  app.use('/api', typedRoutes);

  // Return an object that allows the caller to start and stop the HTTP server.
  let server: http.Server;
  return {
    start() {
      return new Promise<void>((resolve) => {
        server = app.listen(8000, () => resolve());
      });
    },
    stop() {
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
};
