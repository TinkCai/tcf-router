const { DeploymentConfig, EnvConfig } = require('../dist/simulator');
const path = require('path');
const fs = require('fs');
const { TcfFunctionConfig } = require('../dist');
const TcfDeployClient = require('./ci/deploy.client');

const zipper = require('zip-local');
const rimRaf = require('rimraf');
const exec = require('child_process').exec;

const defaultConfig = require('./template/tcf.ci.js');
const args = process.argv.splice(2);

const getConfigFile = async (filePath = '') => {
  if (filePath) {
    const stat = fs.lstatSync(filePath);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(filePath);
      for (const file of files) {
        const fileAbsolutePath = path.join(filePath, file);
        if (
          fs.lstatSync(file).isFile() &&
          (file.endsWith('tcf.ci.json') || file.endsWith('tcf.ci.js'))
        ) {
          return require(fileAbsolutePath);
        }
      }
      throw new Error('no config file found');
    } else {
      return require(filePath);
    }
  } else {
    return defaultConfig;
  }
};

const readFolder = (folderPath) => {
  return new Promise((resolve, reject) => {
    fs.readdir(
      folderPath,
      (err, items) => {
        if (err) {
          reject(err);
        } else {
          resolve(items);
        }
      }
    );
  });
};

const getActiveApp = (functionPath, ciConfig) => {
  return readFolder(functionPath).then((items) => {
    if (items.includes('package.json')) {
      const config = require(`${functionPath}/package.json`);
      if (config.ignore === true
        || (ciConfig.ignoreFuncName && ciConfig.ignoreFuncName.includes(config.name))
        || (ciConfig.focusFuncName && ciConfig.focusFuncName.length > 0 && !ciConfig.focusFuncName.includes(config.name))) {
        return false;
      } else {
        return {
          functionPath: functionPath,
          path: config.webservice?.path,
          name: config.name,
          envVariables: config.envVariables,
          isCompressed: config.isCompressed,
          layers: config.layers,
          runtime: config.runtime,
          devDependencies: config.devDependencies,
          dependencies: config.dependencies,
          functionConfigOnly: config.functionConfigOnly,
          triggers: config.triggers || []
        };
      }
    } else {
      return false;
    }
  });
};

const getApps = async (config) => {
  if (typeof config.appPath === 'string') {
    config.appPath = [config.appPath];
  }
  const appListPromises = [];
  for (const appPath of config.appPath) {
    const folderPath = path.join(args[0], appPath);
    const items = await readFolder(folderPath);
    for (let appName of items) {
      const status = fs.lstatSync(`${folderPath}/${appName}`);
      if (status.isDirectory()) {
        appListPromises.push(getActiveApp(`${folderPath}/${appName}`, config));
      }
    }
  }
  const results = await Promise.all(appListPromises);
  return results.filter((result) => !!result);
};

const formatLayers = (validLayers, layers = []) => {
  const result = [];
  for (const layer of layers) {
    if (layer.version) {
      const vl = validLayers.filter((ele) => {
        return (ele.name === layer.name && ele.version === layer.version);
      });
      if (vl.length === 1) {
        result.push(layer);
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

const getEnvVariables = (set, list = []) => {
  const result = {};
  for (const v of list) {
    if (set[v] !== undefined) {
      result[v] = set[v];
    }
  }
  return result;
};

const executeProcess = async (path, cmd) => {
  return new Promise((resolve, reject) => {
    const subProcess = exec(
      `cd "${path}" && ${cmd}`,
      {
        maxBuffer: 1024 * 2000
      },
      function(err, stdout, stderr) {
        if (err) {
          console.error(err);
          reject(err);
        } else {
          if (stderr) {
            console.error(stderr);
            reject(stderr);
          } else {
            resolve(stdout);
          }
        }
      }
    );
  });
};

const deploy = async (ciConfig, apps, secretId, secretKey, envId, envVariableSet) => {
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
    // compile
    if (typeof app.devDependencies?.typescript === 'string') {
      const result = await executeProcess(app.functionPath, 'tsc');
      console.log(result);
    }
  }

  for (const app of apps) {
    const config = {
      force: true,
      func: {
        name: app.name,
        timeout: app.timeout || 60,
        installDependency: true,
        runtime: app.runtime || 'Nodejs16.13',
        layers: formatLayers(validLayers, app.layers),
        envVariables: getEnvVariables(envVariableSet || defaultConfig.envVariables, app.envVariables),
        triggers: app.triggers
      }
    };
    if (app.functionConfigOnly === true) {
      await client.updateFunctionConfig(config.func);
    } else {
      if (app.isCompressed) {
        rimRaf.sync(`${app.functionPath}/node_modules`);
        const buffer = zipper.sync.zip(app.functionPath).memory();
        config.base64Code = buffer.toString('base64');
      } else {
        config.functionRootPath = path.resolve(app.functionPath, '../');
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
  }
};

const uploadLayers = async (layers, secretId, secretKey, envId) => {
  const client = new TcfDeployClient(secretId, secretKey, envId);
  for (const layer of layers) {
    let layerPath = path.isAbsolute(layer.path) ? layer.path : path.join(args[0], layer.path);
    const items = await readFolder(layerPath);
    if (items.includes('package.json')) {
      const config = require(`${layerPath}/package.json`);
      if (config.devDependencies?.typescript === 'string') {
        await executeProcess(layerPath, 'tsc');
      }
    }
    await client.createLayer(layer.name, layerPath);
  }
};

getConfigFile(args[1]).then(async (config) => {
  if (config.layers && config.layers.length > 0) {
    await uploadLayers(config.layers, config.secretId, config.secretKey, config.envId);
  }
  if (config.appPath) {
    const apps = await getApps(config);
    await deploy(config, apps, config.secretId, config.secretKey, config.envId, config.envVariables);
  }
});
