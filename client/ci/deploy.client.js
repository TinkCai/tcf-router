const CloudBase = require('@cloudbase/manager-node');

/**
 * TCF Deployment Client
 * Wraps CloudBase manager-node API for easier function deployment
 */
class TcfDeployClient {
  /**
   * Create a deployment client
   * @param {string} secretId - Tencent Cloud Secret ID
   * @param {string} secretKey - Tencent Cloud Secret Key
   * @param {string} envId - Environment ID
   */
  constructor(secretId, secretKey, envId) {
    this.client = new CloudBase({
      secretId,
      secretKey,
      envId
    });
    this.envId = envId;
  }

  /**
   * Check if environment exists
   * @returns {Promise<boolean>} True if environment exists
   */
  checkEnvironment() {
    return this.client.env.listEnvs().then((envInfo) => {
      const currentEnv = envInfo.EnvList.filter((envItem) => {
        return envItem.EnvId === this.envId;
      });
      return currentEnv.length === 1;
    });
  }

  /**
   * Get environment information
   * @returns {Promise<object>} Environment info
   */
  async getEnv() {
    const result = await this.client.env.getEnvInfo();
    this.envInfo = result.EnvInfo;
    return result.EnvInfo;
  }

  /**
   * List deployed functions
   * @returns {Promise<void>}
   */
  async listFunctions() {
    return this.client.functions.listFunctions().then((result) => {
      this.deployedFunctions = result;
      this.synchronized = true;
    });
  }

  /**
   * Check if function exists
   * @param {string} functionName - Function name
   * @returns {boolean} True if function exists
   */
  functionExists(functionName) {
    if (this.synchronized) {
      return this.deployedFunctions.indexOf(functionName) > -1;
    }
    return false;
  }

  /**
   * Create a cloud function
   * @param {object} funcParam - Function parameters
   * @returns {Promise<object>} Creation result
   */
  createFunction(funcParam) {
    return this.client.functions.createFunction(funcParam);
  }

  /**
   * Wait for function to be ready
   * @param {string} funcName - Function name
   * @param {number} timer - Wait time in milliseconds
   * @returns {Promise<boolean>} True if function is ready
   */
  waitFunctionReady(funcName, timer = 3000) {
    return new Promise((resolve) => {
      setTimeout(async () => {
        const functionDetail = await this.client.functions.getFunctionDetail(funcName);
        resolve(functionDetail.Status === 'Active');
      }, timer);
    });
  }

  /**
   * Invoke a cloud function with retry
   * @param {string} name - Function name
   * @param {object} params - Invocation parameters
   * @returns {Promise<object>} Invocation result
   */
  async invokeFunction(name, params) {
    for (let i = 0; i < 5; i++) {
      if (await this.waitFunctionReady(name)) {
        return this.client.functions.invokeFunction(name, params);
      }
    }
    throw new Error('invoke failed');
  }

  /**
   * Create function triggers
   * @param {string} functionName - Function name
   * @param {object[]} triggers - Trigger configurations
   * @returns {Promise<void>}
   */
  async createFunctionTriggers(functionName, triggers) {
    for (let i = 0; i < 3; i++) {
      if (await this.waitFunctionReady(functionName, 1)) {
        await this.client.functions.createFunctionTriggers(functionName, triggers);
        break;
      }
    }
  }

  /**
   * Check if database collection exists
   * @param {string} name - Collection name
   * @returns {Promise<boolean>} True if collection exists
   */
  async checkCollectionExists(name) {
    const result = await this.client.database.checkCollectionExists(name);
    return result.Exists;
  }

  /**
   * Create a database collection
   * @param {object} collection - Collection configuration
   * @returns {Promise<void>}
   */
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
    
    console.log('ACL: ' + collection.ACL + ' for ' + collection.name + ' was created.');
  }

  /**
   * List web services
   * @returns {Promise<object[]>} Array of web service configurations
   */
  async listWebService() {
    const result = await this.client.commonService().call({
      Action: 'DescribeCloudBaseGWAPI',
      Param: {
        ServiceId: this.envId
      }
    });
    return result.APISet;
  }

  /**
   * Create a web service
   * @param {string} path - Service path
   * @param {string} cloudFunctionName - Cloud function name
   * @param {boolean} force - Force update if exists
   * @returns {Promise<void>}
   */
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

  /**
   * Create a layer
   * @param {string} name - Layer name
   * @param {string} layerFolderPath - Layer folder path
   * @returns {Promise<object>} Creation result
   */
  async createLayer(name, layerFolderPath) {
    const res = await this.client.functions.createLayer({
      name: name,
      contentPath: layerFolderPath,
      runtimes: ['Nodejs8.9', 'Nodejs10.15', 'Nodejs16.13']
    });
    console.log(`deployed layer ${name}:${res.LayerVersion}`);
  }

  /**
   * List layers
   * @returns {Promise<object>} List of layers
   */
  listLayers() {
    return this.client.functions.listLayers({});
  }

  /**
   * List layer versions
   * @param {string} name - Layer name
   * @returns {Promise<object>} List of layer versions
   */
  listLayerVersions(name) {
    return this.client.functions.listLayerVersions({ name });
  }

  /**
   * Update function configuration
   * @param {object} funcParam - Function configuration parameters
   * @returns {Promise<object>} Update result
   */
  updateFunctionConfig(funcParam) {
    return this.client.functions.updateFunctionConfig(funcParam);
  }
}

module.exports = TcfDeployClient;
