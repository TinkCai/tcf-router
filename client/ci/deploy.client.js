const CloudBase = require('@cloudbase/manager-node');

// deploy Functions
class TcfDeployClient {
  constructor(secretId, secretKey, envId) {
    this.client = new CloudBase({
      secretId, secretKey, envId
    });
    this.envId = envId;
  }

  checkEnvironment() {
    return this.client.env.listEnvs().then((envInfo) => {
      const currentEnv = envInfo.EnvList.filter((envItem) => {
        return envItem.EnvId === this.envId;
      });
      return currentEnv.length === 1;
    });
  }

  async getEnv() {
    const result = await this.client.env.getEnvInfo();
    this.envInfo = result.EnvInfo;
    return result.EnvInfo;
  }

  async listFunctions() {
    return this.client.functions.listFunctions().then((result) => {
      this.deployedFunctions = result;
      this.synchronized = true;
    });
  }

  functionExists(functionName) {
    if (this.synchronized) {
      return this.deployedFunctions.indexOf(functionName) > -1;
    } else {
      return false;
    }
  }

  createFunction(funcParam) {
    return this.client.functions.createFunction(funcParam);
  }

  waitFunctionReady(funcName, timer = 3000) {
    return new Promise((resolve) => {
      setTimeout(async () => {
        let functionDetail = await this.client.functions.getFunctionDetail(
          funcName
        );
        if (functionDetail.Status === 'Active') {
          resolve(true);
        } else {
          resolve(false);
        }
      }, timer);
    });
  }

  async invokeFunction(name, params) {
    for (let i = 0; i < 5; i++) {
      if (await this.waitFunctionReady(name)) {
        return this.client.functions.invokeFunction(name, params);
      }
    }
    throw new Error('invoke failed');
  }

  async createFunctionTriggers(functionName, triggers) {
    for (let i = 0; i < 3; i++) {
      if (await this.waitFunctionReady(functionName, 1)) {
        await this.client.functions.createFunctionTriggers(
          functionName,
          triggers
        );
        break;
      }
    }
  }

  async checkCollectionExists(name) {
    const result = await this.client.database.checkCollectionExists(name);
    return result.Exists;
  }

  async createCollection(collection) {
    if (!(await this.checkCollectionExists(collection.name))) {
      await this.client.database.createCollection(collection.name);
      console.log('Collection: ' + collection.name + ' is created.');
    } else {
      console.debug('Collection: ' + collection.name + ' is existed.');
    }
    await this.client.commonService().call({
      Action: 'ModifyDatabaseACL',
      Param: {
        CollectionName: collection.name,
        EnvId: this.envId,
        AclTag: collection.ACL
      }
    });
    console.log(
      'ACL: ' + collection.ACL + ' for ' + collection.name + ' was created.'
    );
  }

  async listWebService() {
    const result = await this.client.commonService().call({
      Action: 'DescribeCloudBaseGWAPI',
      Param: {
        ServiceId: this.envId
      }
    });
    return result.APISet;
  }

  async createWebService(path, cloudFunctionName, force = false) {
    const set = await this.listWebService();
    const duplicatedGates = set.filter((route) => {
      return route.Path === path && route.Name === cloudFunctionName;
    });
    if (duplicatedGates.length === 0 || force) {
      await this.client.commonService().call({
        Action: 'CreateCloudBaseGWAPI',
        Param: {
          ServiceId: this.envId,
          Path: path,
          Type: 1,
          Name: cloudFunctionName
        }
      });
    }
  }

  async createLayer(name, layerFolderPath) {
    const res = await this.client.functions.createLayer({
      name: name,
      contentPath: layerFolderPath,
      runtimes: ['Nodejs8.9', 'Nodejs10.15']
    });
    console.log(`deployed layer ${name}:${res.LayerVersion}`);
  }

  listLayers() {
    return this.client.functions.listLayers({});
  }

  listLayerVersions(name) {
    return this.client.functions.listLayerVersions({ name });
  }
}

module.exports = TcfDeployClient;
