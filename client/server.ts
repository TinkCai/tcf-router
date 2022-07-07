import { TcfApiHandler, TcfApiRequest, Router, Simulator } from '../src';
import * as fs from 'fs';
import * as path from 'path';
import { EnvConfig } from '../src/simulator';

const args = process.argv.splice(2);
const defaultConfig = require('./template/tcf.config.json');
import { pathToRegexp } from 'path-to-regexp';

interface FunctionApp {
  path: string;
  name: string;
  entrance: {
    main: TcfApiHandler;
    createApp: (req: TcfApiRequest, context: Record<string, any>) => Router;
  };
}

const getConfigFile = async (filePath = ''): Promise<EnvConfig> => {
  if (filePath) {
    const stat = fs.lstatSync(filePath);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(filePath);
      for (const file of files) {
        const fileAbsolutePath = path.join(filePath, file);
        if (
          fs.lstatSync(file).isFile() &&
          (file.endsWith('tcf.config.json') || file.endsWith('tcf.config.js'))
        ) {
          return await import(fileAbsolutePath);
        }
      }
      throw new Error('no config file found');
    } else {
      return await import(filePath);
    }
  } else {
    return defaultConfig;
  }
};

const readFolder = (folderPath: string): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    fs.readdir(
      folderPath,
      (err: NodeJS.ErrnoException | null, items: string[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(items);
        }
      }
    );
  });
};

const fileLoader = (filePath: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    import(filePath)
      .then((module) => {
        resolve(module);
      })
      .catch((e: Error) => {
        import(filePath.replace('.js', '.ts'))
          .then((module) => {
            resolve(module);
          })
          .catch((e2: Error) => {
            reject(new Error(e.message + e2.message));
          });
      });
  });
};

const getApps = (config: EnvConfig): Promise<FunctionApp[]> => {
  return new Promise((resolve, reject) => {
    const appListPromises = [] as Promise<FunctionApp | boolean>[];
    const folderPath = path.join(args[0], config.appPath);
    readFolder(folderPath)
      .then((items) => {
        for (let appName of items) {
          const status = fs.lstatSync(`${folderPath}/${appName}`);
          if (status.isDirectory()) {
            appListPromises.push(checkActiveApp(`${folderPath}/${appName}`));
          }
        }
        Promise.all(appListPromises).then((results) => {
          resolve(results.filter((result) => !!result) as FunctionApp[]);
        });
      })
      .catch(reject);
  });
};

const formatHttpsOption = (config: EnvConfig) => {
  let cert, key;
  if (config.devServer?.https) {
    const options = config.devServer?.https as { cert: string; key: string };
    if (path.isAbsolute(options.cert)) {
      cert = options.cert;
    } else {
      cert = path.join(args[0], options.cert);
    }
    if (path.isAbsolute(options.key)) {
      key = options.key;
    } else {
      key = path.join(args[0], options.key);
    }
    return {
      key: fs.readFileSync(key),
      cert: fs.readFileSync(cert)
    };
  } else {
    return {};
  }
};

const checkActiveApp = (appPath: string): Promise<FunctionApp | boolean> => {
  return readFolder(appPath).then((items: string[]) => {
    if (items.includes('package.json')) {
      const config = require(`${appPath}/package.json`);
      if (config.ignore === true) {
        return false;
      } else {
        return fileLoader(`${appPath}/${config.main}`).then((entrance) => {
          return {
            path: config.webservice?.path,
            name: config.name,
            entrance
          };
        });
      }
    } else {
      return false;
    }
  });
};

const findFunctionApp = (functionApps: FunctionApp[], requestPath: string) => {
  const matchedApp = functionApps.filter((app) => {
    const regex = pathToRegexp(`${app.path}(.*)`);
    const result = regex.exec(requestPath);
    return !!result;
  });

  if (matchedApp.length > 1) {
    matchedApp.sort((a, b) => {
      const regexA = pathToRegexp(`${a.path}(.*)`);
      const resultA = regexA.exec(requestPath) as RegExpExecArray;
      const regexB = pathToRegexp(`${b.path}(.*)`);
      const resultB = regexB.exec(requestPath) as RegExpExecArray;
      return resultA[1].length - resultB[1].length;
    });
    return matchedApp[0];
  } else if (matchedApp.length === 1) {
    return matchedApp[0];
  } else {
    return undefined;
  }
};

getConfigFile(args[1]).then((config) => {
  const simulator = new Simulator(config);
  getApps(config).then((apps) => {
    console.log(
      apps.map((app) => {
        return {
          path: app.path,
          name: app.name
        };
      })
    );
    simulator.deploy(
      async (request: TcfApiRequest, context: Record<string, any>) => {
        const app = findFunctionApp(apps, request.path);
        if (app) {
          const newRequest = Object.assign(request);
          let newPath = request.path.replace(app.path, '');
          if (!newPath.startsWith('/')) {
            newPath = '/' + newPath;
          }
          newRequest.path = newPath;
          const newApp = app.entrance.createApp(newRequest, context);
          return newApp.serve();
        } else {
          return {
            statusCode: 404,
            headers: {
              'content-type': 'text/html'
            },
            body: '<h1>no app found</h1>'
          };
        }
      },
      formatHttpsOption(config)
    );
  });
});
