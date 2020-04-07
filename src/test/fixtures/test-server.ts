import * as bodyParser from 'body-parser';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import * as useragent from 'express-useragent';
import * as http from 'http';
import {decorateExpressRouter, t} from '../../server';
import {testSchema} from './test-schema';


export function createTestServer() {

    // Implement the HTTP schema using an Express Router instance.
    const typedRoutes = decorateExpressRouter({
        schema: testSchema,
        router: express.Router(), // use a blank new router
        requestProps: t.object({
            // `req.useragent` prop added by useragent middleware
            useragent: t.object({
                isMobile: t.boolean,
                isDesktop: t.boolean,
                browser: t.string,
                os: t.string,
                platform: t.string,
                // ...and more
            }),
        }),
    });
    
    typedRoutes.get('/random-numbers', (req, res) => {
        req.useragent.isMobile;
        res.send([
            Math.random(),
            Math.random(),
            Math.random(),
        ]);
    });
    
    typedRoutes.post('/sum', (req, res) => {
        let result = req.body.reduce((sum, n) => sum + n, 0);
        res.send(result);

    });
    
    typedRoutes.post('/product', (req, res) => {
        let result = req.body.reduce((sum, n) => sum * n, 1);
        res.send(result);
    });

    // Create an Express Application and add middleware to it, including our HTTP schema implementation.
    const app = express();
    app.use(compression());
    app.use(cookieParser());
    app.use(useragent.express());
    app.use(bodyParser.json());
    app.use(typedRoutes);

    // Return an object that allows the caller to start and stop the HTTP server.
    return {
        start() {
            return new Promise<void>(resolve => {
                server = app.listen(8000, () => resolve());
            });
        },
        stop() {
            return new Promise<void>(resolve => {
                server.close(() => resolve());
            });
        },
    };
}


let server: http.Server;