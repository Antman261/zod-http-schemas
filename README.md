# zod-http-schemas

`zod-http-schemas` brings together the best parts of [http-schemas](https://github.com/yortus/http-schemas) and [zod](https://github.com/colinhacks/zod) into one library that:

* Declares the 'shape' of an HTTP API both at compile time and at runtime.
* Supports transformations and refinements.

At compile time it statically checks:

* HTTP requests in the client code
* Route handlers in the server code against the declared schema, ensuring usage errors are caught early.

At runtime, `zod-http-schemas`:
* validates that response and request payloads match the declared schema
* Trims response payloads of any excess properties, preventing information leaks

Use a shared schema for both client and server side code as a single source of truth, ensuring
the client and server always agree on the API.

`zod-http-schemas` uses the [`zod`](https://github.com/colinhacks/zod) library for specifying and enforcing schema types.

## Installation

`npm install zod-http-schemas`


## Example Shared Code (use in both client and server)
```ts
import {createHttpSchema} from 'http-schemas';
import * as z from 'zod';

// Declare the http schema to be used by both client and server
export const apiSchema = createHttpSchema({
    'POST /sum': {
        requestBody: z.array(z.number()),
        responseBody: z.number(),
    },
    'GET /greet/:name': {
        responseBody: z.string(),
    },
});
```





## Example Client-Side Code
```ts
import {createHttpClient} from 'http-schemas/client';
import {apiSchema} from '<path-to-shared-schema>';

// Create a strongly-typed http client. These are cheap to create - it's fine to have many of them.
const client = createHttpClient(apiSchema, {baseURL: '/api'});

// Some valid request examples
let res1 = client.post('/sum', {body: [1, 2]});                 // res1: Promise<number>
let res2 = client.get('/greet/:name', {params: {name: 'Bob'}}); // res2: Promise<string>

// Some invalid request examples
let res3 = client.get('/sum', {body: [1, 2]});                  // tsc build error & runtime error
let res4 = client.post('/sum', {body: 'foo'});                  // tsc build error & runtime error
let res5 = client.post('/blah');                                // tsc build error & runtime error
```


## Example Server-Side Code
```ts
import * as express from 'express';
import {createRequestHandler, decorateExpressRouter} from 'http-schemas/server';
import {apiSchema} from '<path-to-shared-schema>';

// Create a strongly-typed express router.
const apiRouter = decorateExpressRouter({schema: apiSchema});

// Create a normal express app and mount the strongly-typed router.
const app = express();
app.use(express.json()); // it's a normal express app; mount whatever middleware you want
app.use('/api', apiRouter); // `apiRouter` is just middleware; mount it wherever you want

// Add a request handler directly to the router
apiRouter.post('/sum', (req, res) => {
    let result = req.body.reduce((sum, n) => sum + n, 0);
    res.send(result);
});

// Declare a request handler separately, then add it to the router
const greetHandler = createRequestHandler(apiSchema, 'GET', '/greet/:name', (req, res) => {
    res.send(`Hello, ${req.params.name}!`);
});
apiRouter.get('/greet/:name', greetHandler);

// Some invalid route handler examples
apiRouter.post('/blah', (req, res) => {/*...*/});           // tsc build error & runtime error
apiRouter.post('/sum', (req, res) => { req.body.foo[0] });  // tsc build error & runtime error
apiRouter.post('/sum', (req, res) => { res.send('foo') });  // tsc build error & runtime error

app.listen(8000);
```

## Full production-like webserver demo

The best way to see `http-schemas` in action is to see it in a real demonstration with documentation. Take a look at [http-schemas-webserver-demo](https://github.com/Antman261/http-schemas-webserver-demo), read the docs, run it and play with it yourself.
