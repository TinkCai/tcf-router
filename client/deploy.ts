import { DeploymentConfig, EnvConfig } from '../src/simulator';
import * as path from 'path';
import * as fs from 'fs';
import { TcfFunctionConfig, TcfDeployClient } from '../src';
import { ICreateFunctionParam } from '@cloudbase/manager-node/types/function';

const zipper = require('zip-local');
const rimRaf = require('rimraf');

const defaultConfig = require('./template/tcf.ci.js');
const args = process.argv.splice(2);

const getConfigFile = async (filePath = ''): Promise<DeploymentConfig> => {
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

const getActiveApp = (appPath: string): Promise<TcfFunctionConfig | boolean> => {
  return readFolder(appPath).then((items: string[]) => {
    if (items.includes('package.json')) {
      const config = require(`${appPath}/package.json`);
      if (config.ignore === true) {
        return false;
      } else {
        return {
          functionPath: appPath,
          path: config.webservice?.path,
          name: config.name,
          envVariables: config.envVariables,
          isCompressed: config.isCompressed,
          layers: config.layers,
          runtime: config.runtime
        };
      }
    } else {
      return false;
    }
  });
};

const getApps = (config: DeploymentConfig): Promise<TcfFunctionConfig[]> => {
  return new Promise((resolve, reject) => {
    const appListPromises = [] as Promise<TcfFunctionConfig | boolean>[];
    const folderPath = path.join(args[0], config.appPath);
    readFolder(folderPath)
      .then((items) => {
        for (let appName of items) {
          const status = fs.lstatSync(`${folderPath}/${appName}`);
          if (status.isDirectory()) {
            appListPromises.push(getActiveApp(`${folderPath}/${appName}`));
          }
        }
        Promise.all(appListPromises).then((results) => {
          resolve(results.filter((result) => !!result) as TcfFunctionConfig[]);
        });
      })
      .catch(reject);
  });
};

const formatLayers = (validLayers: {
  name: string,
  version: number,
  status: string
}[], layers: {
  name: string,
  version?: number
}[]): { name: string, version: number }[] => {
  const result = [] as { name: string, version: number }[];
  for (const layer of layers) {
    if (layer.version) {
      const vl = validLayers.filter((ele) => {
        return (ele.name === layer.name && ele.version === layer.version);
      });
      if (vl.length === 1) {
        result.push(layer as { name: string, version: number });
      } else {
        throw new Error(
          `layer ${layer.name}:${layer.version} does not exist`
        );
      }
    } else {
      const vl = validLayers.filter((ele) => {
        return (ele.name === layer.name);
      });
      if (vl.length > 0) {
        result.push(vl[vl.length - 1]);
      } else {
        throw new Error(`layer ${layer.name} does not exist`);
      }
    }
  }
  return result;
};

const getEnvVariables = (set: Record<string, string>, list: string[])=> {
  const result = {} as Record<string, string>;
  for (const v of list) {
    if (set[v] !== undefined) {
      result[v] = set[v];
    }
  }
  return result;
};

const deploy = async (config: DeploymentConfig,apps: TcfFunctionConfig[], secretId: string, secretKey: string, envId: string, envVariableSet: Record<string, string | number>) => {
  const client = new TcfDeployClient(secretId, secretKey, envId);
  // layer check
  const { Layers } = await client.listLayers();
  const validLayers = Layers.map((layer) => {
    return {
      name: layer.LayerName,
      version: layer.LayerVersion,
      status: layer.Status
    };
  }).filter((layer) => {
    return ['Active', 'Publishing'].includes(layer.status);
  });

  for (const app of apps) {
    const config = {
      force: true,
      func: {
        name: app.name,
        timeout: app.timeout || 60,
        installDependency: true,
        runtime: app.runtime || 'Nodejs10.15',
        layers: formatLayers(validLayers, app.layers),
        envVariables: getEnvVariables(defaultConfig.envVariables, app.envVariables)
      }
    } as ICreateFunctionParam;
    if (app.isCompressed) {
      rimRaf.sync(`${app.functionPath}/node_modules`);
      const buffer = zipper.sync.zip(app.functionPath).memory();
      config.base64Code = buffer.toString('base64');
    } else {
      config.functionRootPath = app.functionPath;
    }
    await client.createFunction(config);
    console.log(`${app.name} OK at ${new Date().toLocaleString()}`);
    if (app.path) {
      await client.createWebService(app.path, app.name);
      console.log(
        `deployed to https://${envId}.service.tcloudbase.com${app.path}.`
      );
    }
  }
};

getConfigFile(args[1]).then((config) => {
  getApps(config).then((apps) => {
    deploy(config, apps, config.secretId, config.secretKey, config.envId, config.envVariables).then(()=> {
      console.log('done');
    });
  });
});
