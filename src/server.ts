import { TcfApiRequest, TcfFunctionApp } from './index';
import { Simulator, EnvConfig } from './simulator';
import * as fs from 'fs';
import * as path from 'path';
import { pathToRegexp } from 'path-to-regexp';
import { ServerOptions } from 'https';

/**
 * Server module for TCF Router
 * Handles configuration loading, app discovery, and request routing
 */

const args = process.argv.slice(2);
const defaultConfig = require('../client/template/tcf.config.json');

/**
 * Load configuration file from specified path
 * @param filePath - Path to config file or directory
 * @returns Promise resolving to EnvConfig
 * @throws Error if no config file found
 */
const getConfigFile = async (filePath = ''): Promise<EnvConfig> => {
  if (filePath) {
    const stat = fs.lstatSync(filePath);

    if (stat.isDirectory()) {
      const files = fs.readdirSync(filePath);
      const configFile = files.find(
        (file) =>
          fs.lstatSync(path.join(filePath, file)).isFile() &&
          (file.endsWith('tcf.config.json') || file.endsWith('tcf.config.js'))
      );

      if (configFile) {
        return await import(path.join(filePath, configFile));
      }
      throw new Error('no config file found');
    }

    return await import(path.resolve(filePath));
  }

  return defaultConfig;
};

/**
 * Read folder contents asynchronously
 * @param folderPath - Path to folder
 * @returns Promise resolving to array of file/folder names
 */
const readFolder = (folderPath: string): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    fs.readdir(folderPath, (err, items) => {
      if (err) {
        reject(err);
      } else {
        resolve(items);
      }
    });
  });
};

/**
 * Load module file (prefers TypeScript over JavaScript)
 * @param filePath - Path to module file
 * @returns Promise resolving to loaded module
 */
const fileLoader = (filePath: string): Promise<any> => {
  const tsFilePath = filePath.replace('.js', '.ts');
  const cwd = path.isAbsolute(filePath) ? '' : process.cwd();

  return new Promise((resolve, reject) => {
    const targetPath = fs.existsSync(tsFilePath)
      ? path.join(cwd, tsFilePath)
      : path.join(cwd, filePath);

    import(targetPath).then(resolve).catch(reject);
  });
};

/**
 * Discover and load all TCF function apps from app directory
 * @param config - Environment configuration
 * @returns Promise resolving to array of TcfFunctionApp instances
 */
const getApps = (config: EnvConfig): Promise<TcfFunctionApp[]> => {
  return new Promise((resolve, reject) => {
    const appListPromises: Promise<TcfFunctionApp | boolean>[] = [];
    const folderPath = path.join(args[0], config.appPath);

    readFolder(folderPath)
      .then((items) => {
        for (const appName of items) {
          const appFullPath = path.join(folderPath, appName);
          const status = fs.lstatSync(appFullPath);

          if (status.isDirectory()) {
            appListPromises.push(checkActiveApp(appFullPath));
          }
        }

        Promise.all(appListPromises).then((results) => {
          resolve(
            results.filter((result): result is TcfFunctionApp => !!result)
          );
        });
      })
      .catch(reject);
  });
};

/**
 * Format HTTPS options from configuration
 * @param config - Environment configuration
 * @returns HTTPS server options or empty object
 */
const formatHttpsOption = (config: EnvConfig): ServerOptions => {
  if (!config.devServer?.https) {
    return {};
  }

  const httpsConfig = config.devServer.https as { cert?: string; key?: string };

  if (!httpsConfig.cert || !httpsConfig.key) {
    return {};
  }

  const certPath = path.isAbsolute(httpsConfig.cert)
    ? httpsConfig.cert
    : path.join(args[0], httpsConfig.cert);

  const keyPath = path.isAbsolute(httpsConfig.key)
    ? httpsConfig.key
    : path.join(args[0], httpsConfig.key);

  return {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath)
  };
};

/**
 * Check if app is active and load it
 * @param appPath - Path to app directory
 * @returns Promise resolving to TcfFunctionApp or false if inactive
 */
const checkActiveApp = async (
  appPath: string
): Promise<TcfFunctionApp | false> => {
  const items = await readFolder(appPath);

  if (!items.includes('package.json')) {
    return false;
  }

  const packageContent = fs.readFileSync(
    path.join(appPath, 'package.json'),
    'utf-8'
  );
  const config = JSON.parse(packageContent);

  if (config.ignore === true) {
    return false;
  }

  const entrance = await fileLoader(path.join(appPath, config.main));

  return {
    path: config.webservice?.path,
    name: config.name,
    entrance
  };
};

/**
 * Find matching function app for given request path
 * @param functionApps - Array of available function apps
 * @param requestPath - Request path to match
 * @returns Matching TcfFunctionApp or undefined
 */
const findFunctionApp = (
  functionApps: TcfFunctionApp[],
  requestPath: string
): TcfFunctionApp | undefined => {
  const matches = functionApps
    .map((app) => {
      const regex = pathToRegexp(`${app.path}(.*)`);
      const result = regex.exec(requestPath);
      return { app, result, match: !!result };
    })
    .filter(({ match }) => match);

  if (matches.length === 0) {
    return undefined;
  }

  if (matches.length === 1) {
    return matches[0].app;
  }

  // Sort by specificity (shorter captured path = more specific)
  matches.sort((a, b) => {
    const lenA = (a.result as RegExpExecArray)[1].length;
    const lenB = (b.result as RegExpExecArray)[1].length;
    return lenA - lenB;
  });

  return matches[0].app;
};

/**
 * Initialize and start the TCF router server
 */
(async () => {
  try {
    const config = await getConfigFile(args[0]);
    const simulator = new Simulator(config);
    const apps = await getApps(config);

    console.log(
      apps.map((app) => ({
        path: app.path,
        name: app.name
      }))
    );

    simulator.deploy(
      async (request: TcfApiRequest, context: Record<string, any>) => {
        const app = findFunctionApp(apps, request.path);

        if (!app) {
          return {
            statusCode: 404,
            headers: {
              'content-type': 'text/html'
            },
            body: '<h1>no app found</h1>'
          };
        }

        const newRequest = { ...request };
        let newPath = request.path.replace(app.path, '');

        if (!newPath.startsWith('/')) {
          newPath = '/' + newPath;
        }

        newRequest.path = newPath;

        if (typeof app.entrance.main === 'function') {
          return app.entrance.main(newRequest, context);
        }

        const newApp = app.entrance.createApp(newRequest, context);
        return newApp.serve();
      },
      formatHttpsOption(config)
    );
  } catch (error) {
    console.error(
      'Failed to start server:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
})();
